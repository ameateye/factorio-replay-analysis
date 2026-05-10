import {
  EntityPrototypeFilterWrite,
  ItemFilter,
  LuaEntity,
  MapPosition,
  OnBuiltEntityEvent,
  OnEntityDiedEvent,
  OnEntitySettingsPastedEvent,
  OnGuiClosedEvent,
  OnPlayerRotatedEntityEvent,
  OnPrePlayerMinedItemEvent,
  OnRobotBuiltEntityEvent,
  OnRobotPreMinedEvent,
  ScriptRaisedBuiltEvent,
  UnitNumber,
} from "factorio:runtime"
import { DataCollector, EventHandlers } from "../data-collector"
import { getTick } from "../tick"

type EntityCategory = "belt" | "inserter" | "pole"
type BeltSubtype = "transport-belt" | "underground-belt" | "splitter"
type Priority = "left" | "none" | "right"
type FilterMode = "whitelist" | "blacklist"

// One post-build state change. Either a rotation (direction + optional
// beltToGroundType for UG flips), a splitter-config change, or an
// inserter-filter change. A single mutation only carries the fields that
// actually changed; downstream readers fold mutations forward in tick
// order to recover state at time T.
//
// splitterFilter uses "" to mean "filter cleared" — Factorio item names are
// non-empty kebab-case so empty string is a safe sentinel. Inserter filters
// use an empty array to mean "all slots cleared".
interface MutationEvent {
  tick: number
  direction?: number
  beltToGroundType?: "input" | "output"
  splitterInputPriority?: Priority
  splitterOutputPriority?: Priority
  splitterFilter?: string
  inserterUseFilters?: boolean
  inserterFilterMode?: FilterMode
  inserterFilters?: string[]
}

interface LayoutEntity {
  name: string
  unitNumber: number
  category: EntityCategory
  beltType?: BeltSubtype
  location: MapPosition
  direction: number
  timeBuilt: number
  timeRemoved?: number
  // Underground belts only — initial state at build (rotation flips it).
  beltToGroundType?: "input" | "output"
  // Splitters only — initial state at build.
  splitterInputPriority?: Priority
  splitterOutputPriority?: Priority
  splitterFilter?: string
  // Inserters only — initial state at build. inserterFilterMode distinguishes
  // whitelist (only allow listed items) from blacklist (allow everything
  // except listed). Filters are inactive when inserterUseFilters is false.
  inserterUseFilters?: boolean
  inserterFilterMode?: FilterMode
  inserterFilters?: string[]
  mutations?: MutationEvent[]
}

export interface EntityLayoutData {
  entities: LayoutEntity[]
}

const FILTERS: EntityPrototypeFilterWrite[] = [
  { filter: "type", type: "transport-belt" },
  { filter: "type", type: "underground-belt", mode: "or" },
  { filter: "type", type: "splitter", mode: "or" },
  { filter: "type", type: "inserter", mode: "or" },
  { filter: "type", type: "electric-pole", mode: "or" },
]

const TYPE_TO_CATEGORY: Record<string, EntityCategory> = {
  "transport-belt": "belt",
  "underground-belt": "belt",
  "splitter": "belt",
  "inserter": "inserter",
  "electric-pole": "pole",
}

// ItemFilter.name is typed as LuaItemPrototype by typed-factorio, but Factorio's
// ItemID union is actually `string | LuaItemPrototype | LuaItemStack | LuaItem`,
// and at runtime get_filter / splitter_filter return the plain string form. The
// userdata branch is kept defensively in case the runtime ever returns one.
function itemIdToName(id: unknown): string | undefined {
  if (id == nil) return undefined
  if (typeof id === "string") return id
  const n = (id as { name?: unknown }).name
  if (typeof n === "string") return n
  return undefined
}

function readSplitterFilterName(entity: LuaEntity): string | undefined {
  const f = entity.splitter_filter
  if (f == nil) return undefined
  if (typeof f === "string") return f
  return itemIdToName(f.name)
}

function readInserterFilters(entity: LuaEntity): string[] {
  const slots = entity.filter_slot_count
  const result: string[] = []
  for (const i of $range(1, slots)) {
    const f = entity.get_filter(i) as ItemFilter | undefined
    if (f == nil) continue
    if (typeof f === "string") {
      result.push(f)
    } else {
      const name = itemIdToName(f.name)
      if (name != undefined) result.push(name)
    }
  }
  return result
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length != b.length) return false
  for (const i of $range(0, a.length - 1)) {
    if (a[i] != b[i]) return false
  }
  return true
}

export default class EntityLayout implements DataCollector<EntityLayoutData>, EventHandlers {
  manifest = {
    schemaVersion: 1,
    description:
      "Belts, splitters, undergrounds, inserters, and electric poles — built/removed timing plus post-build mutations (rotations, splitter config, inserter filters).",
  }

  prototypes = new LuaSet<string>()
  entityData: Record<UnitNumber, LayoutEntity> = {}

  on_init() {
    for (const [name] of prototypes.get_entity_filtered(FILTERS)) {
      this.prototypes.add(name)
    }
  }

  // Catch-all for implicit deconstructs (fast-replace, splitter overlapping
  // two existing belts, build-on-top-of-belt). The standard mined events
  // typically fire for fast-replace, but checking the new entity's bounding
  // box against tracked positions catches any case those miss — and the
  // splitter-over-two-belts case which doesn't always fire mined events.
  private markOverbuiltAt(newEntity: LuaEntity, newUnitNumber: UnitNumber): void {
    const box = newEntity.bounding_box
    const inset = 0.1
    const minX = box.left_top.x + inset
    const maxX = box.right_bottom.x - inset
    const minY = box.left_top.y + inset
    const maxY = box.right_bottom.y - inset
    const tick = getTick()
    for (const [, data] of pairs(this.entityData)) {
      if (data.unitNumber == newUnitNumber) continue
      if (data.timeRemoved != undefined) continue
      const px = data.location.x
      const py = data.location.y
      if (px > minX && px < maxX && py > minY && py < maxY) {
        data.timeRemoved = tick
      }
    }
  }

  private onCreated(entity: LuaEntity) {
    const unitNumber = entity.unit_number
    if (!unitNumber || !this.prototypes.has(entity.name)) return
    const category = TYPE_TO_CATEGORY[entity.type]
    if (!category) return

    this.markOverbuiltAt(entity, unitNumber)

    const record: LayoutEntity = {
      name: entity.name,
      unitNumber,
      category,
      location: entity.position,
      direction: entity.direction,
      timeBuilt: getTick(),
    }
    if (category == "belt") {
      const beltType = entity.type as BeltSubtype
      record.beltType = beltType
      if (beltType == "underground-belt") {
        record.beltToGroundType = entity.belt_to_ground_type
      } else if (beltType == "splitter") {
        record.splitterInputPriority = entity.splitter_input_priority
        record.splitterOutputPriority = entity.splitter_output_priority
        const filter = readSplitterFilterName(entity)
        if (filter != undefined) record.splitterFilter = filter
      }
    } else if (category == "inserter") {
      record.inserterUseFilters = entity.use_filters
      const mode = entity.inserter_filter_mode
      if (mode != undefined) record.inserterFilterMode = mode
      record.inserterFilters = readInserterFilters(entity)
    }
    this.entityData[unitNumber] = record
  }

  private onRemoved(entity: LuaEntity) {
    const unitNumber = entity.unit_number
    if (!unitNumber) return
    const data = this.entityData[unitNumber]
    if (!data) return
    if (data.timeRemoved == undefined) data.timeRemoved = getTick()
  }

  private appendMutation(data: LayoutEntity, mutation: MutationEvent) {
    if (!data.mutations) data.mutations = []
    data.mutations.push(mutation)
  }

  // Folds the initial state + all prior mutations to the current splitter
  // config, used to suppress no-op mutation events.
  private latestSplitterState(data: LayoutEntity): { input: Priority; output: Priority; filter: string } {
    let input: Priority = data.splitterInputPriority ?? "none"
    let output: Priority = data.splitterOutputPriority ?? "none"
    let filter: string = data.splitterFilter ?? ""
    if (data.mutations) {
      for (const m of data.mutations) {
        if (m.splitterInputPriority != undefined) input = m.splitterInputPriority
        if (m.splitterOutputPriority != undefined) output = m.splitterOutputPriority
        if (m.splitterFilter != undefined) filter = m.splitterFilter
      }
    }
    return { input, output, filter }
  }

  private snapshotSplitterIfChanged(data: LayoutEntity, entity: LuaEntity) {
    if (data.beltType != "splitter") return
    const inputPrio = entity.splitter_input_priority
    const outputPrio = entity.splitter_output_priority
    const filter = readSplitterFilterName(entity) ?? ""
    const last = this.latestSplitterState(data)
    const dInput = inputPrio != last.input
    const dOutput = outputPrio != last.output
    const dFilter = filter != last.filter
    if (!dInput && !dOutput && !dFilter) return
    const mutation: MutationEvent = { tick: getTick() }
    if (dInput) mutation.splitterInputPriority = inputPrio
    if (dOutput) mutation.splitterOutputPriority = outputPrio
    if (dFilter) mutation.splitterFilter = filter
    this.appendMutation(data, mutation)
  }

  private latestInserterState(data: LayoutEntity): {
    useFilters: boolean
    mode: FilterMode | undefined
    filters: string[]
  } {
    let useFilters: boolean = data.inserterUseFilters ?? false
    let mode: FilterMode | undefined = data.inserterFilterMode
    let filters: string[] = data.inserterFilters ?? []
    if (data.mutations) {
      for (const m of data.mutations) {
        if (m.inserterUseFilters != undefined) useFilters = m.inserterUseFilters
        if (m.inserterFilterMode != undefined) mode = m.inserterFilterMode
        if (m.inserterFilters != undefined) filters = m.inserterFilters
      }
    }
    return { useFilters, mode, filters }
  }

  private snapshotInserterIfChanged(data: LayoutEntity, entity: LuaEntity) {
    if (data.category != "inserter") return
    const useFilters = entity.use_filters
    const mode = entity.inserter_filter_mode
    const filters = readInserterFilters(entity)
    const last = this.latestInserterState(data)
    const dUse = useFilters != last.useFilters
    const dMode = mode != last.mode
    const dFilters = !arraysEqual(filters, last.filters)
    if (!dUse && !dMode && !dFilters) return
    const mutation: MutationEvent = { tick: getTick() }
    if (dUse) mutation.inserterUseFilters = useFilters
    if (dMode && mode != undefined) mutation.inserterFilterMode = mode
    if (dFilters) mutation.inserterFilters = filters
    this.appendMutation(data, mutation)
  }

  on_built_entity(event: OnBuiltEntityEvent) {
    this.onCreated(event.entity)
  }
  on_robot_built_entity(event: OnRobotBuiltEntityEvent) {
    this.onCreated(event.entity)
  }
  script_raised_built(event: ScriptRaisedBuiltEvent) {
    this.onCreated(event.entity)
  }
  on_pre_player_mined_item(event: OnPrePlayerMinedItemEvent) {
    this.onRemoved(event.entity)
  }
  on_robot_pre_mined(event: OnRobotPreMinedEvent) {
    this.onRemoved(event.entity)
  }
  on_entity_died(event: OnEntityDiedEvent) {
    this.onRemoved(event.entity)
  }

  on_player_rotated_entity(event: OnPlayerRotatedEntityEvent) {
    const entity = event.entity
    if (!entity.valid) return
    const unitNumber = entity.unit_number
    if (!unitNumber) return
    const data = this.entityData[unitNumber]
    if (!data) return
    const mutation: MutationEvent = { tick: getTick(), direction: entity.direction }
    if (data.beltType == "underground-belt") {
      mutation.beltToGroundType = entity.belt_to_ground_type
    }
    this.appendMutation(data, mutation)
  }

  on_gui_closed(event: OnGuiClosedEvent) {
    const entity = event.entity
    if (!entity || !entity.valid) return
    const unitNumber = entity.unit_number
    if (!unitNumber) return
    const data = this.entityData[unitNumber]
    if (!data) return
    if (data.beltType == "splitter") {
      this.snapshotSplitterIfChanged(data, entity)
    } else if (data.category == "inserter") {
      this.snapshotInserterIfChanged(data, entity)
    }
  }

  on_entity_settings_pasted(event: OnEntitySettingsPastedEvent) {
    const entity = event.destination
    if (!entity || !entity.valid) return
    const unitNumber = entity.unit_number
    if (!unitNumber) return
    const data = this.entityData[unitNumber]
    if (!data) return
    if (data.beltType == "splitter") {
      this.snapshotSplitterIfChanged(data, entity)
    } else if (data.category == "inserter") {
      this.snapshotInserterIfChanged(data, entity)
    }
  }

  exportData(): EntityLayoutData {
    const entities: LayoutEntity[] = []
    for (const [, data] of pairs(this.entityData)) {
      entities.push(data)
    }
    return { entities }
  }
}

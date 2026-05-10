import {
  EntityPrototypeFilterWrite,
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

// One post-build state change. Either a rotation (direction + optional
// beltToGroundType for UG flips) or a splitter-config change. A single
// mutation only carries the fields that actually changed; downstream
// readers fold mutations forward in tick order to recover state at time T.
//
// splitterFilter uses "" to mean "filter cleared" — Factorio item names are
// non-empty kebab-case so empty string is a safe sentinel.
interface MutationEvent {
  tick: number
  direction?: number
  beltToGroundType?: "input" | "output"
  splitterInputPriority?: Priority
  splitterOutputPriority?: Priority
  splitterFilter?: string
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

function readSplitterFilterName(entity: LuaEntity): string | undefined {
  const f = entity.splitter_filter
  if (f == nil) return undefined
  if (typeof f === "string") return f
  const name = f.name
  if (name == nil) return undefined
  return name.name
}

export default class EntityLayout implements DataCollector<EntityLayoutData>, EventHandlers {
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
    if (!data || data.beltType != "splitter") return
    this.snapshotSplitterIfChanged(data, entity)
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

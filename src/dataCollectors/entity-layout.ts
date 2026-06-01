import {
  BoundingBox,
  EntityPrototypeFilterWrite,
  ItemFilter,
  LuaEntity,
  LuaSurface,
  MapPosition,
  OnBuiltEntityEvent,
  OnEntityDiedEvent,
  OnEntitySettingsPastedEvent,
  OnGuiClosedEvent,
  OnPlayerRotatedEntityEvent,
  OnPreGhostDeconstructedEvent,
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
  // Belt-category snapshots (re-recorded when nearby entities are built /
  // removed / rotated). beltInputs / beltOutputs are sorted unit_number
  // arrays from belt_neighbours.{inputs,outputs}; empty array = no connection
  // on that side. undergroundPair is the paired UG entity's unit_number for
  // underground-belts only; 0 = unpaired.
  beltInputs?: number[]
  beltOutputs?: number[]
  undergroundPair?: number
}

interface LayoutEntity {
  name: string
  unitNumber: number
  category: EntityCategory
  // Entity-ghost (not yet revived). Ghost belts still participate in the engine
  // belt graph — they sideload and are reported in real neighbours'
  // belt_neighbours — so they're tracked to record both the connection AND its
  // removal. Without tracking, a cancelled ghost leaves a stale neighbour
  // reference on the real entity. Only belt-category ghosts are tracked;
  // consumers wanting material flow only can filter on this flag. name/beltType
  // carry the would-be real prototype. Absent on real entities.
  ghost?: boolean
  beltType?: BeltSubtype
  location: MapPosition
  direction: number
  timeBuilt: number
  timeRemoved?: number
  // Death + bot-revive cycles. Factorio preserves unit_number across the
  // ghost-revive cycle (so wires / station references survive a biter
  // attack), and consumers should treat the entity as continuously existing
  // — but the gap is recorded here for analytics that care.
  revivals?: { died: number; revived: number }[]
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
  // Belts only — runtime adjacency at build time. beltInputs / beltOutputs
  // are sorted unit_number arrays from belt_neighbours; undergroundPair is
  // the paired entity for UGs (0 = unpaired). These reflect Factorio's own
  // belt graph (turns, sideloads, splitter sides, UG pairings) and can shift
  // post-build as neighbouring entities are added or removed — later states
  // are folded forward via mutations[].
  beltInputs?: number[]
  beltOutputs?: number[]
  undergroundPair?: number
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
  splitter: "belt",
  inserter: "inserter",
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

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length != b.length) return false
  for (const i of $range(0, a.length - 1)) {
    if (a[i] != b[i]) return false
  }
  return true
}

function anyInSet(arr: number[], set: LuaSet<number>): boolean {
  for (const x of arr) {
    if (set.has(x)) return true
  }
  return false
}

export default class EntityLayout implements DataCollector<EntityLayoutData>, EventHandlers {
  manifest = {
    schemaVersion: 4,
    description:
      "Belts, splitters, undergrounds, inserters, and electric poles — built/removed timing, runtime belt-graph snapshots (belt neighbours, UG pairs), post-build mutations (rotations, splitter config, inserter filters), and death/revive cycles (biter kill → bot-revived ghost; unit_number is preserved by Factorio across the cycle). Belt-category ghosts are tracked too (flagged ghost:true) because they participate in the belt graph (sideloads, neighbour reports); their connection and its removal are recorded so real entities don't keep stale neighbour references after a ghost is cancelled or revived.",
  }

  prototypes = new LuaSet<string>()
  entityData: Record<UnitNumber, LayoutEntity> = {}
  // Latest-known belt adjacency per unit_number. Used by the rescan filter
  // to answer "was this candidate previously related to the trigger" in O(1)
  // without folding mutation history. Updated on every emission. Not exported.
  adjCache: Record<number, { inputs: number[]; outputs: number[]; pair: number }> = {}
  // Last-emitted splitter / inserter config per unit_number — drives "did this
  // change?" detection on on_gui_closed / on_entity_settings_pasted without
  // folding mutation history. Seeded in onCreated, updated on each emission.
  splitterConfigCache: Record<number, { input: Priority; output: Priority; filter: string }> = {}
  inserterConfigCache: Record<number, { useFilters: boolean; mode: FilterMode | undefined; filters: string[] }> = {}

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
  // Returns the uids that were tombstoned, so the caller's cascade can also
  // re-snapshot their (now-orphaned) cached neighbours.
  private markOverbuiltAt(newEntity: LuaEntity, newUnitNumber: UnitNumber): number[] {
    const b = newEntity.bounding_box
    const inset = 0.1
    const overbuilt: number[] = []
    for (const [, data] of pairs(this.entityData)) {
      if (data.unitNumber == newUnitNumber) continue
      if (data.timeRemoved != undefined) continue
      const p = data.location
      if (
        p.x > b.left_top.x + inset &&
        p.x < b.right_bottom.x - inset &&
        p.y > b.left_top.y + inset &&
        p.y < b.right_bottom.y - inset
      ) {
        this.setTimeRemoved(data)
        overbuilt.push(data.unitNumber)
      }
    }
    return overbuilt
  }

  private onCreated(entity: LuaEntity) {
    const unitNumber = entity.unit_number
    if (!unitNumber) return
    // Ghosts report their would-be prototype via ghost_type / ghost_name; real
    // entities use type / name directly. (ghost_type / ghost_name error if read
    // on a non-ghost, so they're only touched behind isGhost.)
    const isGhost = entity.type == "entity-ghost"
    const realType = isGhost ? entity.ghost_type : entity.type
    const realName = isGhost ? entity.ghost_name : entity.name
    const category = TYPE_TO_CATEGORY[realType]
    if (!category) return
    // Real entities gate on the tracked-prototype set. Ghosts are tracked only
    // when belt-category — belt ghosts affect the belt graph (and orphan
    // neighbour references when removed), whereas inserter / pole ghosts
    // contribute no adjacency this collector records.
    if (isGhost) {
      if (category != "belt") return
    } else if (!this.prototypes.has(entity.name)) {
      return
    }

    // Revive path: Factorio's death→ghost→bot-revive cycle preserves the
    // entity's unit_number so circuit wires / station references survive
    // a biter attack. If we already have a tombstoned record at this uid
    // with matching identity, this is a revive — preserve the original
    // timeBuilt and record the gap in revivals[].
    const existing = this.entityData[unitNumber]
    if (existing != undefined) {
      const p = entity.position
      const sameIdentity = existing.name == entity.name && existing.location.x == p.x && existing.location.y == p.y
      if (sameIdentity && existing.timeRemoved != undefined) {
        if (!existing.revivals) existing.revivals = []
        existing.revivals.push({ died: existing.timeRemoved, revived: getTick() })
        existing.timeRemoved = undefined
        // Belt graph is re-evaluated by the engine on revive; capture the
        // post-revive adjacency as a mutation so consumers can fold it
        // forward like any other graph change.
        if (existing.category == "belt") {
          const adj = this.readBeltAdjacency(entity)
          const m: MutationEvent = { tick: getTick(), beltInputs: adj.inputs, beltOutputs: adj.outputs }
          if (existing.beltType == "underground-belt") m.undergroundPair = adj.pair
          this.appendMutation(existing, m)
          this.adjCache[unitNumber] = adj
          this.rescanArea(entity.surface, entity)
        }
        return
      }
      // Identity mismatch or duplicate-while-alive: shouldn't happen under
      // Factorio's invariants (unit_numbers are unique, and a uid we already
      // hold should only re-enter via the revive path above). Log and fall
      // through to overwrite so we don't silently lose the new entity.
      log(
        `[WARN] EntityLayout: unexpected duplicate onCreated tick=${getTick()} u=${unitNumber} ${entity.name} @ (${p.x},${p.y}) ` +
          `existing: name=${existing.name} loc=(${existing.location.x},${existing.location.y}) ` +
          `timeBuilt=${existing.timeBuilt} timeRemoved=${existing.timeRemoved ?? "nil"} ` +
          `sameIdentity=${sameIdentity}`,
      )
    }

    // A real build can revive / overbuild a tracked ghost at the same tile;
    // markOverbuiltAt tombstones that ghost record so neighbours migrate off the
    // ghost uid. A ghost build overbuilds nothing, so skip the scan.
    const overbuiltUids = isGhost ? [] : this.markOverbuiltAt(entity, unitNumber)

    const record: LayoutEntity = {
      name: realName,
      unitNumber,
      category,
      location: entity.position,
      direction: entity.direction,
      timeBuilt: getTick(),
    }
    if (isGhost) record.ghost = true
    if (category == "belt") {
      const beltType = realType as BeltSubtype
      record.beltType = beltType
      // Ghosts aren't functional yet and don't expose UG type / splitter config
      // the way real belts do — capture only their adjacency. Real belts capture
      // full initial state.
      if (!isGhost) {
        if (beltType == "underground-belt") {
          record.beltToGroundType = entity.belt_to_ground_type
        } else if (beltType == "splitter") {
          record.splitterInputPriority = entity.splitter_input_priority
          record.splitterOutputPriority = entity.splitter_output_priority
          const filter = readSplitterFilterName(entity)
          if (filter != undefined) record.splitterFilter = filter
          this.splitterConfigCache[unitNumber] = {
            input: record.splitterInputPriority ?? "none",
            output: record.splitterOutputPriority ?? "none",
            filter: record.splitterFilter ?? "",
          }
        }
      }
      const adj = this.readBeltAdjacency(entity)
      record.beltInputs = adj.inputs
      record.beltOutputs = adj.outputs
      if (beltType == "underground-belt") record.undergroundPair = adj.pair
      this.adjCache[unitNumber] = adj
    } else if (category == "inserter") {
      record.inserterUseFilters = entity.use_filters
      const mode = entity.inserter_filter_mode
      if (mode != undefined) record.inserterFilterMode = mode
      record.inserterFilters = readInserterFilters(entity)
      this.inserterConfigCache[unitNumber] = {
        useFilters: record.inserterUseFilters ?? false,
        mode: record.inserterFilterMode,
        filters: record.inserterFilters ?? [],
      }
    }
    this.entityData[unitNumber] = record
    // Only belt-category builds shift other entities' belt-graph state.
    // Inserter and pole builds only affect the entity itself, whose initial
    // fields were captured just above. The overbuilt uids ride along so the
    // cache half of the filter catches their (now-orphaned) neighbours.
    if (category == "belt") {
      this.rescanArea(entity.surface, entity, overbuiltUids)
    }
  }

  // Tombstones ε and cascades to its neighbours if ε is belt-category.
  // Handles mine / robot-mine / die — Factorio destroys ε after the event,
  // so belt_neighbours / pickup_target / drop_target are still readable
  // here. Fast-replace fires standard mine + build events; any path that
  // skips the mine event is caught by markOverbuiltAt on the new entity.
  private onRemoved(entity: LuaEntity) {
    if (!entity.valid) return
    const unitNumber = entity.unit_number
    if (unitNumber == undefined) return
    const data = this.entityData[unitNumber]
    if (!data) {
      // Remove event for a uid we never recorded a build for. Under Factorio's
      // invariants this shouldn't happen for prototypes we track; log so we
      // notice if a new build event path slips through the filter.
      if (this.prototypes.has(entity.name)) {
        const p = entity.position
        log(
          `[WARN] EntityLayout: onRemoved for untracked entity tick=${getTick()} u=${unitNumber} ${entity.name} @ (${p.x},${p.y})`,
        )
      }
      return
    }
    this.setTimeRemoved(data)
    if (data.category == "belt") this.rescanArea(entity.surface, entity)
  }

  // Shared with markOverbuiltAt — both paths mark a tracked entity as removed
  // by setting timeRemoved on its record. onRemoved arrives via a LuaEntity
  // reference (needs unit_number lookup); markOverbuiltAt arrives with the
  // record directly.
  private setTimeRemoved(data: LayoutEntity) {
    if (data.timeRemoved == undefined) data.timeRemoved = getTick()
  }

  private appendMutation(data: LayoutEntity, mutation: MutationEvent) {
    if (!data.mutations) data.mutations = []
    data.mutations.push(mutation)
  }

  // Fold mutations forward to recover an entity's current direction /
  // beltToGroundType. Used by rescanArea to detect a UG mouth whose
  // orientation flipped as a side effect of the *partner* mouth being
  // rotated: Factorio fires on_player_rotated_entity only for the rotated
  // mouth, so the partner's flip is otherwise unrecorded.
  private currentOrientation(data: LayoutEntity): { direction: number; btg: "input" | "output" | undefined } {
    let direction = data.direction
    let btg = data.beltToGroundType
    if (data.mutations) {
      for (const m of data.mutations) {
        if (m.direction != undefined) direction = m.direction
        if (m.beltToGroundType != undefined) btg = m.beltToGroundType
      }
    }
    return { direction, btg }
  }

  private snapshotSplitterIfChanged(data: LayoutEntity, entity: LuaEntity) {
    if (data.beltType != "splitter") return
    const last = this.splitterConfigCache[data.unitNumber]
    if (last == undefined) return
    const cur = {
      input: entity.splitter_input_priority,
      output: entity.splitter_output_priority,
      filter: readSplitterFilterName(entity) ?? "",
    }
    const dInput = cur.input != last.input
    const dOutput = cur.output != last.output
    const dFilter = cur.filter != last.filter
    if (!dInput && !dOutput && !dFilter) return
    const m: MutationEvent = { tick: getTick() }
    if (dInput) m.splitterInputPriority = cur.input
    if (dOutput) m.splitterOutputPriority = cur.output
    if (dFilter) m.splitterFilter = cur.filter
    this.appendMutation(data, m)
    this.splitterConfigCache[data.unitNumber] = cur
  }

  private snapshotInserterIfChanged(data: LayoutEntity, entity: LuaEntity) {
    if (data.category != "inserter") return
    const last = this.inserterConfigCache[data.unitNumber]
    if (last == undefined) return
    const cur = {
      useFilters: entity.use_filters,
      mode: entity.inserter_filter_mode,
      filters: readInserterFilters(entity),
    }
    const dUse = cur.useFilters != last.useFilters
    const dMode = cur.mode != last.mode
    const dFilters = !arraysEqual(cur.filters, last.filters)
    if (!dUse && !dMode && !dFilters) return
    const m: MutationEvent = { tick: getTick() }
    if (dUse) m.inserterUseFilters = cur.useFilters
    if (dMode && cur.mode != undefined) m.inserterFilterMode = cur.mode
    if (dFilters) m.inserterFilters = cur.filters
    this.appendMutation(data, m)
    this.inserterConfigCache[data.unitNumber] = cur
  }

  // True iff this unit_number has been marked removed. Used to filter out
  // entities that Factorio still reports as belt_neighbours / pickup-drop
  // targets when the dying entity itself is the trigger (on_entity_died
  // fires while ε is still valid but its uid is already tombstoned by the
  // time we read its neighbours back).
  private isTombstoned(u: number): boolean {
    const d = this.entityData[u as UnitNumber]
    return d != undefined && d.timeRemoved != undefined
  }

  // Read current belt-neighbours adjacency + UG pair for one entity. Filters
  // out tombstoned unit numbers (the dying entity itself, when on_entity_died
  // fires the cascade and its neighbours' fresh reads still echo it back).
  private readBeltAdjacency(entity: LuaEntity): {
    inputs: number[]
    outputs: number[]
    pair: number
  } {
    const inputs: number[] = []
    for (const e of entity.belt_neighbours.inputs) {
      const u = e.unit_number
      if (u == undefined) continue
      if (this.isTombstoned(u)) continue
      inputs.push(u)
    }
    table.sort(inputs)
    const outputs: number[] = []
    for (const e of entity.belt_neighbours.outputs) {
      const u = e.unit_number
      if (u == undefined) continue
      if (this.isTombstoned(u)) continue
      outputs.push(u)
    }
    table.sort(outputs)
    let pair = 0
    if (entity.type == "underground-belt") {
      const n = entity.neighbours as LuaEntity | undefined
      if (n != undefined && n.valid) {
        const u = n.unit_number
        if (u != undefined && !this.isTombstoned(u)) pair = u
      }
    }
    return { inputs, outputs, pair }
  }

  // Belt scan covers vanilla express UG reach (9 tiles) + margin so the
  // UG-corridor case is catchable via the UG-exempt branch.
  private static readonly BELT_RESCAN_RADIUS = 11

  // Called only when the trigger is in the belt category — the only events
  // that can shift other entities' belt_neighbours. Inserter and pole events
  // only affect the entity itself.
  //
  // `alsoLost` carries uids of entities the trigger just overbuilt: their
  // LuaEntity refs are gone, but their neighbours' caches still reference
  // them, so they ride along on the cache-half of the filter as additional
  // "lost connection" sources.
  //
  // Filter: candidate c passes iff it appears in the trigger's current
  // belt_neighbours / pair (gaining a connection) OR its cache references
  // any lostUid (losing one). Trigger+candidate-both-UG bypasses the filter
  // to catch the corridor case (corridor reshuffles only happen when the
  // trigger is itself a UG).
  //
  // When the filter passes, we read fresh state, emit a mutation with the
  // full snapshot, and update the cache. No explicit comparison — the
  // filter is the change detector.
  private rescanArea(surface: LuaSurface, trigger: LuaEntity, alsoLost: number[] = []) {
    if (!surface.valid || !trigger.valid) return
    const triggerUid = trigger.unit_number
    if (triggerUid == undefined) return
    const bbox = trigger.bounding_box
    const tick = getTick()
    const isTriggerUg = trigger.type == "underground-belt"

    // Set of uids whose connections may have just been broken. Trigger itself
    // covers mine/rotate/build; alsoLost covers entities the trigger overbuilt
    // (no live ref, but cache references still need clearing).
    const lostUids = new LuaSet<number>()
    lostUids.add(triggerUid)
    for (const u of alsoLost) lostUids.add(u)

    // Trigger's current outgoing/incoming/pair set — the "gaining" half of
    // the filter. Overbuilt entities are gone, so they contribute only to
    // lostUids, not here.
    const triggerRefs = new LuaSet<number>()
    for (const e of trigger.belt_neighbours.inputs) {
      if (e.unit_number != undefined) triggerRefs.add(e.unit_number)
    }
    for (const e of trigger.belt_neighbours.outputs) {
      if (e.unit_number != undefined) triggerRefs.add(e.unit_number)
    }
    if (isTriggerUg) {
      const n = trigger.neighbours as LuaEntity | undefined
      if (n != undefined && n.valid && n.unit_number != undefined) {
        triggerRefs.add(n.unit_number)
      }
    }

    const beltR = EntityLayout.BELT_RESCAN_RADIUS
    const beltArea: BoundingBox = {
      left_top: { x: bbox.left_top.x - beltR, y: bbox.left_top.y - beltR },
      right_bottom: { x: bbox.right_bottom.x + beltR, y: bbox.right_bottom.y + beltR },
    }
    for (const c of surface.find_entities_filtered({
      area: beltArea,
      type: ["transport-belt", "underground-belt", "splitter"],
    })) {
      const u = c.unit_number
      if (u == undefined || u == triggerUid) continue
      const d = this.entityData[u]
      if (!d || d.timeRemoved != undefined) continue
      // Corridor case: a new same-tier UG can steal the pair from an older
      // UG further down without either being tile-adjacent to the trigger.
      // Only happens when the trigger is itself a UG.
      const isUgPair = isTriggerUg && c.type == "underground-belt"
      if (!isUgPair) {
        const last = this.adjCache[u]
        const wasRelated =
          last != undefined &&
          (anyInSet(last.inputs, lostUids) || anyInSet(last.outputs, lostUids) || lostUids.has(last.pair))
        if (!triggerRefs.has(u) && !wasRelated) continue
      }
      const adj = this.readBeltAdjacency(c)
      const m: MutationEvent = { tick, beltInputs: adj.inputs, beltOutputs: adj.outputs }
      if (c.type == "underground-belt") {
        m.undergroundPair = adj.pair
        // A UG mouth's own direction / belt_to_ground_type can flip as a side
        // effect of the *partner* mouth being rotated — Factorio fires
        // on_player_rotated_entity only for the rotated mouth, so the partner's
        // flip is otherwise never re-read. Capture the live orientation here and
        // fold it into this same snapshot when it changed, so the partner can't
        // keep a stale pre-rotation direction while its connectivity is current.
        const cur = this.currentOrientation(d)
        if (c.direction != cur.direction) m.direction = c.direction
        const liveBtg = c.belt_to_ground_type
        if (liveBtg != cur.btg) m.beltToGroundType = liveBtg
      }
      this.appendMutation(d, m)
      this.adjCache[u] = adj
    }
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
  // Pre-mine is used (not on_player_mined_entity / on_robot_mined_entity)
  // because some fast-replace operations skip post-mine when the item ends up
  // consumed by the replacement instead of entering the player's inventory.
  // Pre-mine fires reliably for both normal mining and fast-replace.
  on_pre_player_mined_item(event: OnPrePlayerMinedItemEvent) {
    this.onRemoved(event.entity)
  }
  on_robot_pre_mined(event: OnRobotPreMinedEvent) {
    this.onRemoved(event.entity)
  }
  on_entity_died(event: OnEntityDiedEvent) {
    this.onRemoved(event.entity)
  }
  // Ghost cancellation / robot-clear. Ghosts aren't mined, so they never reach
  // the on_*_mined handlers — this is the only removal path for a tracked belt
  // ghost. event.ghost is still valid here (pre-deconstruct), so onRemoved can
  // tombstone it and rescan neighbours off the orphaned reference. Untracked
  // ghosts (inserter / pole / tile) have no record and are silently ignored.
  on_pre_ghost_deconstructed(event: OnPreGhostDeconstructedEvent) {
    this.onRemoved(event.ghost)
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
    // For belts, fold the post-rotation adjacency snapshot into the same
    // mutation event so a single tick produces a single mutation. Belt
    // rotation also cascades to nearby belts via rescanArea.
    if (data.category == "belt") {
      const adj = this.readBeltAdjacency(entity)
      mutation.beltInputs = adj.inputs
      mutation.beltOutputs = adj.outputs
      if (data.beltType == "underground-belt") mutation.undergroundPair = adj.pair
      this.adjCache[unitNumber] = adj
    }
    this.appendMutation(data, mutation)
    if (data.category == "belt") this.rescanArea(entity.surface, entity)
  }

  // Splitter / inserter config can only change via the GUI or settings-paste.
  // Both events route here to compare against the last-emitted config in
  // splitterConfigCache / inserterConfigCache.
  private snapshotConfig(entity: LuaEntity | undefined) {
    if (!entity || !entity.valid) return
    const u = entity.unit_number
    if (!u) return
    const data = this.entityData[u]
    if (!data) return
    if (data.beltType == "splitter") this.snapshotSplitterIfChanged(data, entity)
    else if (data.category == "inserter") this.snapshotInserterIfChanged(data, entity)
  }

  on_gui_closed(event: OnGuiClosedEvent) {
    this.snapshotConfig(event.entity)
  }

  on_entity_settings_pasted(event: OnEntitySettingsPastedEvent) {
    this.snapshotConfig(event.destination)
  }

  exportData(): EntityLayoutData {
    const entities: LayoutEntity[] = []
    for (const [, data] of pairs(this.entityData)) {
      entities.push(data)
    }
    return { entities }
  }
}

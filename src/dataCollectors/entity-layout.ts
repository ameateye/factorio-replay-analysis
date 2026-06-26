import {
  BoundingBox,
  EntityPrototypeFilterWrite,
  ItemFilter,
  LuaEntity,
  LuaSurface,
  MapPosition,
  OnBuiltEntityEvent,
  OnCancelledDeconstructionEvent,
  OnEntityDiedEvent,
  OnEntitySettingsPastedEvent,
  OnGuiClosedEvent,
  OnMarkedForDeconstructionEvent,
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
// Why a tracked entity left, recorded alongside timeRemoved. Shared vocabulary
// with roboportUsage for the three common paths: "mined" = hand-mined by a player
// (on_pre_player_mined_item), "deconstructed" = construction-bot mined under a
// deconstruction order (on_robot_pre_mined), "destroyed" = on_entity_died (combat
// — biters/worms/other lethal damage, the only non-deliberate removal). Two more
// are belt/ghost-specific: "overbuilt" = implicitly displaced by a new entity
// taking its tile (fast-replace / build-on-top), "ghost_cancelled" = a tracked
// belt ghost was deconstructed before it could be revived.
type RemovalReason = "mined" | "deconstructed" | "destroyed" | "overbuilt" | "ghost_cancelled"

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
  // Belts only — deconstruction-mark transition. true when the belt is marked
  // for deconstruction (it is dropped from Factorio's belt graph at this tick,
  // ~100+ ticks before a bot mines it), false when the mark is cancelled
  // (rejoined to the graph). Folded forward, this gives a belt's third state
  // alongside real (no flag / last false) and ghost (top-level ghost:true): a
  // marked belt is a still-present real entity that no longer participates in
  // material flow. Absent on a mutation that didn't change the mark.
  deconMarked?: boolean
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
  // Set alongside timeRemoved (see RemovalReason). "destroyed" flags a combat loss
  // (biters/worms) as opposed to a deliberate player/robot removal — so a record
  // that vanishes mid-run can be told apart from a relocation. Absent while live.
  removedReason?: RemovalReason
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
    schemaVersion: 6,
    description:
      "Belts, splitters, undergrounds, inserters, and electric poles — built/removed timing, removal reason (mined / deconstructed / destroyed / overbuilt / ghost_cancelled, so a combat loss is distinguishable from a deliberate relocation), runtime belt-graph snapshots (belt neighbours, UG pairs), post-build mutations (rotations, splitter config, inserter filters, deconstruction marks), and death/revive cycles (biter kill → bot-revived ghost; unit_number is preserved by Factorio across the cycle). Belt-category ghosts are tracked too (flagged ghost:true) because they participate in the belt graph (sideloads, neighbour reports); their connection and its removal are recorded so real entities don't keep stale neighbour references after a ghost is cancelled or revived. Belts carry a third state via the folded deconMarked mutation flag: a belt marked for deconstruction is dropped from the belt graph at mark time (~100+ ticks before a bot mines it), so deconMarked:true marks a still-present real entity that no longer participates in material flow; a cancelled mark records deconMarked:false.",
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
  // Last-emitted deconstruction-mark state per belt unit_number. Drives "did the
  // mark actually flip?" detection so the explicit deconMarked transition is
  // recorded even when adjacency is unchanged (an isolated belt with no
  // neighbours marks/cancels without any belt-graph edge moving). Defaults to
  // false (unmarked) for any uid not present. Not exported.
  deconCache: Record<number, boolean> = {}
  // unit_number -> deadTick for belts in a death-ghost frozen state: killed
  // while the force revives-on-death, so Factorio made a same-uid reconstruction
  // ghost it never belt-graph-maintains. Their belt edges are frozen (not
  // re-read from live) and kept reciprocal (not dropped from neighbours) until
  // the bot-revive clears the entry. In-memory only.
  frozenDeathGhosts: Record<number, number> = {}

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
        this.setTimeRemoved(data, "overbuilt")
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
      const frozenDeadTick = this.frozenDeathGhosts[unitNumber]
      if (sameIdentity && (existing.timeRemoved != undefined || frozenDeadTick != undefined)) {
        if (!existing.revivals) existing.revivals = []
        existing.revivals.push({ died: existing.timeRemoved ?? frozenDeadTick ?? getTick(), revived: getTick() })
        existing.timeRemoved = undefined
        existing.removedReason = undefined
        // Death-ghost freeze (if any) ends here — the entity is real again.
        delete this.frozenDeathGhosts[unitNumber]
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
  private onRemoved(entity: LuaEntity, reason: RemovalReason) {
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
    this.setTimeRemoved(data, reason)
    if (data.category == "belt") this.rescanArea(entity.surface, entity)
  }

  // Shared with markOverbuiltAt — both paths mark a tracked entity as removed
  // by setting timeRemoved (+ removedReason) on its record. onRemoved arrives via
  // a LuaEntity reference (needs unit_number lookup); markOverbuiltAt arrives with
  // the record directly. Reason is recorded only on the FIRST removal, alongside
  // the tick, so a later cascade can't overwrite how the entity actually left.
  private setTimeRemoved(data: LayoutEntity, reason: RemovalReason) {
    if (data.timeRemoved == undefined) {
      data.timeRemoved = getTick()
      data.removedReason = reason
    }
    // A genuine removal (mine / deconstruct / overbuild) ends any death-ghost
    // freeze so the entity is dropped from neighbours instead of preserved.
    delete this.frozenDeathGhosts[data.unitNumber]
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

  // Resolve a belt-neighbour (or UG-pair) entity to the unit_number to record.
  // Normally just its own unit_number — but a belt GHOST sitting on a tile a
  // live real belt already occupies is contradictory state Factorio resolves
  // away, and that removal sometimes never reaches this collector (e.g. a
  // blueprint stamped over an existing belt). The neighbour's belt graph then
  // keeps a permanent stale edge to a vanished ghost. When the neighbour is
  // such a ghost, record the real entity at that tile instead. A ghost ALONE on
  // its tile is a legitimate belt-graph participant (it sideloads into real
  // belts and is reported as a neighbour), so it is kept as-is.
  //
  // Exception: a UG/belt ghost sitting on a real belt that is MARKED FOR
  // DECONSTRUCTION is a fast-replace — the real belt is leaving, the ghost is the
  // legitimate future occupant, and Factorio already points neighbours at the
  // GHOST (verified: a marked belt is dropped from the belt graph at mark time).
  // Substituting the dying belt there would re-create the one-sided edge this is
  // meant to prevent, so keep the ghost as-is in that case.
  private resolveNeighbourUid(e: LuaEntity): number | undefined {
    const u = e.unit_number
    if (u == undefined) return undefined
    if (e.type != "entity-ghost") return u
    const p = e.position
    for (const r of e.surface.find_entities_filtered({
      position: p,
      type: ["transport-belt", "underground-belt", "splitter"],
    })) {
      // find_entities_filtered by point can return entities whose collision box
      // merely covers p (a 2-tile splitter on the adjacent tile); require an
      // exact tile-centre match so we only substitute the entity truly on the
      // ghost's tile.
      if (r.position.x != p.x || r.position.y != p.y) continue
      const ru = r.unit_number
      if (ru != undefined && !this.isTombstoned(ru) && !r.to_be_deconstructed()) return ru
    }
    return u
  }

  // Read current belt-neighbours adjacency + UG pair for one entity. Filters
  // out tombstoned unit numbers (the dying entity itself, when on_entity_died
  // fires the cascade and its neighbours' fresh reads still echo it back) and
  // resolves ghost neighbours contradicted by a same-tile real belt to the real
  // one (see resolveNeighbourUid). Dedups in case the engine reports both the
  // ghost and the real entity for one connection.
  private readBeltAdjacency(entity: LuaEntity): {
    inputs: number[]
    outputs: number[]
    pair: number
  } {
    const inputs: number[] = []
    const seenIn = new LuaSet<number>()
    for (const e of entity.belt_neighbours.inputs) {
      const u = this.resolveNeighbourUid(e)
      if (u == undefined || this.isTombstoned(u) || seenIn.has(u)) continue
      seenIn.add(u)
      inputs.push(u)
    }
    table.sort(inputs)
    const outputs: number[] = []
    const seenOut = new LuaSet<number>()
    for (const e of entity.belt_neighbours.outputs) {
      const u = this.resolveNeighbourUid(e)
      if (u == undefined || this.isTombstoned(u) || seenOut.has(u)) continue
      seenOut.add(u)
      outputs.push(u)
    }
    table.sort(outputs)
    let pair = 0
    if (entity.type == "underground-belt") {
      const n = entity.neighbours as LuaEntity | undefined
      if (n != undefined && n.valid) {
        const u = this.resolveNeighbourUid(n)
        if (u != undefined && !this.isTombstoned(u)) pair = u
      }
    }
    // Reciprocal preservation for frozen death-ghosts: Factorio stops listing a
    // death-ghost in its neighbours' live belt_neighbours, so a fresh read here
    // would drop the edge and make it one-sided. Re-add any previously-cached
    // neighbour (and, for UGs, the pair) that is currently a frozen death-ghost
    // so the edge stays on both sides for the dead window.
    const prev = entity.unit_number != undefined ? this.adjCache[entity.unit_number] : undefined
    if (prev != undefined) {
      for (const u of prev.inputs) {
        if (this.frozenDeathGhosts[u] != undefined && !seenIn.has(u)) {
          seenIn.add(u)
          inputs.push(u)
        }
      }
      for (const u of prev.outputs) {
        if (this.frozenDeathGhosts[u] != undefined && !seenOut.has(u)) {
          seenOut.add(u)
          outputs.push(u)
        }
      }
      table.sort(inputs)
      table.sort(outputs)
      if (pair == 0 && prev.pair != 0 && this.frozenDeathGhosts[prev.pair] != undefined) pair = prev.pair
    }
    return { inputs, outputs, pair }
  }

  // Belt scan covers vanilla express UG reach (9 tiles) + margin so the
  // UG-corridor case is catchable via the UG-exempt branch.
  private static readonly BELT_RESCAN_RADIUS = 11

  // Emit one belt-graph snapshot for entity `c` (record `d`, uid `u`): append
  // the mutation and refresh the adjacency cache. UG mouths fold in their pair
  // and any live direction / belt_to_ground_type flip, so a partner mouth
  // re-read as a side effect can't keep a stale pre-rotation orientation while
  // its connectivity is current.
  private emitBeltSnapshot(
    d: LayoutEntity,
    c: LuaEntity,
    u: number,
    adj: { inputs: number[]; outputs: number[]; pair: number },
    tick: number,
  ) {
    const m: MutationEvent = { tick, beltInputs: adj.inputs, beltOutputs: adj.outputs }
    if (c.type == "underground-belt") {
      m.undergroundPair = adj.pair
      const cur = this.currentOrientation(d)
      if (c.direction != cur.direction) m.direction = c.direction
      const liveBtg = c.belt_to_ground_type
      if (liveBtg != cur.btg) m.beltToGroundType = liveBtg
    }
    this.appendMutation(d, m)
    this.adjCache[u] = adj
  }

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
  //
  // A second, change-guarded pass then re-reads the surface neighbours of any
  // UG mouth whose adjacency changed in the first pass: re-reading a UG (esp.
  // via the isUgPair bypass) updates its own record but not the belts it just
  // gained / lost an edge to, which would otherwise stay one-sided until they
  // are independently re-read.
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
    const candidates = surface.find_entities_filtered({
      area: beltArea,
      // entity-ghost included so belt ghosts get rescanned too: a ghost's
      // belt_neighbours are frozen at its own build tick (it is never re-read
      // otherwise), so a downstream placed later leaves the upstream ghost's
      // outputs stale and the edge one-sided. Including ghosts here lets the
      // neighbour-change event refresh them. Non-belt ghosts the scan also
      // returns are dropped by the `!d` guard below (we never record them).
      type: ["transport-belt", "underground-belt", "splitter", "entity-ghost"],
    })
    // uid -> live entity, so the reciprocity pass below can re-read a changed
    // UG mouth's surface neighbour without a second find.
    const candByUid: Record<number, LuaEntity> = {}
    for (const c of candidates) {
      if (c.unit_number != undefined) candByUid[c.unit_number] = c
    }
    // Surface belts next to a UG mouth whose adjacency changed this pass. A
    // re-read UG (esp. via the isUgPair bypass) updates its own record but not
    // the belts it just gained / lost an edge to — they reference the UG, not
    // the trigger, so they fail the trigger-built filter and keep a stale,
    // one-sided edge until some later event re-reads them. Collect the UG's new
    // neighbours (gained edges: build / revive) and its former cached neighbours
    // (lost edges: a mouth flip empties them) for the change-guarded pass after.
    // Duplicates are harmless — the second read is a no-op once the cache is
    // current.
    const recheck: number[] = []
    for (const c of candidates) {
      const u = c.unit_number
      if (u == undefined || u == triggerUid) continue
      const d = this.entityData[u]
      if (!d || d.timeRemoved != undefined) continue
      // A frozen death-ghost's edges are frozen (the engine doesn't maintain
      // them) — never re-read them here; readBeltAdjacency preserves the
      // reciprocal edge on its neighbours instead.
      if (this.frozenDeathGhosts[u] != undefined) continue
      // Corridor case: a new same-tier UG can steal the pair from an older
      // UG further down without either being tile-adjacent to the trigger.
      // Only happens when the trigger is itself a UG.
      const isUgPair = isTriggerUg && c.type == "underground-belt"
      const last = this.adjCache[u]
      if (!isUgPair) {
        const wasRelated =
          last != undefined &&
          (anyInSet(last.inputs, lostUids) || anyInSet(last.outputs, lostUids) || lostUids.has(last.pair))
        if (!triggerRefs.has(u) && !wasRelated) continue
      }
      const adj = this.readBeltAdjacency(c)
      // Queue a changed UG mouth's surface neighbours (old + new) so the
      // reciprocity pass below restores the edge on both sides this same tick.
      // Keyed on the tracked subtype, not c.type: a ghost UG mouth reports
      // c.type "entity-ghost", but still drives the same one-sided edge.
      if (d.beltType == "underground-belt") {
        const ugChanged =
          last == undefined ||
          !arraysEqual(adj.inputs, last.inputs) ||
          !arraysEqual(adj.outputs, last.outputs) ||
          adj.pair != last.pair
        if (ugChanged) {
          for (const e of adj.inputs) recheck.push(e)
          for (const e of adj.outputs) recheck.push(e)
          if (last != undefined) {
            for (const e of last.inputs) recheck.push(e)
            for (const e of last.outputs) recheck.push(e)
          }
        }
      }
      this.emitBeltSnapshot(d, c, u, adj, tick)
    }
    // Reciprocity pass: re-read each surface belt next to a UG that changed
    // above, emitting only on a real adjacency change so the reciprocal edge is
    // fixed the same tick without churning unrelated belts. One level is enough
    // — the only change is the reciprocal of the UG's edge, so the belt's other
    // neighbours are untouched.
    for (const uid of recheck) {
      const c = candByUid[uid]
      if (c == undefined || !c.valid) continue
      const u = c.unit_number
      if (u == undefined || u == triggerUid) continue
      const d = this.entityData[u]
      if (!d || d.timeRemoved != undefined) continue
      if (this.frozenDeathGhosts[u] != undefined) continue
      const last = this.adjCache[u]
      const adj = this.readBeltAdjacency(c)
      const changed =
        last == undefined ||
        !arraysEqual(adj.inputs, last.inputs) ||
        !arraysEqual(adj.outputs, last.outputs) ||
        adj.pair != last.pair
      if (!changed) continue
      this.emitBeltSnapshot(d, c, u, adj, tick)
    }
  }

  // A belt marked for deconstruction is dropped from Factorio's belt graph
  // IMMEDIATELY (its belt_neighbours empty and its neighbours drop their edges to
  // it), reciprocally, ~100+ ticks before a bot actually mines it. Cancelling the
  // mark rejoins it just as immediately. Neither is a build or a mine, so without
  // these handlers the graph change is unrecorded until the eventual mine —
  // leaving the belt and its neighbours with stale, one-sided edges for the whole
  // marked window (and mark-then-cancel, which never mines, leaves them forever).
  // Re-read the belt itself and cascade to its former / restored neighbours, the
  // same way a build / mine / rotate does. (Verified against live game behaviour.)
  private refreshBeltGraphAt(entity: LuaEntity) {
    if (!entity.valid) return
    const u = entity.unit_number
    if (u == undefined) return
    const data = this.entityData[u]
    if (!data || data.category != "belt" || data.timeRemoved != undefined) return
    // A frozen death-ghost's edges are deliberately frozen — don't disturb them.
    if (this.frozenDeathGhosts[u] != undefined) return
    // Re-read the belt itself (marked => empty; cancelled => restored) and the
    // mark state itself. Emit a mutation when EITHER the adjacency changed OR the
    // mark flipped — the latter is what lets an isolated belt (no neighbours, so
    // empty adjacency before and after) still record its mark/cancel, and gives
    // every belt an explicit third state instead of one inferred from emptiness.
    // to_be_deconstructed() is read directly (not the event type) so a single
    // handler serves both mark and cancel; resolveNeighbourUid already trusts it
    // during these same events.
    const adj = this.readBeltAdjacency(entity)
    const last = this.adjCache[u]
    const adjChanged =
      last == undefined ||
      !arraysEqual(adj.inputs, last.inputs) ||
      !arraysEqual(adj.outputs, last.outputs) ||
      adj.pair != last.pair
    const marked = entity.to_be_deconstructed()
    const markChanged = marked != (this.deconCache[u] ?? false)
    if (adjChanged || markChanged) {
      const m: MutationEvent = { tick: getTick() }
      if (adjChanged) {
        m.beltInputs = adj.inputs
        m.beltOutputs = adj.outputs
        if (data.beltType == "underground-belt") m.undergroundPair = adj.pair
      }
      if (markChanged) m.deconMarked = marked
      this.appendMutation(data, m)
      this.adjCache[u] = adj
      this.deconCache[u] = marked
    }
    // Cascade to the former (mark) / restored (cancel) neighbours.
    this.rescanArea(entity.surface, entity)
  }

  on_marked_for_deconstruction(event: OnMarkedForDeconstructionEvent) {
    this.refreshBeltGraphAt(event.entity)
  }
  on_cancelled_deconstruction(event: OnCancelledDeconstructionEvent) {
    this.refreshBeltGraphAt(event.entity)
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
    this.onRemoved(event.entity, "mined")
  }
  on_robot_pre_mined(event: OnRobotPreMinedEvent) {
    this.onRemoved(event.entity, "deconstructed")
  }
  on_entity_died(event: OnEntityDiedEvent) {
    const entity = event.entity
    // Death-ghost: a belt killed while the force revives-on-death leaves a
    // same-unit_number reconstruction ghost that Factorio never belt-graph-
    // maintains (surviving neighbours stop listing it, so the edge goes
    // one-sided for the whole dead window). Freeze the pre-death edges
    // reciprocally — skip the tombstone+rescan drop; the edges the record and
    // neighbours already hold stay put until the bot-revive (onCreated revive
    // path) clears the freeze. A true death (no ghost) falls through to normal
    // removal.
    if (entity.valid && entity.unit_number != undefined && entity.force.create_ghost_on_entity_death) {
      const data = this.entityData[entity.unit_number]
      if (data != undefined && data.category == "belt") {
        this.frozenDeathGhosts[entity.unit_number] = getTick()
        return
      }
    }
    this.onRemoved(entity, "destroyed")
  }
  // Ghost cancellation / robot-clear. Ghosts aren't mined, so they never reach
  // the on_*_mined handlers — this is the only removal path for a tracked belt
  // ghost. event.ghost is still valid here (pre-deconstruct), so onRemoved can
  // tombstone it and rescan neighbours off the orphaned reference. Untracked
  // ghosts (inserter / pole / tile) have no record and are silently ignored.
  on_pre_ghost_deconstructed(event: OnPreGhostDeconstructedEvent) {
    this.onRemoved(event.ghost, "ghost_cancelled")
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
    // Frozen-but-never-revived death-ghosts: the reconstruction ghost was never
    // bot-revived by export time, so the belt is genuinely gone — record its
    // removal at the death tick (its frozen reciprocal edges only ever described
    // the never-realised dead window).
    for (const [u, deadTick] of pairs(this.frozenDeathGhosts)) {
      const d = this.entityData[u as UnitNumber]
      if (d != undefined && d.timeRemoved == undefined) {
        d.timeRemoved = deadTick
        d.removedReason = "destroyed"
      }
    }
    const entities: LayoutEntity[] = []
    for (const [, data] of pairs(this.entityData)) {
      entities.push(data)
    }
    return { entities }
  }
}

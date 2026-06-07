# Output JSONs

The data-collection layer writes one JSON file per collector to `script-output/`. Filenames are the collector's class name with the first letter lowercased and the `DataCollector` suffix (if present) stripped — `EntityLayout` → `entityLayout.json`, etc.

## Manifest header

Every output JSON starts with a `manifest` field describing the file:

```json
{
  "manifest": {
    "collector": "EntityLayout",
    "schemaVersion": 1,
    "description": "..."
  },
  ...
}
```

- `collector` — class name of the producing collector.
- `schemaVersion` — bumped when the file's shape changes in a consumer-visible way. Pre-manifest extractions (no `manifest` field at all) should be treated as legacy and parsed defensively.
- `description` — one-line summary; mirrors the section heading below.

## Conventions

- **Time** is in ticks (60 ticks/second) unless stated otherwise.
- **Positions** are `{ x, y }` Factorio map coordinates (1×1 entities centered at integer + 0.5; 2×2 entities centered at integers).
- **Direction** is a `defines.direction` integer: 0 = north, 2 = east, 4 = south, 6 = west.
- **`unitNumber`** is Factorio's per-entity unique id; the same physical entity rebuilt later receives a new unit number.
- **`timeBuilt` / `timeRemoved`** are absolute ticks. `timeRemoved` is omitted while the entity is still alive at export time.
- **Periodic samples** use `period` (ticks between samples). The sample at index `i` corresponds to game tick `i * period`.

---

## entityLayout.json

Belts, splitters, undergrounds, inserters, and electric poles — built/removed timing, runtime belt-graph snapshots (belt neighbours, UG pairs), and post-build mutations (rotations, splitter config, inserter filters). Inserter pickup / drop targets are **not** captured here — derive them downstream from the inserter's `location` + `direction` + prototype reach.

Belt-category **ghosts** are tracked too (flagged `ghost: true`): a ghost belt participates in the engine belt graph — it sideloads and is reported in real neighbours' `belt_neighbours` — so its connection *and its later removal* (cancel or revive) are recorded, otherwise the real entity keeps a stale neighbour reference. Consumers that only want material flow can filter on the `ghost` flag.

```ts
{
  manifest,                   // schemaVersion: 4
  entities: LayoutEntity[]
}

LayoutEntity = {
  name: string                // prototype name, e.g. "fast-transport-belt"
  unitNumber: number
  category: "belt" | "inserter" | "pole"
  ghost?: boolean             // present only on entity-ghosts (not yet revived). Only belt-category ghosts are tracked; name/beltType carry the would-be real prototype. See section intro.
  beltType?: "transport-belt" | "underground-belt" | "splitter"
  location: { x, y }
  direction: number           // build-time direction; later rotations live in mutations[]
  timeBuilt: number           // tick of the ORIGINAL build; survives revivals
  timeRemoved?: number

  // Death + bot-revive cycles. Factorio's death→ghost→bot-revive flow
  // preserves unit_number (so circuit wires / station references survive
  // a biter attack), so a single LayoutEntity can span multiple death/
  // revive intervals. Consumers should treat the entity as continuously
  // existing for belt-graph / connectivity purposes; the gaps are recorded
  // here only for analytics that care. Belt-graph re-evaluation on revive
  // lands in mutations[] just like any other adjacency change.
  // Undefined for entities never destroyed.
  revivals?: { died: number; revived: number }[]

  // Underground belts only — initial state at build (rotation flips it).
  beltToGroundType?: "input" | "output"

  // Splitters only — initial state at build.
  splitterInputPriority?: "left" | "none" | "right"
  splitterOutputPriority?: "left" | "none" | "right"
  splitterFilter?: string     // item name; "" = no filter

  // Inserters only — initial state at build. Filters apply only when
  // inserterUseFilters is true. Mode distinguishes whitelist (only listed
  // items) from blacklist (everything except listed).
  inserterUseFilters?: boolean
  inserterFilterMode?: "whitelist" | "blacklist"
  inserterFilters?: string[]  // item names per slot

  // Belts only — runtime adjacency at build time. beltInputs / beltOutputs
  // are sorted unit_number arrays from LuaEntity.belt_neighbours; an empty
  // array means "no connection on that side". undergroundPair is the paired
  // UG entity's unit_number for underground-belts only (0 = unpaired).
  // These reflect Factorio's own belt graph (turns, sideloads, splitter
  // sides, UG pairings) and can shift post-build as neighbouring entities
  // are added or removed; updates land in mutations[].
  beltInputs?: number[]
  beltOutputs?: number[]
  undergroundPair?: number

  // Post-build state changes folded forward in tick order. Each mutation
  // carries only the fields that changed in that event.
  mutations?: Array<{
    tick: number
    direction?: number
    beltToGroundType?: "input" | "output"
    splitterInputPriority?: "left" | "none" | "right"
    splitterOutputPriority?: "left" | "none" | "right"
    splitterFilter?: string
    inserterUseFilters?: boolean
    inserterFilterMode?: "whitelist" | "blacklist"
    inserterFilters?: string[]
    beltInputs?: number[]
    beltOutputs?: number[]
    undergroundPair?: number
  }>
}
```

Notes:
- To get state at time T, start from the build-time fields and apply each mutation with `tick ≤ T` in order.
- The collector defensively marks entities as removed when a newly-built entity's bounding box covers their position (with a 0.1 tile inset). This catches splitter-over-two-belts and any fast-replace path where mined events don't fire.
- `beltInputs` / `beltOutputs` / `undergroundPair` capture what `LuaEntity.belt_neighbours` and `LuaEntity.neighbours` report at build / change time — including turns and sideloads (encoded as which adjacent belts appear in inputs/outputs) and splitter side-connections. They do **not** capture Factorio's per-lane transport-line segmentation; consumers wanting lane-level item identity must derive it themselves.
- Belt-graph rescans cover a radius of ~11 tiles around any built/removed/rotated belt-category entity, enough for vanilla underground reach (express UG = 9). Modded longer-reach undergrounds may have some pair updates missed at this radius.

### Schema history

- **v3** — Added `revivals[]`. `timeBuilt` now records the ORIGINAL build tick across death/revive cycles (previously it was overwritten with the latest revive tick because Factorio reuses the entity's unit_number on bot-revive).
- **v2** — Added belt-graph snapshots (`beltInputs`, `beltOutputs`, `undergroundPair`) on both `LayoutEntity` and `MutationEvent`.
- **v1** — Initial release: build/remove timing + rotation / splitter-config / inserter-filter mutations.

## machineProduction.json

Per-recipe production runs on assemblers, furnaces, chemical plants, refineries, and rocket silos — products finished, crafting/productivity progress, and entity status sampled periodically.

```ts
{
  manifest,
  period: number              // sample period in ticks
  machines: MachineData[]
}

MachineData = {
  name: string
  unitNumber: number
  location: { x, y }
  direction: number
  timeBuilt: number
  recipes: MachineRecipeProduction[]
}

MachineRecipeProduction = {
  recipe: string
  craftingSpeed: number
  productivityBonus: number
  timeStarted: number
  timeStopped?: number
  stoppedReason?: "configuration_changed" | "mined" | "entity_died"
                | "marked_for_deconstruction" | "disabled_by_script"
  // Per-sample tuple. The 6th element is recipe-specific extra info, e.g.
  // the missing-ingredients list for *_ingredient_shortage statuses.
  production: Array<[
    time: number,
    productsFinished: number,    // delta since previous sample
    craftingProgress: number,    // 0..1
    productivityProgress: number,// 0..1
    status: EntityStatus,
    additionalInfo?: unknown,
  ]>
}
```

Notes:
- `productsFinished` is **recipe cycles**, not items. Multiply by recipe `outputCount` to get items (e.g. purple science = ×3, copper-cable = ×2).
- Rocket silos cycle through extra states between rocket-part stages (`preparing_rocket_for_launch`, `waiting_to_launch_rocket`, `waiting_for_space_in_platform_hub`, `launching_rocket`); these are treated as running, not stopping.

## bufferAmounts.json

Diff-compressed per-item contents of chests and tanks over time. Every item a buffer
held gets its own `[tick, amount]` series under `contents`; a sample is appended only
when that item's amount changes (sample-and-hold between samples — to read the amount
at an arbitrary tick, carry the last sample forward; 0 before the first sample).

```ts
{
  manifest,
  period: number               // sampling period in ticks
  buffers: Array<{
    name: string
    unitNumber: number
    location: { x, y }
    timeBuilt: number
    timeRemoved?: number       // tick the buffer was mined / upgraded away / died; absent if alive at export
    type: "chest" | "tank"
    contents: Record<string,   // item / fluid name ->
      Array<[time: number, amount: number]>   // diff-compressed series; trailing zeros trimmed
    >
  }>
}
```

- **v3** — Replaced the single-item `content` + `amounts` pair with a per-item `contents`
  map. The collector no longer classifies a buffer down to one "primary" item and no
  longer drops mixed-item chests: a chest holding several item types records a series per
  type. Series are diff-compressed (a point only on change), which makes the per-item
  shape net **smaller** than the old single-item-per-period series despite carrying more
  detail. To consume an old (v2) file, map `{ content, amounts }` to
  `{ contents: { [content]: amounts } }` — the dashboard's `normalizeBufferFile`
  (`dashboard/scripts/lib/buffer.mjs`) does exactly this, so old runs still build (they
  degrade to the one item the v2 collector resolved).
- **v2** — Added `timeRemoved`, and removed buffers are now exported (previously a chest/tank that was mined, **upgraded** to another tier, or destroyed before export was dropped entirely — so an iron-chest later upgraded to a logistic chest left no pre-upgrade record). `unitNumber` is unique per entity, so an upgrade appears as two records at the same `location`: the old one with `timeRemoved`, the new one with `timeBuilt` at the upgrade tick.

## labContents.json

Lab science-pack inventories sampled periodically. `sciencePacks` is the column order for each lab's `packs[]` tuples.

```ts
{
  manifest,
  period: number
  sciencePacks: string[]       // ordered list of pack names
  labs: Array<{
    name: string
    unitNumber: number
    location: { x, y }
    timeBuilt: number
    // packs[i] = [tick, count_for_sciencePacks[0], count_for_sciencePacks[1], ...]
    packs: Array<[time: number, ...packCounts: number[]]>
  }>
}
```

## minerActivity.json

Mining-drill statuses sampled periodically with location, direction, and the resources covered.

```ts
{
  manifest,
  period: number
  miners: Array<{
    name: string
    unitNumber: number
    location: { x, y }
    direction: number
    timeBuilt: number
    timeRemoved?: number
    resources: string[]        // resource prototypes within the drill's mining area
    statuses: Array<[time: number, status: EntityStatus]>
  }>
}
```

## playerInventory.json

Per-player inventory snapshots, crafting queue snapshots, and crafting-finished events.

```ts
{
  manifest,
  period: number
  players: {
    [playerName: string]: {
      inventory: Array<Record<string, number>>     // one entry per period sample
      craftingQueue: Array<Array<{                 // one entry per period sample
        recipe: string
        item: string
        count: number
        prerequisite: boolean
      }>>
      craftingEvents: Array<{ time: number, recipe: string }>
    }
  }
}
```

Note: a missing leading sample is back-filled with empty `{}` / `[]` if the player joined after game start.

## playerPosition.json

Per-player (x, y) position rounded to integer tiles, sampled periodically.

```ts
{
  manifest,
  period: number
  players: {
    [playerName: string]: Array<[x: number, y: number]>
  }
}
```

## gameEvents.json

Discrete player/world events in a single tick-ordered stream, discriminated by `type`. Hooks fire during playback in tick order, so `events` is already sorted.

```ts
{
  manifest,
  events: GameEvent[]
}

GameEvent =
  // Environmental harvest by hand. `kind` is classified from entity.type;
  // `products` is the actual mined yield read from the event buffer (exact
  // wood-per-tree / stone+coal-per-rock, not an inventory-delta guess).
  | { tick, type: "harvest", player: string, kind: "tree" | "rock" | "fish",
      entity: string, position: { x, y }, products: Record<string, number> }
  // An enemy-force entity died (biter / spawner / worm). `byPlayer` is true
  // when the killing cause was the player character.
  | { tick, type: "kill", name: string, entityType: string,
      position: { x, y }, byPlayer: boolean }
  // The player character died. `position` omitted if unavailable.
  | { tick, type: "death", player: string, position?: { x, y } }
  // Ctrl-click fast-transfer into/out of an entity. `fromPlayer` true = player → entity.
  | { tick, type: "transfer", player: string, entity: string, entityType: string,
      position: { x, y }, fromPlayer: boolean }
```

Notes:
- **Harvest excludes ore-by-hand.** `on_player_mined_entity` only fires when a resource entity is fully *depleted*, not per unit mined, so incremental ore hand-mining produces no event — keep deriving that from `playerInventory` deltas. Trees / rocks / fish are removed in a single mine, so each is captured exactly.
- **Harvest excludes picking up own builds.** Only `tree` / `simple-entity` (rock) / `fish` types are logged; dismantling placed entities is already covered by `entityLayout.json`'s remove timing.
- **`transfer` carries no item identity** — the Factorio event doesn't expose what moved. Join against `playerInventory` deltas at the same tick to infer it (e.g. coal into a burner = a manual refuel).
- **`kill` fires for every enemy-force death**, including kills by turrets or attrition; filter on `byPlayer` for player-driven nest clearing.

## researchTiming.json

Tech research events plus first-started and completed tick maps.

```ts
{
  manifest,
  timeFirstStarted: { [tech: string]: number }   // earliest start tick per tech
  timeCompleted:    { [tech: string]: number }   // completion tick per tech
  events: Array<{
    time: number
    research: string
    type: "started" | "cancelled" | "completed"
  }>
}
```

## roboportUsage.json

Per-roboport charging and waiting bot counts sampled periodically; lifecycle includes removal reason.

```ts
{
  manifest,
  period: number
  roboports: Array<{
    unitNumber: number
    location: { x, y }
    timeBuilt: number
    timeRemoved?: number
    removedReason?: "deconstructed" | "mined" | "destroyed"
    usage: Array<[time: number, numCharging: number, numWaiting: number]>
  }>
}
```

## rocketLaunchTime.json

Tick of each rocket launch in the run.

```ts
{
  manifest,
  rocketLaunchTimes: number[]   // ticks, in launch order
}
```

---

## Adding a new collector

1. Create the collector class in `src/dataCollectors/` with a `manifest = { schemaVersion: 1, description: "..." }` field.
2. Register it in `src/main.ts` via `addDataCollector(...)`.
3. Add a section to this file with the output filename, shape, and any conventions worth noting.
4. Run `npm run build` and re-run extraction to verify the JSON includes the manifest.

## Bumping a schema version

Bump `schemaVersion` (and update this doc) when:

- A field's type or semantics change in a way consumers must handle.
- A previously-required field becomes optional, or vice versa.
- Element ordering becomes load-bearing where it wasn't before.

Adding a new optional field doesn't strictly require a bump, but bump anyway if downstream tools should know to start populating new behaviour from it.

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

```ts
{
  manifest,                   // schemaVersion: 2
  entities: LayoutEntity[]
}

LayoutEntity = {
  name: string                // prototype name, e.g. "fast-transport-belt"
  unitNumber: number
  category: "belt" | "inserter" | "pole"
  beltType?: "transport-belt" | "underground-belt" | "splitter"
  location: { x, y }
  direction: number           // build-time direction; later rotations live in mutations[]
  timeBuilt: number
  timeRemoved?: number

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

Per-tick contents of chests and tanks tracked over time, with detected primary item per buffer.

```ts
{
  manifest,
  period: number
  buffers: Array<{
    name: string
    unitNumber: number
    location: { x, y }
    timeBuilt: number
    type: "chest" | "tank"
    content: string            // detected dominant item or fluid name
    amounts: Array<[time: number, amount: number]>
  }>
}
```

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

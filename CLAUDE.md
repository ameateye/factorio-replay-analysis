## Project Overview

This project generates a `control.lua` file for Factorio that collects replay data and exports it to JSON. The workflow:
1. Replace `control.lua` in a replay save file with the generated `out/control.lua`
2. Run the replay
3. Take a new save of the replay
4. Load the save and run `/export-replay-data` command
5. Data exports to `script-output/replay-data/*.json`

Alternatively, data is also automatically exported on first rocket launch.

## Build System

TypeScript is compiled to Lua using TypeScriptToLua (TSTL). There are two build configurations:

**Release build** (`tsconfig.release.json`):
- Entry: `src/main.ts`
- Output: Single bundled `out/control.lua` file
- Command: `npm run build`
- Watch: `npm run watch`

**Test build** (`tsconfig.test.json`):
- Includes: `src/test/**/*.ts`, `src/control.ts`
- Output: Multiple files in `test-mod/` directory
- Command: `npm run build:test` (runs automatically before tests)
- Watch: `npm run watch:test`

## Testing

```bash
npm test                    # Run all tests (builds first)
npm run build:test          # Build test mod only
```

Tests use `factorio-test` framework. Test files are in `src/test/` and follow the pattern `*-test.ts`.

## Code Quality

```bash
npm run lint                # Run ESLint
npm run format:check        # Check Prettier formatting
npm run format:fix          # Fix formatting
npm run check               # Run both format:check and lint
npm run check-clean-tree    # Verify git working tree is clean
```

## Architecture

**Data Collection System:**

The core abstraction is `DataCollector` (defined in `src/data-collector.ts`), which:
- Implements event handlers from Factorio's event system
- Optionally handles periodic `on_nth_tick` events
- Exports collected data via `exportData()` method
- Registered with the event system via `addDataCollector()` in `main.ts`. Users can configure/customize here

**Registration mechanism:**
- `addDataCollector()` introspects the DataCollector instance
- Automatically registers all event handlers (methods matching event names)
- Registers metatables for save/load persistence
- Stores collectors in global `storage.dataCollectors`

**EntityTracker pattern:**

`EntityTracker` (in `src/dataCollectors/entity-tracker.ts`) is a base class for tracking specific entity types:
- Handles entity lifecycle: creation, deletion, periodic updates
- Filters entities by prototype using LuaEventFilters
- Maintains `entityData` map keyed by unit_number
- Used by collectors like `MachineProduction`, `BufferAmounts`, `LabContents`, `RoboportUsage`

**Data Collectors:**

Each collector in `src/dataCollectors/` implements a specific tracking system:
- **PlayerInventory**: Periodic snapshots of inventory + crafting queue/events
- **MachineProduction**: Tracks recipe production runs with status, progress, and productivity
- **BufferAmounts**: Buffer chest contents over time
- **LabContents**: Research progress and lab inputs
- **ResearchTiming**: Technology research start/finish times
- **RocketLaunchTime**: Rocket launch events
- **RoboportUsage**: Roboport statistics
- **PlayerPosition**: Player movement tracking

Collectors are instantiated and configured in `src/main.ts`.

**Export mechanism:**

`exportAllData()` (in `src/data-collector.ts`):
- Writes to `script-output/{collectorName}.json`
- Wraps each collector's `exportData()` result with a `manifest` header (`collector`, `schemaVersion`, `description`) so output files are self-describing. Each collector should declare its own `manifest = { schemaVersion, description }` field. Bump `schemaVersion` when the output shape changes.

**Output shape reference:**

[docs/outputs.md](docs/outputs.md) documents every output JSON's shape and field semantics. Update it whenever you add a collector or change an output's shape.

## Key Technologies

- **TypeScriptToLua (TSTL)**: Transpiles TypeScript to Lua 5.2
- **typed-factorio**: Type definitions for Factorio modding API
- **factorio-test**: Testing framework for Factorio mods

## Important Notes

- The release build bundles everything into a single `control.lua` file
- `src/old-control` is required at the end of `main.ts` for compatibility
- Metatables must be registered for DataCollector classes to persist across save/load
- Entity tracking uses unit_number as the key (unique identifier for entities)
- When adding new DataCollectors, register them in `src/main.ts` using `addDataCollector()`

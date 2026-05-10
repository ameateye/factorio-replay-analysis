# Factorio replay analysis

Generates a control.lua that that collects certain data about a replay, then exports the data to a json file.

To use:
- (optional) customize main.ts, and recompile.
- Replace the existing control.lua in a replay save file with the generated `out/control.lua`
  - see script: ./install.sh <save-file>
- Run the replay
- Take a (new) save of the replay at some point
- Load the save
- run `/export-replay-data`

Optionally, data is also exported immediately after first rocket launch.

For the shape and field semantics of every output JSON, see [docs/outputs.md](docs/outputs.md). Each output starts with a `manifest` header (`collector`, `schemaVersion`, `description`) so files are self-describing.

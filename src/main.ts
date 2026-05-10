import { add_lib } from "event_handler"
import { addDataCollector, exportAllData } from "./data-collector"
import BufferAmounts from "./dataCollectors/buffer-amounts"
import EntityLayout from "./dataCollectors/entity-layout"
import LabContents from "./dataCollectors/lab-contents"
import MachineProduction from "./dataCollectors/machine-production"
import MinerActivity from "./dataCollectors/miner-activity"
import PlayerInventory from "./dataCollectors/player-inventory"
import PlayerPosition from "./dataCollectors/player-position"
import ResearchTiming from "./dataCollectors/research-timing"
import RoboportUsage from "./dataCollectors/roboport-usage"
import RocketLaunchTime from "./dataCollectors/rocket-launch-time"

const exportOnSiloLaunch = true

addDataCollector(new PlayerPosition())
addDataCollector(new PlayerInventory(60))
addDataCollector(
  new MachineProduction([
    "assembling-machine-1",
    "assembling-machine-2",
    "assembling-machine-3",
    "chemical-plant",
    "oil-refinery",
    "stone-furnace",
    "steel-furnace",
    "rocket-silo",
  ]),
)
addDataCollector(new BufferAmounts())
addDataCollector(new LabContents())
addDataCollector(new EntityLayout())
addDataCollector(new MinerActivity())
addDataCollector(new ResearchTiming())
addDataCollector(new RocketLaunchTime())
addDataCollector(new RoboportUsage())

// options
if (exportOnSiloLaunch) {
  add_lib({
    events: {
      [defines.events.on_rocket_launched]: () => exportAllData(),
    },
  })
}

commands.add_command("export-replay-data", "Export current collected replay data", () => {
  exportAllData()
  game.print("Exported data to script-output/replay-data/*.json")
})

require("@NoResolution:__base__/script/freeplay/control.lua")

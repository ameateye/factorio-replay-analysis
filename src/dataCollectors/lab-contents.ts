import { LuaEntity, MapPosition, nil } from "factorio:runtime"
import { DataCollector } from "../data-collector"
import { getTick } from "../tick"
import EntityTracker from "./entity-tracker"

export interface LabData {
  period: number
  sciencePacks: string[]
  labs: TrackedData[]
}

interface TrackedData {
  name: string
  unitNumber: number
  location: MapPosition
  timeBuilt: number
  packs: [time: number, ...packCounts: number[]][]
}

const sciencePacks: string[] = [
  "automation-science-pack",
  "logistic-science-pack",
  "chemical-science-pack",
  "military-science-pack",
  "production-science-pack",
  "utility-science-pack",
  "space-science-pack",
]

export default class LabContents extends EntityTracker<TrackedData> implements DataCollector<LabData> {
  manifest = {
    schemaVersion: 1,
    description: "Lab science-pack inventories sampled periodically; sciencePacks lists the column order in each lab's packs[] tuples.",
  }

  constructor(public nth_tick_period: number = 60) {
    super({ filter: "type", type: "lab" })
  }

  protected override initialData(entity: LuaEntity): TrackedData | nil {
    return {
      name: entity.name,
      unitNumber: entity.unit_number!,
      location: entity.position,
      timeBuilt: getTick(),
      packs: [],
    }
  }

  protected override onPeriodicUpdate(entity: LuaEntity, data: TrackedData) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const get_item_count = entity.get_inventory(defines.inventory.lab_input)!.get_item_count
    const packCounts = sciencePacks.map((pack) => get_item_count(pack))
    data.packs.push([getTick(), ...packCounts])
  }

  exportData(): LabData {
    const labData = Object.values(this.entityData).filter((data) =>
      data.packs.some((a) => a.some((amt, index) => index > 0 && amt > 0)),
    )
    return {
      period: this.nth_tick_period,
      sciencePacks,
      labs: labData,
    }
  }
}

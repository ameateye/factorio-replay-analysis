import {
  EntityPrototypeFilterWrite,
  LuaEntity,
  MapPosition,
  nil,
  OnEntityDiedEvent,
  OnPrePlayerMinedItemEvent,
  OnRobotPreMinedEvent,
  UnitNumber,
} from "factorio:runtime"
import { DataCollector } from "../data-collector"
import { getTick } from "../tick"
import EntityTracker from "./entity-tracker"

export interface BufferData {
  period: number
  buffers: TrackedBufferData[]
}

interface TrackedBufferData {
  name: string
  unitNumber: number
  location: MapPosition
  timeBuilt: number
  timeRemoved?: number
  type: "chest" | "tank"
  // Per-item diff-compressed amount series: contents[item] = [[tick, amount], ...].
  // A sample is appended only when that item's amount changes since the previous
  // period; reconstruct the value at any tick by sample-and-hold (hold the last
  // recorded amount forward). Replaces the old single-item content/amounts pair —
  // a chest holding several item types now records a series per type.
  contents: Record<string, [time: number, amount: number][]>
}

interface EntityData {
  name: string
  unitNumber: UnitNumber
  location: MapPosition
  timeBuilt: number
  timeRemoved?: number
  type: "chest" | "tank"
  contents: Record<string, [time: number, amount: number][]>
  last: Record<string, number> // last recorded amount per item, for diffing
}

export default class BufferAmounts extends EntityTracker<EntityData> implements DataCollector<BufferData> {
  manifest = {
    schemaVersion: 3,
    description:
      "Diff-compressed per-item contents of chests and tanks over time. Each buffer carries contents[item] = [[tick, amount], ...], a sample only when that item's amount changes (sample-and-hold between samples). timeRemoved is set on the buffer record when the entity is mined, upgraded away, or dies.",
  }

  constructor(
    public nth_tick_period: number = 60 * 5,
    public includeTanks: boolean = true,
  ) {
    const filters: EntityPrototypeFilterWrite[] = [
      {
        filter: "type",
        type: ["container", "logistic-container"],
      },
    ]
    if (includeTanks) {
      filters.push({
        filter: "type",
        type: "storage-tank",
        mode: "or",
      })
    }
    super(...filters)
  }

  protected override initialData(entity: LuaEntity): EntityData | nil {
    const type = entity.type == "storage-tank" ? "tank" : "chest"
    return {
      name: entity.name,
      type,
      unitNumber: entity.unit_number!,
      location: entity.position,
      timeBuilt: getTick(),
      contents: {},
      last: {},
    }
  }

  protected override onPeriodicUpdate(entity: LuaEntity, data: EntityData) {
    const t = getTick()
    const contents = data.contents
    const last = data.last

    let current: Record<string, number>
    if (data.type == "tank") {
      current = entity.get_fluid_contents()
    } else {
      current = {}
      for (const item of entity.get_inventory(defines.inventory.chest)!.get_contents()) {
        current[item.name] = item.count
      }
    }

    // items present now whose amount changed (or first appeared)
    for (const [name, amt] of pairs(current)) {
      if (last[name] != amt) {
        const series = contents[name] ?? (contents[name] = [])
        series.push([t, amt])
        last[name] = amt
      }
    }
    // items that emptied out since the last period
    for (const [name, prev] of pairs(last)) {
      if (prev != 0 && current[name] == nil) {
        contents[name]!.push([t, 0])
        last[name] = 0
      }
    }
  }

  protected override onDeleted(
    _entity: LuaEntity,
    _event: OnPrePlayerMinedItemEvent | OnRobotPreMinedEvent | OnEntityDiedEvent,
    data: EntityData,
  ) {
    data.timeRemoved = getTick()
  }

  exportData(): BufferData {
    const buffers: TrackedBufferData[] = []
    // Iterate entityData (not trackedEntities) so buffers removed before export —
    // mined, upgraded away, or destroyed — are still emitted with their
    // timeRemoved. Mirrors MachineProduction.exportData.
    for (const [, data] of pairs(this.entityData)) {
      const contents: Record<string, [time: number, amount: number][]> = {}
      for (const [item, series] of pairs(data.contents)) {
        const remove = table.remove
        while (series.length > 0 && series[series.length - 1][1] == 0) {
          remove(series)
        }
        if (series.length > 0) contents[item] = series
      }
      if (next(contents)[0] == nil) continue // nothing was ever stored here
      buffers.push({
        name: data.name,
        type: data.type,
        unitNumber: data.unitNumber,
        location: data.location,
        timeBuilt: data.timeBuilt,
        timeRemoved: data.timeRemoved,
        contents,
      })
    }
    return {
      period: this.nth_tick_period,
      buffers,
    }
  }
}

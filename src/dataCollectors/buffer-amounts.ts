import { EntityPrototypeFilterWrite, LuaEntity, MapPosition, nil, UnitNumber } from "factorio:runtime"
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
  type: "chest" | "tank"
  content: string
  amounts: [time: number, amount: number][]
}

interface EntityData {
  content?: string
  name: string
  unitNumber: UnitNumber
  location: MapPosition
  timeBuilt: number
  type: "chest" | "tank"

  itemCounts?: {
    time: number
    counts: Record<string, number>
  }[]

  amounts?: [time: number, amount: number][]
}

export default class BufferAmounts extends EntityTracker<EntityData> implements DataCollector<BufferData> {
  manifest = {
    schemaVersion: 1,
    description: "Per-tick contents of chests and tanks tracked over time, with detected primary item per buffer.",
  }

  constructor(
    public nth_tick_period: number = 60 * 5,
    public minDataPointsToDetermineItem: number = 5,
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
      itemCounts: [],
    }
  }

  private getMajorityKey(obj: Record<string, number>, threshold: number): string | nil {
    let maxKey: string | nil
    let max = 0
    let total = 0
    for (const [key, value] of pairs(obj)) {
      if (value > max) {
        max = value
        maxKey = key
      }
      total += value
    }
    if (max >= total * threshold) {
      return maxKey
    }
  }

  protected override onPeriodicUpdate(entity: LuaEntity, data: EntityData) {
    const amounts = data.amounts
    if (amounts) {
      const counts =
        data.type == "tank"
          ? entity.get_fluid_count(assert(data.content))
          : entity.get_inventory(defines.inventory.chest)!.get_item_count(assert(data.content))
      amounts.push([getTick(), counts])
    } else {
      const itemCounts = assert(data.itemCounts)
      let counts: Record<string, number>
      if (data.type == "tank") {
        counts = entity.get_fluid_contents()
      } else {
        const items = entity.get_inventory(defines.inventory.chest)!.get_contents()
        counts = {}
        for (const item of items) {
          counts[item.name] = item.count
        }
      }
      if (next(counts)[0] == nil) return
      itemCounts.push({ time: getTick(), counts })
      if (itemCounts.length == this.minDataPointsToDetermineItem) {
        this.determineItemType(data)
      }
      return
    }
  }

  private determineItemType(data: EntityData) {
    const maxAtTime: Record<string, number> = {}
    const itemCounts = data.itemCounts!
    for (const { counts } of itemCounts) {
      const maxKey = this.getMajorityKey(counts, 2 / 3)
      if (maxKey) {
        maxAtTime[maxKey] = (maxAtTime[maxKey] ?? 0) + 1
      }
    }
    const finalMax = this.getMajorityKey(maxAtTime, 1 / 2)
    if (!finalMax) {
      // a multiplicity of items, probably not a buffer
      this.stopTracking(data.unitNumber)
      return
    }
    data.content = finalMax

    data.amounts = []
    for (const { time, counts } of itemCounts) {
      data.amounts.push([time, counts[finalMax] ?? 0])
    }

    delete data.itemCounts
  }

  exportData(): BufferData {
    const buffers: TrackedBufferData[] = []
    for (const [unitNumber, entity] of pairs(this.trackedEntities)) {
      const data = this.getEntityData(entity, unitNumber)
      const amounts = data?.amounts
      if (!amounts || !amounts[0]) continue
      const remove = table.remove
      while (amounts[amounts.length - 1][1] == 0) {
        remove(amounts)
      }
      if (!amounts[0]) continue
      buffers.push({
        name: data.name,
        type: data.type,
        unitNumber: data.unitNumber,
        location: data.location,
        timeBuilt: data.timeBuilt,
        content: data.content!,
        amounts: amounts,
      })
    }
    return {
      period: this.nth_tick_period,
      buffers,
    }
  }
}

import {
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

type EntityStatus = keyof typeof defines.entity_status | "unknown"

interface TrackedMinerData {
  name: string
  unitNumber: UnitNumber
  location: MapPosition
  direction: number
  timeBuilt: number
  timeRemoved?: number
  resources: string[]
  statuses: [time: number, status: EntityStatus][]
}

export interface MinerActivityData {
  period: number
  miners: TrackedMinerData[]
}

const reverseMap: Record<defines.entity_status, EntityStatus> = {}
for (const [key, value] of pairs(defines.entity_status)) {
  reverseMap[value] = key
}

function getResourcesInRange(entity: LuaEntity): string[] {
  const proto = prototypes.entity[entity.name]
  const radius = proto.mining_drill_radius ?? 2.5
  const resources = entity.surface.find_entities_filtered({
    position: entity.position,
    radius,
    type: "resource",
  })
  const seen: Record<string, true> = {}
  const out: string[] = []
  for (const r of resources) {
    if (!seen[r.name]) {
      seen[r.name] = true
      out.push(r.name)
    }
  }
  return out
}

export default class MinerActivity
  extends EntityTracker<TrackedMinerData>
  implements DataCollector<MinerActivityData>
{
  manifest = {
    schemaVersion: 1,
    description: "Mining-drill statuses sampled periodically with location, direction, and the resources covered.",
  }

  constructor(public nth_tick_period: number = 60 * 5) {
    super({ filter: "type", type: "mining-drill" })
  }

  override initialData(entity: LuaEntity): TrackedMinerData {
    return {
      name: entity.name,
      unitNumber: entity.unit_number!,
      location: entity.position,
      direction: entity.direction,
      timeBuilt: getTick(),
      resources: getResourcesInRange(entity),
      statuses: [],
    }
  }

  protected override onDeleted(
    _entity: LuaEntity,
    _event: OnPrePlayerMinedItemEvent | OnRobotPreMinedEvent | OnEntityDiedEvent,
    data: TrackedMinerData,
  ) {
    data.timeRemoved = getTick()
  }

  override onPeriodicUpdate(entity: LuaEntity, data: TrackedMinerData) {
    const status = entity.status
    const statusText: EntityStatus = status != nil ? (reverseMap[status] ?? "unknown") : "unknown"
    const last = data.statuses[data.statuses.length - 1]
    if (last && last[1] == statusText) return
    data.statuses.push([getTick(), statusText])
  }

  exportData(): MinerActivityData {
    const miners: TrackedMinerData[] = []
    for (const [, data] of pairs(this.entityData)) {
      miners.push(data)
    }
    return { period: this.nth_tick_period, miners }
  }
}

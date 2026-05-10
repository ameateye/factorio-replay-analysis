import {
  LuaEntity,
  MapPosition,
  nil,
  OnBuiltEntityEvent,
  OnEntityDiedEvent,
  OnPrePlayerMinedItemEvent,
  OnRobotBuiltEntityEvent,
  OnRobotPreMinedEvent,
  ScriptRaisedBuiltEvent,
  UnitNumber,
} from "factorio:runtime"
import { DataCollector } from "../data-collector"
import { getTick } from "../tick"
import EntityTracker from "./entity-tracker"

export interface RoboportUsageData {
  period: number
  roboports: TrackedRoboportData[]
}

interface TrackedRoboportData {
  unitNumber: UnitNumber
  location: MapPosition
  timeBuilt: number
  usage: [time: number, numCharging: number, numWaiting: number][]
  timeRemoved?: number
  removedReason?: "deconstructed" | "mined" | "destroyed"
}

export default class RoboportUsage
  extends EntityTracker<TrackedRoboportData>
  implements DataCollector<RoboportUsageData>
{
  manifest = {
    schemaVersion: 1,
    description: "Per-roboport charging and waiting bot counts sampled periodically; lifecycle includes removal reason.",
  }

  constructor(public nth_tick_period = 30) {
    super({
      filter: "type",
      type: "roboport",
    })
  }

  protected initialData(
    entity: LuaEntity,
    event: OnBuiltEntityEvent | OnRobotBuiltEntityEvent | ScriptRaisedBuiltEvent,
  ): nil | TrackedRoboportData {
    if (!entity.logistic_cell) return
    return {
      unitNumber: entity.unit_number!,
      location: entity.position,
      timeBuilt: event.tick,
      usage: [],
    }
  }

  protected onPeriodicUpdate(entity: LuaEntity, data: TrackedRoboportData): void {
    data.usage.push([
      getTick(),
      entity.logistic_cell!.charging_robot_count,
      entity.logistic_cell!.to_charge_robot_count,
    ])
  }

  protected override onDeleted(
    _entity: LuaEntity,
    event: OnPrePlayerMinedItemEvent | OnRobotPreMinedEvent | OnEntityDiedEvent,
    data: TrackedRoboportData,
  ) {
    data.timeRemoved = event.tick
    data.removedReason =
      event.name === defines.events.on_pre_player_mined_item
        ? "mined"
        : event.name === defines.events.on_robot_pre_mined
          ? "deconstructed"
          : "destroyed"
  }

  exportData(): RoboportUsageData {
    for (const [unitNumber, data] of pairs(this.entityData)) {
      if (!data.usage.some(([, numCharging, numWaiting]) => numCharging > 0 || numWaiting > 0)) {
        delete this.entityData[unitNumber]
      }
    }
    return {
      period: this.nth_tick_period,
      roboports: Object.values(this.entityData),
    }
  }
}

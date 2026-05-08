import {
  EntityPrototypeFilterWrite,
  LuaEntity,
  MapPosition,
  OnBuiltEntityEvent,
  OnEntityDiedEvent,
  OnPrePlayerMinedItemEvent,
  OnRobotBuiltEntityEvent,
  OnRobotPreMinedEvent,
  ScriptRaisedBuiltEvent,
  UnitNumber,
} from "factorio:runtime"
import { DataCollector, EventHandlers } from "../data-collector"
import { getTick } from "../tick"

type EntityCategory = "belt" | "inserter" | "pole"

interface LayoutEntity {
  name: string
  unitNumber: number
  category: EntityCategory
  beltType?: "transport-belt" | "underground-belt" | "splitter"
  location: MapPosition
  direction: number
  timeBuilt: number
  timeRemoved?: number
}

export interface EntityLayoutData {
  entities: LayoutEntity[]
}

const FILTERS: EntityPrototypeFilterWrite[] = [
  { filter: "type", type: "transport-belt" },
  { filter: "type", type: "underground-belt", mode: "or" },
  { filter: "type", type: "splitter", mode: "or" },
  { filter: "type", type: "inserter", mode: "or" },
  { filter: "type", type: "electric-pole", mode: "or" },
]

const TYPE_TO_CATEGORY: Record<string, EntityCategory> = {
  "transport-belt": "belt",
  "underground-belt": "belt",
  "splitter": "belt",
  "inserter": "inserter",
  "electric-pole": "pole",
}

export default class EntityLayout implements DataCollector<EntityLayoutData>, EventHandlers {
  prototypes = new LuaSet<string>()
  entityData: Record<UnitNumber, LayoutEntity> = {}

  on_init() {
    for (const [name] of prototypes.get_entity_filtered(FILTERS)) {
      this.prototypes.add(name)
    }
  }

  private onCreated(entity: LuaEntity) {
    const unitNumber = entity.unit_number
    if (!unitNumber || !this.prototypes.has(entity.name)) return
    const category = TYPE_TO_CATEGORY[entity.type]
    if (!category) return
    const record: LayoutEntity = {
      name: entity.name,
      unitNumber,
      category,
      location: entity.position,
      direction: entity.direction,
      timeBuilt: getTick(),
    }
    if (category == "belt") {
      record.beltType = entity.type as "transport-belt" | "underground-belt" | "splitter"
    }
    this.entityData[unitNumber] = record
  }

  private onRemoved(entity: LuaEntity) {
    const unitNumber = entity.unit_number
    if (!unitNumber) return
    const data = this.entityData[unitNumber]
    if (!data) return
    data.timeRemoved = getTick()
  }

  on_built_entity(event: OnBuiltEntityEvent) {
    this.onCreated(event.entity)
  }
  on_robot_built_entity(event: OnRobotBuiltEntityEvent) {
    this.onCreated(event.entity)
  }
  script_raised_built(event: ScriptRaisedBuiltEvent) {
    this.onCreated(event.entity)
  }
  on_pre_player_mined_item(event: OnPrePlayerMinedItemEvent) {
    this.onRemoved(event.entity)
  }
  on_robot_pre_mined(event: OnRobotPreMinedEvent) {
    this.onRemoved(event.entity)
  }
  on_entity_died(event: OnEntityDiedEvent) {
    this.onRemoved(event.entity)
  }

  exportData(): EntityLayoutData {
    const entities: LayoutEntity[] = []
    for (const [, data] of pairs(this.entityData)) {
      entities.push(data)
    }
    return { entities }
  }
}

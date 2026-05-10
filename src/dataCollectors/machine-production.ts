/* eslint-disable @typescript-eslint/unbound-method */
import {
  LuaEntity,
  MapPosition,
  nil,
  OnEntityDiedEvent,
  OnEntitySettingsPastedEvent,
  OnGuiClosedEvent,
  OnMarkedForDeconstructionEvent,
  OnPlayerCursorStackChangedEvent,
  OnPlayerFastTransferredEvent,
  OnPrePlayerMinedItemEvent,
  OnRobotPreMinedEvent,
  UnitNumber,
} from "factorio:runtime"
import { list_to_map } from "util"
import { DataCollector } from "../data-collector"
import { getTick } from "../tick"
import EntityTracker from "./entity-tracker"

type EntityStatus = keyof typeof defines.entity_status | "unknown"

interface MachineProductionData {
  period: number
  machines: MachineData[]
}

interface MachineData {
  name: string
  unitNumber: number
  location: MapPosition
  direction: number
  timeBuilt: number
  timeRemoved?: number
  recipes: MachineRecipeProduction[]
}

interface MachineRecipeProduction {
  // bottom 3 is primary key
  recipe: string
  craftingSpeed: number
  productivityBonus: number

  timeStarted: number

  timeStopped?: number
  stoppedReason?: StopReason

  production: [
    time: number,
    productsFinished: number,
    craftingProgress: number,
    productivityProgress: number,
    status: EntityStatus,
    additionalInfo?: unknown,
  ][]
}

type StopReason = "configuration_changed" | "mined" | "entity_died" | "marked_for_deconstruction" | "disabled_by_script"

interface MachineConfig {
  recipe: string
  craftingSpeed: number
  productivityBonus: number
}

function machineConfigEqual(a: MachineConfig, b: MachineConfig) {
  return a.recipe == b.recipe && a.craftingSpeed == b.craftingSpeed && a.productivityBonus == b.productivityBonus
}

function nullableEqual<T>(a: T | nil, b: T | nil, equal: (a: T, b: T) => boolean) {
  if (a == nil) return b == nil
  if (b == nil) return false
  return equal(a, b)
}

const stoppedStatuses = {
  disabled_by_script: true,
  marked_for_deconstruction: true,
  no_recipe: true,
} as const

function isStoppingStatus(
  status: EntityStatus,
): status is "disabled_by_script" | "marked_for_deconstruction" | "no_recipe" {
  return status in stoppedStatuses
}

// assemblers, chem plants, refineries, furnaces

const commonStatuses = list_to_map<string>([
  "working",
  "normal",
  "no_power",
  "low_power",
  "no_fuel",
  "disabled_by_control_behavior",
  "disabled_by_script",
  "marked_for_deconstruction",
] satisfies (keyof typeof defines.entity_status)[])
const craftingMachineStatuses = list_to_map<string>([
  ...commonStatuses,
  "no_recipe",
  "fluid_ingredient_shortage",
  "full_output",
  "item_ingredient_shortage",
])
const furnaceStatuses = list_to_map<string>([...commonStatuses, "no_ingredients", "full_output"])
// Rocket silo cycles through extra states between rocket-part stages: it
// crafts parts (item_ingredient_shortage / working / etc.), then goes
// preparing → waiting → launching as the rocket leaves. Treat these as
// non-stopping running states so we don't false-trigger configuration_changed.
const rocketSiloStatuses = list_to_map<string>([
  ...craftingMachineStatuses,
  "preparing_rocket_for_launch",
  "waiting_to_launch_rocket",
  "waiting_for_space_in_platform_hub",
  "launching_rocket",
])

const reverseMap: Record<defines.entity_status, EntityStatus> = {}
for (const [key, value] of pairs(defines.entity_status)) {
  reverseMap[value] = key
}

interface TrackedMachineData {
  name: string
  unitNumber: UnitNumber
  location: MapPosition
  direction: number
  timeBuilt: number
  timeRemoved?: number
  lastProductsFinished: number
  lastConfig?: MachineConfig
  recipeProduction: MachineRecipeProduction[]
}

export default class MachineProduction
  extends EntityTracker<TrackedMachineData>
  implements DataCollector<MachineProductionData>
{
  manifest = {
    schemaVersion: 2,
    description:
      "Per-recipe production runs on assemblers, furnaces, chemical plants, refineries, and rocket silos — products finished, crafting/productivity progress, and entity status sampled periodically. timeRemoved is set on the machine record when the entity is mined or dies.",
  }

  constructor(
    prototypes: string[],
    public nth_tick_period: number = 60 * 5,
  ) {
    super({
      filter: "name",
      name: prototypes,
    })
  }

  override on_init(): void {
    super.on_init()
    for (const name of this.prototypes) {
      const prototype = prototypes.entity[name]
      assert(
        prototype.type == "assembling-machine" || prototype.type == "furnace" || prototype.type == "rocket-silo",
        `Not a crafting machine or furnace: ${name}`,
      )
    }
  }

  private getStatus(entity: LuaEntity): EntityStatus {
    const keys =
      entity.type == "rocket-silo"
        ? rocketSiloStatuses
        : entity.type == "assembling-machine"
          ? craftingMachineStatuses
          : entity.type == "furnace"
            ? furnaceStatuses
            : error("Invalid entity type")

    const status = entity.status
    if (status == nil) return "unknown"
    const statusText = reverseMap[status]
    if (keys.has(statusText)) {
      return statusText
    }
    log("Unknown status for crafting machine: " + status)
    for (const [key, value] of pairs(defines.entity_status)) {
      log(key + " " + value)
    }
    return "unknown"
  }

  override initialData(entity: LuaEntity): TrackedMachineData {
    return {
      name: entity.name,
      unitNumber: entity.unit_number!,
      location: entity.position,
      direction: entity.direction,
      timeBuilt: getTick(),
      lastProductsFinished: 0,
      lastConfig: nil,
      recipeProduction: [],
    }
  }

  private addDataPoint(entity: LuaEntity, info: TrackedMachineData, status: EntityStatus) {
    const tick = getTick()
    const configEntries = info.recipeProduction
    const currentConfig = configEntries[configEntries.length - 1]

    const lastEntry = currentConfig.production[currentConfig.production.length - 1]
    if (!(lastEntry == nil || lastEntry[0] != tick)) {
      return
    }
    const productsFinished = entity.products_finished
    const delta = productsFinished - info.lastProductsFinished
    info.lastProductsFinished = productsFinished

    const craftingProgress = entity.crafting_progress
    const bonusProgress = entity.bonus_progress

    let extraInfo: unknown = nil
    if (status == "item_ingredient_shortage") {
      const get_item_count = entity.get_inventory(defines.inventory.assembling_machine_input)!.get_item_count
      const needed = entity.get_recipe()[0]!.ingredients
      const missingIngredients: string[] = []
      for (const { type, amount, name } of needed) {
        if (type != "item") continue
        const currentAmount = get_item_count(name)
        if (currentAmount == nil || currentAmount < amount) {
          missingIngredients.push(name)
        }
      }
      extraInfo = missingIngredients
    } else if (status == "fluid_ingredient_shortage") {
      const needed = entity.get_recipe()[0]!.ingredients
      const missingIngredients: string[] = []
      for (const { type, amount, name } of needed) {
        if (type != "fluid") continue
        const currentAmount = entity.get_fluid_count(name)
        if (currentAmount == nil || currentAmount < amount) {
          missingIngredients.push(name)
        }
      }
      extraInfo = missingIngredients
    }

    currentConfig.production.push([tick, delta, craftingProgress, bonusProgress, status, extraInfo])
  }

  private markProductionFinished(
    entity: LuaEntity,
    info: TrackedMachineData,
    status: EntityStatus,
    reason: StopReason,
  ) {
    info.lastConfig = nil
    const recipeProduction = info.recipeProduction
    const lastProduction = recipeProduction[recipeProduction.length - 1]
    if (lastProduction == nil) return
    this.addDataPoint(entity, info, status)
    const production = lastProduction.production
    if (production.length === 0 || production.every(([, delta]) => delta == 0)) {
      recipeProduction.pop()
      return
    }
    lastProduction.timeStopped = getTick()
    lastProduction.stoppedReason = reason
  }

  private startNewProduction(info: TrackedMachineData, config: MachineConfig) {
    info.lastConfig = config
    info.recipeProduction.push({
      recipe: config.recipe,
      craftingSpeed: config.craftingSpeed,
      productivityBonus: config.productivityBonus,
      timeStarted: getTick(),
      production: [],
    })
  }

  private tryCheckRunningChanged(entity: LuaEntity, knownStopReason?: StopReason) {
    const info = this.getEntityData(entity)
    if (info) {
      this.checkRunningChanged(entity, info, nil, knownStopReason)
    }
  }

  /**
   * checks if stopped, recipe changed, or newly started
   */
  private checkRunningChanged(
    entity: LuaEntity,
    info: TrackedMachineData,
    status: EntityStatus | nil,
    knownStopReason: StopReason | nil,
  ): LuaMultiReturn<[updated: boolean, isRunning: boolean]> {
    status ??= this.getStatus(entity)
    const isStopped = knownStopReason != nil || isStoppingStatus(status)

    const recipe = (entity.get_recipe()[0] ?? (entity.type == "furnace" ? entity.previous_recipe?.name : nil))?.name
    const lastConfig = info.lastConfig
    const config: MachineConfig | nil = recipe
      ? {
          recipe,
          craftingSpeed: entity.crafting_speed,
          productivityBonus: entity.productivity_bonus,
        }
      : nil

    const configChanged = !nullableEqual(lastConfig, config, machineConfigEqual)

    let updated = false
    if (lastConfig) {
      if (configChanged) {
        this.markProductionFinished(entity, info, status, "configuration_changed")
        updated = true
      } else if (isStopped) {
        this.markProductionFinished(entity, info, status, knownStopReason ?? (status as StopReason))
        updated = true
      }
    }
    if (config && (configChanged || info.recipeProduction.length == 0)) {
      this.startNewProduction(info, config)
      updated = true
    }
    return $multi(updated, !isStopped && config != nil)
  }

  protected override onDeleted(
    entity: LuaEntity,
    event: OnPrePlayerMinedItemEvent | OnRobotPreMinedEvent | OnEntityDiedEvent,
    info: TrackedMachineData,
  ) {
    this.checkRunningChanged(entity, info, nil, event.name == defines.events.on_entity_died ? "entity_died" : "mined")
    info.timeRemoved = getTick()
  }

  on_marked_for_deconstruction(event: OnMarkedForDeconstructionEvent) {
    this.tryCheckRunningChanged(event.entity, "marked_for_deconstruction")
  }

  on_cancelled_deconstruction(event: OnMarkedForDeconstructionEvent) {
    this.tryCheckRunningChanged(event.entity, nil)
  }

  on_gui_closed(event: OnGuiClosedEvent) {
    if (event.entity) this.tryCheckRunningChanged(event.entity, nil)
  }

  on_entity_settings_pasted(event: OnEntitySettingsPastedEvent) {
    this.tryCheckRunningChanged(event.destination, nil)
  }

  on_player_fast_transferred(event: OnPlayerFastTransferredEvent) {
    this.tryCheckRunningChanged(event.entity, nil)
  }

  on_player_cursor_stack_changed(event: OnPlayerCursorStackChangedEvent) {
    const player = game.players[event.player_index]
    const selected = player.selected
    if (selected) {
      this.tryCheckRunningChanged(selected, nil)
    }
  }

  override onPeriodicUpdate(entity: LuaEntity, data: TrackedMachineData) {
    const status = this.getStatus(entity)
    const [updated, isRunning] = this.checkRunningChanged(entity, data, status, nil)
    const shouldAddDataPoint = !updated && isRunning
    if (shouldAddDataPoint) {
      this.addDataPoint(entity, data, status)
    }
  }

  exportData(): MachineProductionData {
    const machines: MachineData[] = []
    for (const [, machine] of pairs(this.entityData)) {
      const recipes = machine.recipeProduction
      while (
        recipes.length > 0 &&
        (recipes[recipes.length - 1].production.length == 0 ||
          recipes[recipes.length - 1].production.every(([, delta]) => delta == 0))
      ) {
        recipes.pop()
      }
      if (recipes.length == 0) continue
      machines.push({
        name: machine.name,
        unitNumber: machine.unitNumber,
        location: machine.location,
        direction: machine.direction,
        timeBuilt: machine.timeBuilt,
        timeRemoved: machine.timeRemoved,
        recipes,
      })
    }
    return {
      period: this.nth_tick_period,
      machines,
    }
  }
}

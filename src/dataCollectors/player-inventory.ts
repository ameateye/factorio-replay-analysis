import { CraftingQueueItem, NthTickEventData, OnPlayerCraftedItemEvent } from "factorio:runtime"
import { DataCollector } from "../data-collector"
import { getTick } from "../tick"

export interface PlayerInventoryData {
  period: number
  players: {
    [playerName: string]: TrackedPlayerData
  }
}

interface TrackedPlayerData {
  inventory: Record<string, number>[]
  craftingQueue: Omit<CraftingQueueItem, "index">[][]
  craftingEvents: {
    time: number
    recipe: string
  }[]
}

export default class PlayerInventory implements DataCollector<PlayerInventoryData> {
  manifest = {
    schemaVersion: 1,
    description: "Per-player inventory snapshots, crafting queue snapshots, and crafting-finished events.",
  }

  constructor(public nth_tick_period: number = 360) {}

  players: Record<string, TrackedPlayerData> = {}

  on_nth_tick(event: NthTickEventData) {
    for (const [, player] of game.players) {
      const name = player.name
      let playerData = this.players[name]
      if (!playerData) {
        playerData = this.players[name] = {
          inventory: [],
          craftingQueue: [],
          craftingEvents: [],
        }
        for (let i = 0; i < event.tick; i += this.nth_tick_period) {
          playerData.inventory.push({})
          playerData.craftingQueue.push([])
        }
      }

      const inventoryContents = player.get_main_inventory()?.get_contents() ?? []
      const counts: Record<string, number> = {}
      for (const item of inventoryContents) {
        counts[item.name] = item.count
      }
      playerData.inventory.push(counts)
      const craftingQueue =
        (player.controller_type == defines.controllers.character &&
          player.crafting_queue?.map((item) => ({
            recipe: item.recipe,
            item: item.recipe,
            count: item.count,
            prerequisite: item.prerequisite,
          }))) ||
        []
      playerData.craftingQueue.push(craftingQueue)
    }
  }

  on_player_crafted_item(event: OnPlayerCraftedItemEvent) {
    const playerName = game.get_player(event.player_index)!.name
    const playerData = (this.players[playerName] ??= {
      inventory: [],
      craftingQueue: [],
      craftingEvents: [],
    })
    const recipe = event.recipe
    playerData.craftingEvents.push({
      time: getTick(),
      recipe: recipe.name,
    })
  }

  exportData(): PlayerInventoryData {
    return {
      period: this.nth_tick_period,
      players: this.players,
    }
  }
}

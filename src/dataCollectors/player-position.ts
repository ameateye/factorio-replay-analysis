import { NthTickEventData } from "factorio:runtime"
import { DataCollector } from "../data-collector"

interface PlayerPositionData {
  period: number
  players: {
    [playerName: string]: [x: number, y: number][]
  }
}

const floor = math.floor
export default class PlayerPosition implements DataCollector<PlayerPositionData> {
  manifest = {
    schemaVersion: 1,
    description: "Per-player (x, y) position rounded to integer tiles, sampled periodically.",
  }

  constructor(public nth_tick_period: number = 60) {}

  players: Record<string, [x: number, y: number][]> = {}

  on_nth_tick(event: NthTickEventData): void {
    for (const [, player] of game.players) {
      const name = player.name
      const position = player.position
      const x = floor(position.x + 0.5)
      const y = floor(position.y + 0.5)
      if (!this.players[name]) {
        this.players[name] = []
        for (let i = 0; i < event.tick; i += this.nth_tick_period) {
          this.players[name].push([x, y])
        }
      }
      this.players[name].push([x, y])
    }
  }

  exportData(): PlayerPositionData {
    return {
      period: this.nth_tick_period,
      players: this.players,
    }
  }
}

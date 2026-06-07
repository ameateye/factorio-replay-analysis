import {
  MapPosition,
  OnEntityDiedEvent,
  OnPlayerDiedEvent,
  OnPlayerFastTransferredEvent,
  OnPlayerMinedEntityEvent,
} from "factorio:runtime"
import { DataCollector } from "../data-collector"

const floor = math.floor

interface Pos {
  x: number
  y: number
}

// One chronological stream of discrete player/world events, discriminated by
// `type`. Hooks fire during playback in tick order, so `events` is already
// sorted — consumers just walk it.
type GameEvent =
  // Environmental harvest by hand. `kind` is classified from entity.type;
  // `products` is the actual mined yield (from the event buffer), so wood per
  // tree / stone+coal per rock are exact rather than inventory-delta guesses.
  // Ore-by-hand is intentionally excluded: on_player_mined_entity only fires
  // when a resource entity is fully depleted, not per unit mined.
  | {
      tick: number
      type: "harvest"
      player: string
      kind: "tree" | "rock" | "fish"
      entity: string
      position: Pos
      products: Record<string, number>
    }
  // An enemy-force entity died (biter / spawner / worm). `byPlayer` is true
  // when the killing cause was the player character, letting consumers keep
  // nest-clearing kills and drop incidental turret/attrition kills.
  | { tick: number; type: "kill"; name: string; entityType: string; position: Pos; byPlayer: boolean }
  // The player character died.
  | { tick: number; type: "death"; player: string; position?: Pos }
  // Ctrl-click fast-transfer into/out of an entity. The event carries no item
  // identity, so pair with playerInventory deltas to infer what moved (e.g.
  // coal into a burner = a manual refuel). `fromPlayer` true = player → entity.
  | {
      tick: number
      type: "transfer"
      player: string
      entity: string
      entityType: string
      position: Pos
      fromPlayer: boolean
    }

export interface GameEventsData {
  events: GameEvent[]
}

function pos(p: MapPosition): Pos {
  return { x: floor(p.x + 0.5), y: floor(p.y + 0.5) }
}

// Trees / rocks / fish are removed in a single mine, so on_player_mined_entity
// fires once per harvest. Rocks are simple-entities; other simple-entities
// aren't player-mineable for products, so the type check is sufficient.
function harvestKind(entityType: string): "tree" | "rock" | "fish" | undefined {
  if (entityType == "tree") return "tree"
  if (entityType == "fish") return "fish"
  if (entityType == "simple-entity") return "rock"
  return undefined
}

export default class GameEvents implements DataCollector<GameEventsData> {
  manifest = {
    schemaVersion: 1,
    description:
      "Discrete player/world events in tick order: environmental harvests (trees, rocks, fish), enemy kills, player deaths, and fast-transfers.",
  }

  events: GameEvent[] = []

  on_player_mined_entity(event: OnPlayerMinedEntityEvent) {
    const entity = event.entity
    if (!entity.valid) return
    const kind = harvestKind(entity.type)
    if (!kind) return

    const products: Record<string, number> = {}
    for (const item of event.buffer.get_contents()) {
      products[item.name] = (products[item.name] ?? 0) + item.count
    }

    this.events.push({
      tick: event.tick,
      type: "harvest",
      player: game.get_player(event.player_index)!.name,
      kind,
      entity: entity.name,
      position: pos(entity.position),
      products,
    })
  }

  on_entity_died(event: OnEntityDiedEvent) {
    const entity = event.entity
    if (!entity.valid || entity.force.name != "enemy") return

    this.events.push({
      tick: event.tick,
      type: "kill",
      name: entity.name,
      entityType: entity.type,
      position: pos(entity.position),
      byPlayer: event.cause?.type == "character",
    })
  }

  on_player_died(event: OnPlayerDiedEvent) {
    const player = game.get_player(event.player_index)
    this.events.push({
      tick: event.tick,
      type: "death",
      player: player?.name ?? `player-${event.player_index}`,
      position: player ? pos(player.position) : undefined,
    })
  }

  on_player_fast_transferred(event: OnPlayerFastTransferredEvent) {
    const entity = event.entity
    if (!entity.valid) return

    this.events.push({
      tick: event.tick,
      type: "transfer",
      player: game.get_player(event.player_index)!.name,
      entity: entity.name,
      entityType: entity.type,
      position: pos(entity.position),
      fromPlayer: event.from_player,
    })
  }

  exportData(): GameEventsData {
    return { events: this.events }
  }
}

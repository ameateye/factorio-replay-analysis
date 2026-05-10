import { add_lib, EventLib } from "event_handler"
import { NthTickEventData } from "factorio:runtime"

export type EventHandlers = {
  [K in keyof typeof defines.events]?: (this: unknown, event: (typeof defines.events)[K]["_eventData"]) => void
}

export interface CollectorManifest {
  // Bumped when the output JSON's shape changes in a way that affects
  // consumers. Pre-manifest extractions (no `manifest` field at all) should
  // be treated as legacy by readers. See docs/outputs.md for the canonical
  // per-version shape reference.
  schemaVersion: number
  // One-line description of what the output represents. Mirrors the
  // section heading in docs/outputs.md.
  description: string
}

export interface DataCollector<T extends object = object> extends EventHandlers {
  nth_tick_period?: number

  on_nth_tick?(event: NthTickEventData): void

  exportData(): T

  manifest?: CollectorManifest

  constructor: {
    name: string
  }

  on_init?(): void
}

const initialDataCollectors: Record<string, DataCollector> = {}

declare const storage: {
  dataCollectors?: Record<string, DataCollector>
}

function getDataCollectors(): Record<string, DataCollector> {
  if (!storage.dataCollectors) {
    storage.dataCollectors = initialDataCollectors
  }
  return storage.dataCollectors
}

export function addDataCollector(dataCollector: DataCollector): void {
  const lib: EventLib = {
    events: {},
    on_nth_tick: {},
  }
  const dataCollectorName = dataCollector.constructor.name
  script.register_metatable("dataCollector:" + dataCollectorName, getmetatable(dataCollector)!)
  if (initialDataCollectors[dataCollectorName]) {
    error("dataCollector already exists: " + dataCollectorName)
  }
  initialDataCollectors[dataCollectorName] = dataCollector

  for (const [name, id] of pairs(defines.events)) {
    if (dataCollector[name]) {
      lib.events![id] = (event: any) => {
        const dataCollector = getDataCollectors()[dataCollectorName]
        dataCollector[name]!(event)
      }
    }
  }
  if (dataCollector.on_nth_tick) {
    assert(dataCollector.nth_tick_period, "on_nth_tick requires nth_tick_period")
    lib.on_nth_tick![dataCollector.nth_tick_period!] = (event: NthTickEventData) => {
      getDataCollectors()[dataCollectorName].on_nth_tick!(event)
    }
  }

  if (dataCollector.on_init) {
    lib.on_init = () => {
      getDataCollectors()[dataCollectorName].on_init!()
    }
  }

  add_lib(lib)
}

add_lib({
  on_init() {
    getDataCollectors()
  },
  on_load() {
    __DebugAdapter?.breakpoint()
  },
  events: {
    [defines.events.on_game_created_from_scenario]: () => {
      getDataCollectors()
    },
  },
})

function getOutFileName(s: string): string {
  const lowerCamelCase = s[0].toLowerCase() + s.slice(1)
  if (lowerCamelCase.endsWith("DataCollector")) {
    return lowerCamelCase.slice(0, -"DataCollector".length)
  }
  return lowerCamelCase
}

export function exportAllData(): void {
  for (const [name, datum] of pairs(storage.dataCollectors!)) {
    const outname = `${getOutFileName(name)}.json`
    log(`Exporting ${name}`)
    const data = datum.exportData() as Record<string, unknown>
    const manifest = {
      collector: name,
      schemaVersion: datum.manifest?.schemaVersion ?? 1,
      description: datum.manifest?.description ?? "",
    }
    const wrapped: Record<string, unknown> = { manifest }
    for (const [k, v] of pairs(data)) {
      wrapped[k] = v
    }
    helpers.write_file(outname, helpers.table_to_json(wrapped))
  }
  log("Exported dataCollector data to script-output/*.json")
}

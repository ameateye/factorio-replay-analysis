import { DataCollector } from "../data-collector"
import { OnResearchCancelledEvent, OnResearchStartedEvent } from "factorio:runtime"

interface ResearchData {
  timeFirstStarted: Record<string, number>
  timeCompleted: Record<string, number>
  events: {
    time: number
    research: string
    type: "started" | "cancelled" | "completed"
  }[]
}

export default class ResearchTiming implements DataCollector<ResearchData> {
  manifest = {
    schemaVersion: 1,
    description: "Tech research events (started / cancelled / completed) plus first-started and completed tick maps.",
  }

  data: ResearchData = {
    timeFirstStarted: {},
    timeCompleted: {},
    events: [],
  }

  on_research_started(event: OnResearchStartedEvent) {
    const research = event.research.name
    const time = event.tick
    this.data.timeFirstStarted[research] ??= time
    this.data.events.push({ time, research, type: "started" })
  }

  on_research_cancelled(event: OnResearchCancelledEvent) {
    const time = event.tick
    for (const [research] of pairs(event.research)) {
      this.data.events.push({ time, research, type: "cancelled" })
    }
  }

  on_research_finished(event: OnResearchStartedEvent) {
    const research = event.research.name
    const time = event.tick
    this.data.timeCompleted[research] ??= time
    this.data.events.push({ time, research, type: "completed" })
  }

  exportData(): ResearchData {
    return this.data
  }
}

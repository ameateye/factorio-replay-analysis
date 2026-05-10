import { OnRocketLaunchedEvent } from "factorio:runtime"
import { DataCollector } from "../data-collector"

export default class RocketLaunchTime implements DataCollector<{ rocketLaunchTimes: number[] }> {
  manifest = {
    schemaVersion: 1,
    description: "Tick of each rocket launch in the run.",
  }

  launchTimes: number[] = []

  on_rocket_launched(event: OnRocketLaunchedEvent): void {
    this.launchTimes.push(event.tick)
  }

  exportData(): { rocketLaunchTimes: number[] } {
    return { rocketLaunchTimes: this.launchTimes }
  }
}

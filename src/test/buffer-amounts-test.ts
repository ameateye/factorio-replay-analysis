import { LuaEntity, LuaSurface, MapPosition } from "factorio:runtime"
import BufferAmounts from "../dataCollectors/buffer-amounts"
import expect from "tstl-expect"
import { testDataCollector } from "./test-util"

let surface: LuaSurface
before_each(() => {
  surface = game.surfaces[1]
})
after_each(() => {
  surface.find_entities().forEach((e) => e.destroy())
})

function createBufferChest(position: MapPosition = { x: 0.5, y: 0.5 }): LuaEntity {
  return assert(
    surface.create_entity({
      name: "iron-chest",
      position,
      raise_built: true,
    }),
  )
}

let dc: BufferAmounts
before_each(() => {
  dc = testDataCollector(new BufferAmounts(10))
})
after_all(() => {
  dc = nil!
})

test("empty buffer chest not counted", () => {
  createBufferChest()
  after_ticks(100, () => {
    const data = dc.exportData()
    expect(data.buffers).toEqual([])
  })
})

test("chest with single item: one diff-compressed series", () => {
  const chest = createBufferChest()
  chest.insert({ name: "iron-plate", count: 10 })
  after_ticks(100, () => {
    const data = dc.exportData()
    expect(data.buffers).toEqual([
      {
        name: "iron-chest",
        type: "chest",
        unitNumber: chest.unit_number,
        location: chest.position,
        timeBuilt: 0,
        contents: expect.anything(),
      },
    ])
    // The amount never changes after the first sample, so the diff keeps one point.
    expect(data.buffers[0].contents).toEqual({ "iron-plate": [[10, 10]] })
  })
})

test("chest with multiple items: a series per item", () => {
  const chest = createBufferChest()
  chest.insert({ name: "iron-plate", count: 20 })
  chest.insert({ name: "copper-plate", count: 15 })
  after_ticks(100, () => {
    const data = dc.exportData()
    expect(data.buffers[0].contents).toEqual({
      "iron-plate": [[10, 20]],
      "copper-plate": [[10, 15]],
    })
  })
})

test("tracks an item's amount over time (diff-compressed)", () => {
  const chest = createBufferChest()
  after_ticks(19, () => chest.insert({ name: "iron-plate", count: 5 }))
  after_ticks(29, () => chest.insert({ name: "iron-plate", count: 10 }))
  after_ticks(39, () => chest.remove_item({ name: "iron-plate", count: 4 }))
  after_ticks(49, () => chest.remove_item({ name: "iron-plate", count: 4 }))
  after_ticks(60, () => {
    const data = dc.exportData()
    // No sample at t=60: the amount is unchanged from t=50, so the diff omits it.
    expect(data.buffers[0].contents["iron-plate"]).toEqual([
      [20, 5],
      [30, 15],
      [40, 11],
      [50, 7],
    ])
  })
})

test("emptied item records a trailing zero, then is trimmed at export", () => {
  const chest = createBufferChest()
  chest.insert({ name: "iron-plate", count: 8 })
  after_ticks(25, () => chest.remove_item({ name: "iron-plate", count: 8 }))
  after_ticks(60, () => {
    const data = dc.exportData()
    // [10,8] then emptied to 0 at t=30; the trailing zero is trimmed on export,
    // leaving the last non-zero sample.
    expect(data.buffers[0].contents["iron-plate"]).toEqual([[10, 8]])
  })
})

test("mined chest still exported with timeRemoved", () => {
  const chest = createBufferChest()
  chest.insert({ name: "iron-plate", count: 10 })
  after_ticks(50, () => {
    game.players[1].mine_entity(chest)
  })
  after_ticks(100, () => {
    const data = dc.exportData()
    expect(data.buffers).toMatchTable([
      {
        name: "iron-chest",
        timeRemoved: 50,
      },
    ])
    expect(data.buffers[0].contents["iron-plate"]).toEqual([[10, 10]])
  })
})

test("tank with single fluid counted", () => {
  const tank = assert(
    surface.create_entity({
      name: "storage-tank",
      position: { x: 0.5, y: 0.5 },
      raise_built: true,
    }),
  )
  tank.fluidbox[0] = {
    name: "water",
    amount: 100,
    temperature: 15,
  }
  after_ticks(39, () => {
    tank.fluidbox[0] = {
      name: "water",
      amount: 200,
      temperature: 15,
    }
  })
  after_ticks(100, () => {
    const data = dc.exportData()
    expect(data.buffers).toEqual([
      {
        name: "storage-tank",
        type: "tank",
        unitNumber: tank.unit_number,
        location: tank.position,
        timeBuilt: 0,
        contents: expect.anything(),
      },
    ])
    expect(data.buffers[0].contents["water"]).toContainEqual([10, 100])
    expect(data.buffers[0].contents["water"]).toContainEqual([40, 200])
  })
})

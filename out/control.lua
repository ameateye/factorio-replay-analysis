--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]

local ____modules = {}
local ____moduleCache = {}
local ____originalRequire = require
local function require(file, ...)
    if ____moduleCache[file] then
        return ____moduleCache[file].value
    end
    if ____modules[file] then
        local module = ____modules[file]
        local value = nil
        if (select("#", ...) > 0) then value = module(...) else value = module(file) end
        ____moduleCache[file] = { value = value }
        return value
    else
        if ____originalRequire then
            return ____originalRequire(file)
        else
            error("module '" .. file .. "' not found")
        end
    end
end
____modules = {
["lualib_bundle"] = function(...) 
local function __TS__StringAccess(self, index)
    if index >= 0 and index < #self then
        return string.sub(self, index + 1, index + 1)
    end
end

local function __TS__StringEndsWith(self, searchString, endPosition)
    if endPosition == nil or endPosition > #self then
        endPosition = #self
    end
    return string.sub(self, endPosition - #searchString + 1, endPosition) == searchString
end

local function __TS__StringSlice(self, start, ____end)
    if start == nil or start ~= start then
        start = 0
    end
    if ____end ~= ____end then
        ____end = 0
    end
    if start >= 0 then
        start = start + 1
    end
    if ____end ~= nil and ____end < 0 then
        ____end = ____end - 1
    end
    return string.sub(self, start, ____end)
end

local function __TS__Class(self)
    local c = {prototype = {}}
    c.prototype.__index = c.prototype
    c.prototype.constructor = c
    return c
end

local function __TS__ClassExtends(target, base)
    target.____super = base
    local staticMetatable = setmetatable({__index = base}, base)
    setmetatable(target, staticMetatable)
    local baseMetatable = getmetatable(base)
    if baseMetatable then
        if type(baseMetatable.__index) == "function" then
            staticMetatable.__index = baseMetatable.__index
        end
        if type(baseMetatable.__newindex) == "function" then
            staticMetatable.__newindex = baseMetatable.__newindex
        end
    end
    setmetatable(target.prototype, base.prototype)
    if type(base.prototype.__index) == "function" then
        target.prototype.__index = base.prototype.__index
    end
    if type(base.prototype.__newindex) == "function" then
        target.prototype.__newindex = base.prototype.__newindex
    end
    if type(base.prototype.__tostring) == "function" then
        target.prototype.__tostring = base.prototype.__tostring
    end
end

local function __TS__ArrayMap(self, callbackfn, thisArg)
    local result = {}
    for i = 1, #self do
        result[i] = callbackfn(thisArg, self[i], i - 1, self)
    end
    return result
end

local function __TS__ArraySome(self, callbackfn, thisArg)
    for i = 1, #self do
        if callbackfn(thisArg, self[i], i - 1, self) then
            return true
        end
    end
    return false
end

local function __TS__ObjectValues(obj)
    local result = {}
    local len = 0
    for key in pairs(obj) do
        len = len + 1
        result[len] = obj[key]
    end
    return result
end

local function __TS__ArrayFilter(self, callbackfn, thisArg)
    local result = {}
    local len = 0
    for i = 1, #self do
        if callbackfn(thisArg, self[i], i - 1, self) then
            len = len + 1
            result[len] = self[i]
        end
    end
    return result
end

local function __TS__ObjectKeys(obj)
    local result = {}
    local len = 0
    for key in pairs(obj) do
        len = len + 1
        result[len] = key
    end
    return result
end

local function __TS__CountVarargs(...)
    return select("#", ...)
end

local function __TS__SparseArrayNew(...)
    local sparseArray = {...}
    sparseArray.sparseLength = __TS__CountVarargs(...)
    return sparseArray
end

local function __TS__SparseArrayPush(sparseArray, ...)
    local args = {...}
    local argsLen = __TS__CountVarargs(...)
    local listLen = sparseArray.sparseLength
    for i = 1, argsLen do
        sparseArray[listLen + i] = args[i]
    end
    sparseArray.sparseLength = listLen + argsLen
end

local function __TS__SparseArraySpread(sparseArray)
    local _unpack = unpack or table.unpack
    return _unpack(sparseArray, 1, sparseArray.sparseLength)
end

local function __TS__ArrayEvery(self, callbackfn, thisArg)
    for i = 1, #self do
        if not callbackfn(thisArg, self[i], i - 1, self) then
            return false
        end
    end
    return true
end

local function __TS__New(target, ...)
    local instance = setmetatable({}, target.prototype)
    instance:____constructor(...)
    return instance
end

return {
  __TS__StringAccess = __TS__StringAccess,
  __TS__StringEndsWith = __TS__StringEndsWith,
  __TS__StringSlice = __TS__StringSlice,
  __TS__Class = __TS__Class,
  __TS__ClassExtends = __TS__ClassExtends,
  __TS__ArrayMap = __TS__ArrayMap,
  __TS__ArraySome = __TS__ArraySome,
  __TS__ObjectValues = __TS__ObjectValues,
  __TS__ArrayFilter = __TS__ArrayFilter,
  __TS__ObjectKeys = __TS__ObjectKeys,
  __TS__SparseArrayNew = __TS__SparseArrayNew,
  __TS__SparseArrayPush = __TS__SparseArrayPush,
  __TS__SparseArraySpread = __TS__SparseArraySpread,
  __TS__ArrayEvery = __TS__ArrayEvery,
  __TS__New = __TS__New
}
 end,
["data-collector"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__StringAccess = ____lualib.__TS__StringAccess
local __TS__StringEndsWith = ____lualib.__TS__StringEndsWith
local __TS__StringSlice = ____lualib.__TS__StringSlice
local ____exports = {}
local ____event_handler = require("event_handler")
local add_lib = ____event_handler.add_lib
local initialDataCollectors = {}
local function getDataCollectors()
    if not storage.dataCollectors then
        storage.dataCollectors = initialDataCollectors
    end
    return storage.dataCollectors
end
function ____exports.addDataCollector(dataCollector)
    local lib = {events = {}, on_nth_tick = {}}
    local dataCollectorName = dataCollector.constructor.name
    script.register_metatable(
        "dataCollector:" .. dataCollectorName,
        getmetatable(dataCollector)
    )
    if initialDataCollectors[dataCollectorName] then
        error("dataCollector already exists: " .. dataCollectorName)
    end
    initialDataCollectors[dataCollectorName] = dataCollector
    for name, id in pairs(defines.events) do
        if dataCollector[name] then
            lib.events[id] = function(event)
                local dataCollector = getDataCollectors()[dataCollectorName]
                dataCollector[name](dataCollector, event)
            end
        end
    end
    if dataCollector.on_nth_tick then
        assert(dataCollector.nth_tick_period, "on_nth_tick requires nth_tick_period")
        lib.on_nth_tick[dataCollector.nth_tick_period] = function(event)
            getDataCollectors()[dataCollectorName]:on_nth_tick(event)
        end
    end
    if dataCollector.on_init then
        lib.on_init = function()
            getDataCollectors()[dataCollectorName]:on_init()
        end
    end
    add_lib(lib)
end
add_lib({
    on_init = function()
        getDataCollectors()
    end,
    on_load = function()
        if __DebugAdapter ~= nil then
            __DebugAdapter.breakpoint()
        end
    end,
    events = {[defines.events.on_game_created_from_scenario] = function()
        getDataCollectors()
    end}
})
local function getOutFileName(s)
    local lowerCamelCase = string.lower(__TS__StringAccess(s, 0)) .. string.sub(s, 2)
    if __TS__StringEndsWith(lowerCamelCase, "DataCollector") then
        return __TS__StringSlice(lowerCamelCase, 0, -#"DataCollector")
    end
    return lowerCamelCase
end
function ____exports.exportAllData()
    for name, datum in pairs(storage.dataCollectors) do
        local outname = getOutFileName(name) .. ".json"
        log("Exporting " .. name)
        helpers.write_file(
            outname,
            helpers.table_to_json(datum:exportData())
        )
    end
    log("Exported dataCollector data to script-output/*.json")
end
return ____exports
 end,
["tick"] = function(...) 
--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local testStartTick = 0
local fakeTick = nil
function ____exports.getTick()
    if fakeTick ~= nil then
        return fakeTick
    end
    return game.tick - testStartTick
end
local after_test = _G.after_test
function ____exports.useFakeTime()
    if testStartTick ~= 0 then
        return
    end
    testStartTick = game.tick
    if after_test ~= nil then
        after_test(function()
            testStartTick = 0
            fakeTick = nil
        end)
    end
end
function ____exports.withFakeTime(fn)
    if fakeTick ~= nil then
        fn()
        return
    end
    fakeTick = game.tick - testStartTick
    fn()
    fakeTick = nil
end
return ____exports
 end,
["dataCollectors.entity-tracker"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local ____exports = {}
____exports.default = __TS__Class()
local EntityTracker = ____exports.default
EntityTracker.name = "EntityTracker"
function EntityTracker.prototype.____constructor(self, ...)
    local prototypeFilters = {...}
    self.prototypes = {}
    self.trackedEntities = {}
    self.entityData = {}
    self.prototypeFilters = prototypeFilters
end
function EntityTracker.prototype.on_init(self)
    for name in pairs(prototypes.get_entity_filtered(self.prototypeFilters)) do
        self.prototypes[name] = true
    end
    self.prototypeFilters = nil
end
function EntityTracker.prototype.onCreated(self, entity, event)
    local unitNumber = entity.unit_number
    if unitNumber and self.prototypes[entity.name] ~= nil then
        local data = self:initialData(entity, event)
        if data then
            self.trackedEntities[unitNumber] = entity
            self.entityData[unitNumber] = data
        end
    end
end
function EntityTracker.prototype.script_raised_built(self, event)
    self:onCreated(event.entity, event)
end
function EntityTracker.prototype.on_built_entity(self, event)
    self:onCreated(event.entity, event)
end
function EntityTracker.prototype.on_robot_built_entity(self, event)
    self:onCreated(event.entity, event)
end
function EntityTracker.prototype.onEntityDeleted(self, entity, event)
    local unitNumber = entity.unit_number
    if not unitNumber then
        return
    end
    local entry = self:getEntityData(entity, unitNumber)
    if not entry then
        return
    end
    local ____opt_0 = self.onDeleted
    if ____opt_0 ~= nil then
        ____opt_0(self, entity, event, entry)
    end
    self:stopTracking(unitNumber)
end
function EntityTracker.prototype.stopTracking(self, unitNumber)
    self.trackedEntities[unitNumber] = nil
end
function EntityTracker.prototype.removeEntityData(self, unitNumber)
    self.entityData[unitNumber] = nil
end
function EntityTracker.prototype.on_pre_player_mined_item(self, event)
    self:onEntityDeleted(event.entity, event)
end
function EntityTracker.prototype.on_robot_pre_mined(self, event)
    self:onEntityDeleted(event.entity, event)
end
function EntityTracker.prototype.on_entity_died(self, event)
    self:onEntityDeleted(event.entity, event)
end
function EntityTracker.prototype.getEntityData(self, entity, unitNumber)
    if not entity.valid then
        if unitNumber then
            self.trackedEntities[unitNumber] = nil
        end
        return nil
    end
    if unitNumber == nil then
        unitNumber = entity.unit_number
    end
    if unitNumber then
        return self.entityData[unitNumber]
    end
    return nil
end
function EntityTracker.prototype.on_nth_tick(self)
    for unitNumber, entity in pairs(self.trackedEntities) do
        local data = self:getEntityData(entity, unitNumber)
        if data then
            self:onPeriodicUpdate(entity, data)
        end
    end
end
return ____exports
 end,
["dataCollectors.buffer-amounts"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____tick = require("tick")
local getTick = ____tick.getTick
local ____entity_2Dtracker = require("dataCollectors.entity-tracker")
local EntityTracker = ____entity_2Dtracker.default
____exports.default = __TS__Class()
local BufferAmounts = ____exports.default
BufferAmounts.name = "BufferAmounts"
__TS__ClassExtends(BufferAmounts, EntityTracker)
function BufferAmounts.prototype.____constructor(self, nth_tick_period, minDataPointsToDetermineItem, includeTanks)
    if nth_tick_period == nil then
        nth_tick_period = 60 * 5
    end
    if minDataPointsToDetermineItem == nil then
        minDataPointsToDetermineItem = 5
    end
    if includeTanks == nil then
        includeTanks = true
    end
    local filters = {{filter = "type", type = {"container", "logistic-container"}}}
    if includeTanks then
        filters[#filters + 1] = {filter = "type", type = "storage-tank", mode = "or"}
    end
    EntityTracker.prototype.____constructor(
        self,
        table.unpack(filters)
    )
    self.nth_tick_period = nth_tick_period
    self.minDataPointsToDetermineItem = minDataPointsToDetermineItem
    self.includeTanks = includeTanks
end
function BufferAmounts.prototype.initialData(self, entity)
    local ____type = entity.type == "storage-tank" and "tank" or "chest"
    return {
        name = entity.name,
        type = ____type,
        unitNumber = entity.unit_number,
        location = entity.position,
        timeBuilt = getTick(),
        itemCounts = {}
    }
end
function BufferAmounts.prototype.getMajorityKey(self, obj, threshold)
    local maxKey
    local max = 0
    local total = 0
    for key, value in pairs(obj) do
        if value > max then
            max = value
            maxKey = key
        end
        total = total + value
    end
    if max >= total * threshold then
        return maxKey
    end
end
function BufferAmounts.prototype.onPeriodicUpdate(self, entity, data)
    local amounts = data.amounts
    if amounts then
        local counts = data.type == "tank" and entity.get_fluid_count(assert(data.content)) or entity.get_inventory(defines.inventory.chest).get_item_count(assert(data.content))
        amounts[#amounts + 1] = {
            getTick(),
            counts
        }
    else
        local itemCounts = assert(data.itemCounts)
        local counts
        if data.type == "tank" then
            counts = entity.get_fluid_contents()
        else
            local items = entity.get_inventory(defines.inventory.chest).get_contents()
            counts = {}
            for ____, item in ipairs(items) do
                counts[item.name] = item.count
            end
        end
        if (next(counts)) == nil then
            return
        end
        itemCounts[#itemCounts + 1] = {
            time = getTick(),
            counts = counts
        }
        if #itemCounts == self.minDataPointsToDetermineItem then
            self:determineItemType(data)
        end
        return
    end
end
function BufferAmounts.prototype.determineItemType(self, data)
    local maxAtTime = {}
    local itemCounts = data.itemCounts
    for ____, ____value in ipairs(itemCounts) do
        local counts = ____value.counts
        local maxKey = self:getMajorityKey(counts, 2 / 3)
        if maxKey then
            maxAtTime[maxKey] = (maxAtTime[maxKey] or 0) + 1
        end
    end
    local finalMax = self:getMajorityKey(maxAtTime, 1 / 2)
    if not finalMax then
        self:stopTracking(data.unitNumber)
        return
    end
    data.content = finalMax
    data.amounts = {}
    for ____, ____value in ipairs(itemCounts) do
        local time = ____value.time
        local counts = ____value.counts
        local ____data_amounts_0 = data.amounts
        ____data_amounts_0[#____data_amounts_0 + 1] = {time, counts[finalMax] or 0}
    end
    data.itemCounts = nil
end
function BufferAmounts.prototype.exportData(self)
    local buffers = {}
    for unitNumber, entity in pairs(self.trackedEntities) do
        do
            local data = self:getEntityData(entity, unitNumber)
            local amounts = data and data.amounts
            if not amounts or not amounts[1] then
                goto __continue26
            end
            local remove = table.remove
            while amounts[#amounts][2] == 0 do
                remove(amounts)
            end
            if not amounts[1] then
                goto __continue26
            end
            buffers[#buffers + 1] = {
                name = data.name,
                type = data.type,
                unitNumber = data.unitNumber,
                location = data.location,
                timeBuilt = data.timeBuilt,
                content = data.content,
                amounts = amounts
            }
        end
        ::__continue26::
    end
    return {period = self.nth_tick_period, buffers = buffers}
end
return ____exports
 end,
["dataCollectors.entity-layout"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local ____exports = {}
local ____tick = require("tick")
local getTick = ____tick.getTick
local FILTERS = {
    {filter = "type", type = "transport-belt"},
    {filter = "type", type = "underground-belt", mode = "or"},
    {filter = "type", type = "splitter", mode = "or"},
    {filter = "type", type = "inserter", mode = "or"},
    {filter = "type", type = "electric-pole", mode = "or"}
}
local TYPE_TO_CATEGORY = {
    ["transport-belt"] = "belt",
    ["underground-belt"] = "belt",
    splitter = "belt",
    inserter = "inserter",
    ["electric-pole"] = "pole"
}
local function readSplitterFilterName(entity)
    local f = entity.splitter_filter
    if f == nil then
        return nil
    end
    if type(f) == "string" then
        return f
    end
    local name = f.name
    if name == nil then
        return nil
    end
    return name.name
end
local function readInserterFilters(entity)
    local slots = entity.filter_slot_count
    local result = {}
    for i = 1, slots do
        do
            local f = entity.get_filter(i)
            if f == nil then
                goto __continue7
            end
            if type(f) == "string" then
                result[#result + 1] = f
            else
                local name = f.name
                if name ~= nil then
                    result[#result + 1] = name.name
                end
            end
        end
        ::__continue7::
    end
    return result
end
local function arraysEqual(a, b)
    if #a ~= #b then
        return false
    end
    for i = 0, #a - 1 do
        if a[i + 1] ~= b[i + 1] then
            return false
        end
    end
    return true
end
____exports.default = __TS__Class()
local EntityLayout = ____exports.default
EntityLayout.name = "EntityLayout"
function EntityLayout.prototype.____constructor(self)
    self.prototypes = {}
    self.entityData = {}
end
function EntityLayout.prototype.on_init(self)
    for name in pairs(prototypes.get_entity_filtered(FILTERS)) do
        self.prototypes[name] = true
    end
end
function EntityLayout.prototype.markOverbuiltAt(self, newEntity, newUnitNumber)
    local box = newEntity.bounding_box
    local inset = 0.1
    local minX = box.left_top.x + inset
    local maxX = box.right_bottom.x - inset
    local minY = box.left_top.y + inset
    local maxY = box.right_bottom.y - inset
    local tick = getTick()
    for ____, data in pairs(self.entityData) do
        do
            if data.unitNumber == newUnitNumber then
                goto __continue20
            end
            if data.timeRemoved ~= nil then
                goto __continue20
            end
            local px = data.location.x
            local py = data.location.y
            if px > minX and px < maxX and py > minY and py < maxY then
                data.timeRemoved = tick
            end
        end
        ::__continue20::
    end
end
function EntityLayout.prototype.onCreated(self, entity)
    local unitNumber = entity.unit_number
    if not unitNumber or not (self.prototypes[entity.name] ~= nil) then
        return
    end
    local category = TYPE_TO_CATEGORY[entity.type]
    if not category then
        return
    end
    self:markOverbuiltAt(entity, unitNumber)
    local record = {
        name = entity.name,
        unitNumber = unitNumber,
        category = category,
        location = entity.position,
        direction = entity.direction,
        timeBuilt = getTick()
    }
    if category == "belt" then
        local beltType = entity.type
        record.beltType = beltType
        if beltType == "underground-belt" then
            record.beltToGroundType = entity.belt_to_ground_type
        elseif beltType == "splitter" then
            record.splitterInputPriority = entity.splitter_input_priority
            record.splitterOutputPriority = entity.splitter_output_priority
            local filter = readSplitterFilterName(entity)
            if filter ~= nil then
                record.splitterFilter = filter
            end
        end
    elseif category == "inserter" then
        record.inserterUseFilters = entity.use_filters
        local mode = entity.inserter_filter_mode
        if mode ~= nil then
            record.inserterFilterMode = mode
        end
        record.inserterFilters = readInserterFilters(entity)
    end
    self.entityData[unitNumber] = record
end
function EntityLayout.prototype.onRemoved(self, entity)
    local unitNumber = entity.unit_number
    if not unitNumber then
        return
    end
    local data = self.entityData[unitNumber]
    if not data then
        return
    end
    if data.timeRemoved == nil then
        data.timeRemoved = getTick()
    end
end
function EntityLayout.prototype.appendMutation(self, data, mutation)
    if not data.mutations then
        data.mutations = {}
    end
    local ____data_mutations_0 = data.mutations
    ____data_mutations_0[#____data_mutations_0 + 1] = mutation
end
function EntityLayout.prototype.latestSplitterState(self, data)
    local input = data.splitterInputPriority or "none"
    local output = data.splitterOutputPriority or "none"
    local filter = data.splitterFilter or ""
    if data.mutations then
        for ____, m in ipairs(data.mutations) do
            if m.splitterInputPriority ~= nil then
                input = m.splitterInputPriority
            end
            if m.splitterOutputPriority ~= nil then
                output = m.splitterOutputPriority
            end
            if m.splitterFilter ~= nil then
                filter = m.splitterFilter
            end
        end
    end
    return {input = input, output = output, filter = filter}
end
function EntityLayout.prototype.snapshotSplitterIfChanged(self, data, entity)
    if data.beltType ~= "splitter" then
        return
    end
    local inputPrio = entity.splitter_input_priority
    local outputPrio = entity.splitter_output_priority
    local filter = readSplitterFilterName(entity) or ""
    local last = self:latestSplitterState(data)
    local dInput = inputPrio ~= last.input
    local dOutput = outputPrio ~= last.output
    local dFilter = filter ~= last.filter
    if not dInput and not dOutput and not dFilter then
        return
    end
    local mutation = {tick = getTick()}
    if dInput then
        mutation.splitterInputPriority = inputPrio
    end
    if dOutput then
        mutation.splitterOutputPriority = outputPrio
    end
    if dFilter then
        mutation.splitterFilter = filter
    end
    self:appendMutation(data, mutation)
end
function EntityLayout.prototype.latestInserterState(self, data)
    local ____data_inserterUseFilters_1 = data.inserterUseFilters
    if ____data_inserterUseFilters_1 == nil then
        ____data_inserterUseFilters_1 = false
    end
    local useFilters = ____data_inserterUseFilters_1
    local mode = data.inserterFilterMode
    local filters = data.inserterFilters or ({})
    if data.mutations then
        for ____, m in ipairs(data.mutations) do
            if m.inserterUseFilters ~= nil then
                useFilters = m.inserterUseFilters
            end
            if m.inserterFilterMode ~= nil then
                mode = m.inserterFilterMode
            end
            if m.inserterFilters ~= nil then
                filters = m.inserterFilters
            end
        end
    end
    return {useFilters = useFilters, mode = mode, filters = filters}
end
function EntityLayout.prototype.snapshotInserterIfChanged(self, data, entity)
    if data.category ~= "inserter" then
        return
    end
    local useFilters = entity.use_filters
    local mode = entity.inserter_filter_mode
    local filters = readInserterFilters(entity)
    local last = self:latestInserterState(data)
    local dUse = useFilters ~= last.useFilters
    local dMode = mode ~= last.mode
    local dFilters = not arraysEqual(filters, last.filters)
    if not dUse and not dMode and not dFilters then
        return
    end
    local mutation = {tick = getTick()}
    if dUse then
        mutation.inserterUseFilters = useFilters
    end
    if dMode and mode ~= nil then
        mutation.inserterFilterMode = mode
    end
    if dFilters then
        mutation.inserterFilters = filters
    end
    self:appendMutation(data, mutation)
end
function EntityLayout.prototype.on_built_entity(self, event)
    self:onCreated(event.entity)
end
function EntityLayout.prototype.on_robot_built_entity(self, event)
    self:onCreated(event.entity)
end
function EntityLayout.prototype.script_raised_built(self, event)
    self:onCreated(event.entity)
end
function EntityLayout.prototype.on_pre_player_mined_item(self, event)
    self:onRemoved(event.entity)
end
function EntityLayout.prototype.on_robot_pre_mined(self, event)
    self:onRemoved(event.entity)
end
function EntityLayout.prototype.on_entity_died(self, event)
    self:onRemoved(event.entity)
end
function EntityLayout.prototype.on_player_rotated_entity(self, event)
    local entity = event.entity
    if not entity.valid then
        return
    end
    local unitNumber = entity.unit_number
    if not unitNumber then
        return
    end
    local data = self.entityData[unitNumber]
    if not data then
        return
    end
    local mutation = {
        tick = getTick(),
        direction = entity.direction
    }
    if data.beltType == "underground-belt" then
        mutation.beltToGroundType = entity.belt_to_ground_type
    end
    self:appendMutation(data, mutation)
end
function EntityLayout.prototype.on_gui_closed(self, event)
    local entity = event.entity
    if not entity or not entity.valid then
        return
    end
    local unitNumber = entity.unit_number
    if not unitNumber then
        return
    end
    local data = self.entityData[unitNumber]
    if not data then
        return
    end
    if data.beltType == "splitter" then
        self:snapshotSplitterIfChanged(data, entity)
    elseif data.category == "inserter" then
        self:snapshotInserterIfChanged(data, entity)
    end
end
function EntityLayout.prototype.on_entity_settings_pasted(self, event)
    local entity = event.destination
    if not entity or not entity.valid then
        return
    end
    local unitNumber = entity.unit_number
    if not unitNumber then
        return
    end
    local data = self.entityData[unitNumber]
    if not data then
        return
    end
    if data.beltType == "splitter" then
        self:snapshotSplitterIfChanged(data, entity)
    elseif data.category == "inserter" then
        self:snapshotInserterIfChanged(data, entity)
    end
end
function EntityLayout.prototype.exportData(self)
    local entities = {}
    for ____, data in pairs(self.entityData) do
        entities[#entities + 1] = data
    end
    return {entities = entities}
end
return ____exports
 end,
["dataCollectors.lab-contents"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local __TS__ArraySome = ____lualib.__TS__ArraySome
local __TS__ObjectValues = ____lualib.__TS__ObjectValues
local __TS__ArrayFilter = ____lualib.__TS__ArrayFilter
local ____exports = {}
local ____tick = require("tick")
local getTick = ____tick.getTick
local ____entity_2Dtracker = require("dataCollectors.entity-tracker")
local EntityTracker = ____entity_2Dtracker.default
local sciencePacks = {
    "automation-science-pack",
    "logistic-science-pack",
    "chemical-science-pack",
    "military-science-pack",
    "production-science-pack",
    "utility-science-pack",
    "space-science-pack"
}
____exports.default = __TS__Class()
local LabContents = ____exports.default
LabContents.name = "LabContents"
__TS__ClassExtends(LabContents, EntityTracker)
function LabContents.prototype.____constructor(self, nth_tick_period)
    if nth_tick_period == nil then
        nth_tick_period = 60
    end
    EntityTracker.prototype.____constructor(self, {filter = "type", type = "lab"})
    self.nth_tick_period = nth_tick_period
end
function LabContents.prototype.initialData(self, entity)
    return {
        name = entity.name,
        unitNumber = entity.unit_number,
        location = entity.position,
        timeBuilt = getTick(),
        packs = {}
    }
end
function LabContents.prototype.onPeriodicUpdate(self, entity, data)
    local get_item_count = entity.get_inventory(defines.inventory.lab_input).get_item_count
    local packCounts = __TS__ArrayMap(
        sciencePacks,
        function(____, pack) return get_item_count(pack) end
    )
    local ____data_packs_0 = data.packs
    ____data_packs_0[#____data_packs_0 + 1] = {
        getTick(),
        table.unpack(packCounts)
    }
end
function LabContents.prototype.exportData(self)
    local labData = __TS__ArrayFilter(
        __TS__ObjectValues(self.entityData),
        function(____, data) return __TS__ArraySome(
            data.packs,
            function(____, a) return __TS__ArraySome(
                a,
                function(____, amt, index) return index > 0 and amt > 0 end
            ) end
        ) end
    )
    return {period = self.nth_tick_period, sciencePacks = sciencePacks, labs = labData}
end
return ____exports
 end,
["dataCollectors.machine-production"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__ObjectKeys = ____lualib.__TS__ObjectKeys
local __TS__SparseArrayNew = ____lualib.__TS__SparseArrayNew
local __TS__SparseArrayPush = ____lualib.__TS__SparseArrayPush
local __TS__SparseArraySpread = ____lualib.__TS__SparseArraySpread
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local __TS__ArrayEvery = ____lualib.__TS__ArrayEvery
local ____exports = {}
local ____util = require("util")
local list_to_map = ____util.list_to_map
local ____tick = require("tick")
local getTick = ____tick.getTick
local ____entity_2Dtracker = require("dataCollectors.entity-tracker")
local EntityTracker = ____entity_2Dtracker.default
local function machineConfigEqual(a, b)
    return a.recipe == b.recipe and a.craftingSpeed == b.craftingSpeed and a.productivityBonus == b.productivityBonus
end
local function nullableEqual(a, b, equal)
    if a == nil then
        return b == nil
    end
    if b == nil then
        return false
    end
    return equal(a, b)
end
local stoppedStatuses = {disabled_by_script = true, marked_for_deconstruction = true, no_recipe = true}
local function isStoppingStatus(status)
    return stoppedStatuses[status] ~= nil
end
local commonStatuses = list_to_map({
    "working",
    "normal",
    "no_power",
    "low_power",
    "no_fuel",
    "disabled_by_control_behavior",
    "disabled_by_script",
    "marked_for_deconstruction"
})
local ____list_to_map_1 = list_to_map
local ____array_0 = __TS__SparseArrayNew(table.unpack(__TS__ObjectKeys(commonStatuses)))
__TS__SparseArrayPush(
    ____array_0,
    "no_recipe",
    "fluid_ingredient_shortage",
    "full_output",
    "item_ingredient_shortage"
)
local craftingMachineStatuses = ____list_to_map_1({__TS__SparseArraySpread(____array_0)})
local ____list_to_map_3 = list_to_map
local ____array_2 = __TS__SparseArrayNew(table.unpack(__TS__ObjectKeys(commonStatuses)))
__TS__SparseArrayPush(____array_2, "no_ingredients", "full_output")
local furnaceStatuses = ____list_to_map_3({__TS__SparseArraySpread(____array_2)})
local ____list_to_map_5 = list_to_map
local ____array_4 = __TS__SparseArrayNew(table.unpack(__TS__ObjectKeys(craftingMachineStatuses)))
__TS__SparseArrayPush(
    ____array_4,
    "preparing_rocket_for_launch",
    "waiting_to_launch_rocket",
    "waiting_for_space_in_platform_hub",
    "launching_rocket"
)
local rocketSiloStatuses = ____list_to_map_5({__TS__SparseArraySpread(____array_4)})
local reverseMap = {}
for key, value in pairs(defines.entity_status) do
    reverseMap[value] = key
end
____exports.default = __TS__Class()
local MachineProduction = ____exports.default
MachineProduction.name = "MachineProduction"
__TS__ClassExtends(MachineProduction, EntityTracker)
function MachineProduction.prototype.____constructor(self, prototypes, nth_tick_period)
    if nth_tick_period == nil then
        nth_tick_period = 60 * 5
    end
    EntityTracker.prototype.____constructor(self, {filter = "name", name = prototypes})
    self.nth_tick_period = nth_tick_period
end
function MachineProduction.prototype.on_init(self)
    EntityTracker.prototype.on_init(self)
    for name in pairs(self.prototypes) do
        local prototype = prototypes.entity[name]
        assert(prototype.type == "assembling-machine" or prototype.type == "furnace" or prototype.type == "rocket-silo", "Not a crafting machine or furnace: " .. name)
    end
end
function MachineProduction.prototype.getStatus(self, entity)
    local keys = entity.type == "rocket-silo" and rocketSiloStatuses or (entity.type == "assembling-machine" and craftingMachineStatuses or (entity.type == "furnace" and furnaceStatuses or error("Invalid entity type")))
    local status = entity.status
    if status == nil then
        return "unknown"
    end
    local statusText = reverseMap[status]
    if keys[statusText] ~= nil then
        return statusText
    end
    log("Unknown status for crafting machine: " .. tostring(status))
    for key, value in pairs(defines.entity_status) do
        log((key .. " ") .. tostring(value))
    end
    return "unknown"
end
function MachineProduction.prototype.initialData(self, entity)
    return {
        name = entity.name,
        unitNumber = entity.unit_number,
        location = entity.position,
        direction = entity.direction,
        timeBuilt = getTick(),
        lastProductsFinished = 0,
        lastConfig = nil,
        recipeProduction = {}
    }
end
function MachineProduction.prototype.addDataPoint(self, entity, info, status)
    local tick = getTick()
    local configEntries = info.recipeProduction
    local currentConfig = configEntries[#configEntries]
    local lastEntry = currentConfig.production[#currentConfig.production]
    if not (lastEntry == nil or lastEntry[1] ~= tick) then
        return
    end
    local productsFinished = entity.products_finished
    local delta = productsFinished - info.lastProductsFinished
    info.lastProductsFinished = productsFinished
    local craftingProgress = entity.crafting_progress
    local bonusProgress = entity.bonus_progress
    local extraInfo = nil
    if status == "item_ingredient_shortage" then
        local get_item_count = entity.get_inventory(defines.inventory.assembling_machine_input).get_item_count
        local needed = (entity.get_recipe()).ingredients
        local missingIngredients = {}
        for ____, ____value in ipairs(needed) do
            local ____type = ____value.type
            local amount = ____value.amount
            local name = ____value.name
            do
                if ____type ~= "item" then
                    goto __continue20
                end
                local currentAmount = get_item_count(name)
                if currentAmount == nil or currentAmount < amount then
                    missingIngredients[#missingIngredients + 1] = name
                end
            end
            ::__continue20::
        end
        extraInfo = missingIngredients
    elseif status == "fluid_ingredient_shortage" then
        local needed = (entity.get_recipe()).ingredients
        local missingIngredients = {}
        for ____, ____value in ipairs(needed) do
            local ____type = ____value.type
            local amount = ____value.amount
            local name = ____value.name
            do
                if ____type ~= "fluid" then
                    goto __continue25
                end
                local currentAmount = entity.get_fluid_count(name)
                if currentAmount == nil or currentAmount < amount then
                    missingIngredients[#missingIngredients + 1] = name
                end
            end
            ::__continue25::
        end
        extraInfo = missingIngredients
    end
    local ____currentConfig_production_6 = currentConfig.production
    ____currentConfig_production_6[#____currentConfig_production_6 + 1] = {
        tick,
        delta,
        craftingProgress,
        bonusProgress,
        status,
        extraInfo
    }
end
function MachineProduction.prototype.markProductionFinished(self, entity, info, status, reason)
    info.lastConfig = nil
    local recipeProduction = info.recipeProduction
    local lastProduction = recipeProduction[#recipeProduction]
    if lastProduction == nil then
        return
    end
    self:addDataPoint(entity, info, status)
    local production = lastProduction.production
    if #production == 0 or __TS__ArrayEvery(
        production,
        function(____, ____bindingPattern0)
            local delta
            delta = ____bindingPattern0[2]
            return delta == 0
        end
    ) then
        table.remove(recipeProduction)
        return
    end
    lastProduction.timeStopped = getTick()
    lastProduction.stoppedReason = reason
end
function MachineProduction.prototype.startNewProduction(self, info, config)
    info.lastConfig = config
    local ____info_recipeProduction_7 = info.recipeProduction
    ____info_recipeProduction_7[#____info_recipeProduction_7 + 1] = {
        recipe = config.recipe,
        craftingSpeed = config.craftingSpeed,
        productivityBonus = config.productivityBonus,
        timeStarted = getTick(),
        production = {}
    }
end
function MachineProduction.prototype.tryCheckRunningChanged(self, entity, knownStopReason)
    local info = self:getEntityData(entity)
    if info then
        self:checkRunningChanged(entity, info, nil, knownStopReason)
    end
end
function MachineProduction.prototype.checkRunningChanged(self, entity, info, status, knownStopReason)
    if status == nil then
        status = self:getStatus(entity)
    end
    local isStopped = knownStopReason ~= nil or isStoppingStatus(status)
    local ____temp_13 = (entity.get_recipe())
    if ____temp_13 == nil then
        local ____temp_12
        if entity.type == "furnace" then
            local ____opt_10 = entity.previous_recipe
            ____temp_12 = ____opt_10 and ____opt_10.name
        else
            ____temp_12 = nil
        end
        ____temp_13 = ____temp_12
    end
    local recipe = ____temp_13 and ____temp_13.name
    local lastConfig = info.lastConfig
    local config = recipe and ({recipe = recipe, craftingSpeed = entity.crafting_speed, productivityBonus = entity.productivity_bonus}) or nil
    local configChanged = not nullableEqual(lastConfig, config, machineConfigEqual)
    local updated = false
    if lastConfig then
        if configChanged then
            self:markProductionFinished(entity, info, status, "configuration_changed")
            updated = true
        elseif isStopped then
            self:markProductionFinished(entity, info, status, knownStopReason or status)
            updated = true
        end
    end
    if config and (configChanged or #info.recipeProduction == 0) then
        self:startNewProduction(info, config)
        updated = true
    end
    return updated, not isStopped and config ~= nil
end
function MachineProduction.prototype.onDeleted(self, entity, event, info)
    self:checkRunningChanged(entity, info, nil, event.name == defines.events.on_entity_died and "entity_died" or "mined")
end
function MachineProduction.prototype.on_marked_for_deconstruction(self, event)
    self:tryCheckRunningChanged(event.entity, "marked_for_deconstruction")
end
function MachineProduction.prototype.on_cancelled_deconstruction(self, event)
    self:tryCheckRunningChanged(event.entity, nil)
end
function MachineProduction.prototype.on_gui_closed(self, event)
    if event.entity then
        self:tryCheckRunningChanged(event.entity, nil)
    end
end
function MachineProduction.prototype.on_entity_settings_pasted(self, event)
    self:tryCheckRunningChanged(event.destination, nil)
end
function MachineProduction.prototype.on_player_fast_transferred(self, event)
    self:tryCheckRunningChanged(event.entity, nil)
end
function MachineProduction.prototype.on_player_cursor_stack_changed(self, event)
    local player = game.players[event.player_index]
    local selected = player.selected
    if selected then
        self:tryCheckRunningChanged(selected, nil)
    end
end
function MachineProduction.prototype.onPeriodicUpdate(self, entity, data)
    local status = self:getStatus(entity)
    local updated, isRunning = self:checkRunningChanged(entity, data, status, nil)
    local shouldAddDataPoint = not updated and isRunning
    if shouldAddDataPoint then
        self:addDataPoint(entity, data, status)
    end
end
function MachineProduction.prototype.exportData(self)
    local machines = {}
    for ____, machine in pairs(self.entityData) do
        do
            local recipes = machine.recipeProduction
            while #recipes > 0 and (#recipes[#recipes].production == 0 or __TS__ArrayEvery(
                recipes[#recipes].production,
                function(____, ____bindingPattern0)
                    local delta
                    delta = ____bindingPattern0[2]
                    return delta == 0
                end
            )) do
                table.remove(recipes)
            end
            if #recipes == 0 then
                goto __continue53
            end
            machines[#machines + 1] = {
                name = machine.name,
                unitNumber = machine.unitNumber,
                location = machine.location,
                direction = machine.direction,
                timeBuilt = machine.timeBuilt,
                recipes = recipes
            }
        end
        ::__continue53::
    end
    return {period = self.nth_tick_period, machines = machines}
end
return ____exports
 end,
["dataCollectors.miner-activity"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local ____exports = {}
local ____tick = require("tick")
local getTick = ____tick.getTick
local ____entity_2Dtracker = require("dataCollectors.entity-tracker")
local EntityTracker = ____entity_2Dtracker.default
local reverseMap = {}
for key, value in pairs(defines.entity_status) do
    reverseMap[value] = key
end
local function getResourcesInRange(entity)
    local proto = prototypes.entity[entity.name]
    local radius = proto.mining_drill_radius or 2.5
    local resources = entity.surface.find_entities_filtered({position = entity.position, radius = radius, type = "resource"})
    local seen = {}
    local out = {}
    for ____, r in ipairs(resources) do
        if not seen[r.name] then
            seen[r.name] = true
            out[#out + 1] = r.name
        end
    end
    return out
end
____exports.default = __TS__Class()
local MinerActivity = ____exports.default
MinerActivity.name = "MinerActivity"
__TS__ClassExtends(MinerActivity, EntityTracker)
function MinerActivity.prototype.____constructor(self, nth_tick_period)
    if nth_tick_period == nil then
        nth_tick_period = 60 * 5
    end
    EntityTracker.prototype.____constructor(self, {filter = "type", type = "mining-drill"})
    self.nth_tick_period = nth_tick_period
end
function MinerActivity.prototype.initialData(self, entity)
    return {
        name = entity.name,
        unitNumber = entity.unit_number,
        location = entity.position,
        direction = entity.direction,
        timeBuilt = getTick(),
        resources = getResourcesInRange(entity),
        statuses = {}
    }
end
function MinerActivity.prototype.onDeleted(self, _entity, _event, data)
    data.timeRemoved = getTick()
end
function MinerActivity.prototype.onPeriodicUpdate(self, entity, data)
    local status = entity.status
    local statusText = status ~= nil and (reverseMap[status] or "unknown") or "unknown"
    local last = data.statuses[#data.statuses]
    if last and last[2] == statusText then
        return
    end
    local ____data_statuses_0 = data.statuses
    ____data_statuses_0[#____data_statuses_0 + 1] = {
        getTick(),
        statusText
    }
end
function MinerActivity.prototype.exportData(self)
    local miners = {}
    for ____, data in pairs(self.entityData) do
        miners[#miners + 1] = data
    end
    return {period = self.nth_tick_period, miners = miners}
end
return ____exports
 end,
["dataCollectors.player-inventory"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ArrayMap = ____lualib.__TS__ArrayMap
local ____exports = {}
local ____tick = require("tick")
local getTick = ____tick.getTick
____exports.default = __TS__Class()
local PlayerInventory = ____exports.default
PlayerInventory.name = "PlayerInventory"
function PlayerInventory.prototype.____constructor(self, nth_tick_period)
    if nth_tick_period == nil then
        nth_tick_period = 360
    end
    self.nth_tick_period = nth_tick_period
    self.players = {}
end
function PlayerInventory.prototype.on_nth_tick(self, event)
    for ____, player in pairs(game.players) do
        local name = player.name
        local playerData = self.players[name]
        if not playerData then
            local ____temp_0 = {inventory = {}, craftingQueue = {}, craftingEvents = {}}
            self.players[name] = ____temp_0
            playerData = ____temp_0
            do
                local i = 0
                while i < event.tick do
                    local ____playerData_inventory_1 = playerData.inventory
                    ____playerData_inventory_1[#____playerData_inventory_1 + 1] = {}
                    local ____playerData_craftingQueue_2 = playerData.craftingQueue
                    ____playerData_craftingQueue_2[#____playerData_craftingQueue_2 + 1] = {}
                    i = i + self.nth_tick_period
                end
            end
        end
        local ____opt_3 = player.get_main_inventory()
        local inventoryContents = ____opt_3 and ____opt_3.get_contents() or ({})
        local counts = {}
        for ____, item in ipairs(inventoryContents) do
            counts[item.name] = item.count
        end
        local ____playerData_inventory_5 = playerData.inventory
        ____playerData_inventory_5[#____playerData_inventory_5 + 1] = counts
        local ____temp_8 = player.controller_type == defines.controllers.character
        if ____temp_8 then
            local ____opt_6 = player.crafting_queue
            ____temp_8 = ____opt_6 and __TS__ArrayMap(
                player.crafting_queue,
                function(____, item) return {recipe = item.recipe, item = item.recipe, count = item.count, prerequisite = item.prerequisite} end
            )
        end
        local craftingQueue = ____temp_8 or ({})
        local ____playerData_craftingQueue_9 = playerData.craftingQueue
        ____playerData_craftingQueue_9[#____playerData_craftingQueue_9 + 1] = craftingQueue
    end
end
function PlayerInventory.prototype.on_player_crafted_item(self, event)
    local playerName = game.get_player(event.player_index).name
    local ____self_players_10, ____playerName_11 = self.players, playerName
    if ____self_players_10[____playerName_11] == nil then
        ____self_players_10[____playerName_11] = {inventory = {}, craftingQueue = {}, craftingEvents = {}}
    end
    local playerData = self.players[playerName]
    local recipe = event.recipe
    local ____playerData_craftingEvents_13 = playerData.craftingEvents
    ____playerData_craftingEvents_13[#____playerData_craftingEvents_13 + 1] = {
        time = getTick(),
        recipe = recipe.name
    }
end
function PlayerInventory.prototype.exportData(self)
    return {period = self.nth_tick_period, players = self.players}
end
return ____exports
 end,
["dataCollectors.player-position"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local ____exports = {}
local floor = math.floor
____exports.default = __TS__Class()
local PlayerPosition = ____exports.default
PlayerPosition.name = "PlayerPosition"
function PlayerPosition.prototype.____constructor(self, nth_tick_period)
    if nth_tick_period == nil then
        nth_tick_period = 60
    end
    self.nth_tick_period = nth_tick_period
    self.players = {}
end
function PlayerPosition.prototype.on_nth_tick(self, event)
    for ____, player in pairs(game.players) do
        local name = player.name
        local position = player.position
        local x = floor(position.x + 0.5)
        local y = floor(position.y + 0.5)
        if not self.players[name] then
            self.players[name] = {}
            do
                local i = 0
                while i < event.tick do
                    local ____self_players_name_0 = self.players[name]
                    ____self_players_name_0[#____self_players_name_0 + 1] = {x, y}
                    i = i + self.nth_tick_period
                end
            end
        end
        local ____self_players_name_1 = self.players[name]
        ____self_players_name_1[#____self_players_name_1 + 1] = {x, y}
    end
end
function PlayerPosition.prototype.exportData(self)
    return {period = self.nth_tick_period, players = self.players}
end
return ____exports
 end,
["dataCollectors.research-timing"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local ____exports = {}
____exports.default = __TS__Class()
local ResearchTiming = ____exports.default
ResearchTiming.name = "ResearchTiming"
function ResearchTiming.prototype.____constructor(self)
    self.data = {timeFirstStarted = {}, timeCompleted = {}, events = {}}
end
function ResearchTiming.prototype.on_research_started(self, event)
    local research = event.research.name
    local time = event.tick
    local ____self_data_timeFirstStarted_0, ____research_1 = self.data.timeFirstStarted, research
    if ____self_data_timeFirstStarted_0[____research_1] == nil then
        ____self_data_timeFirstStarted_0[____research_1] = time
    end
    local ____self_data_events_2 = self.data.events
    ____self_data_events_2[#____self_data_events_2 + 1] = {time = time, research = research, type = "started"}
end
function ResearchTiming.prototype.on_research_cancelled(self, event)
    local time = event.tick
    for research in pairs(event.research) do
        local ____self_data_events_3 = self.data.events
        ____self_data_events_3[#____self_data_events_3 + 1] = {time = time, research = research, type = "cancelled"}
    end
end
function ResearchTiming.prototype.on_research_finished(self, event)
    local research = event.research.name
    local time = event.tick
    local ____self_data_timeCompleted_4, ____research_5 = self.data.timeCompleted, research
    if ____self_data_timeCompleted_4[____research_5] == nil then
        ____self_data_timeCompleted_4[____research_5] = time
    end
    local ____self_data_events_6 = self.data.events
    ____self_data_events_6[#____self_data_events_6 + 1] = {time = time, research = research, type = "completed"}
end
function ResearchTiming.prototype.exportData(self)
    return self.data
end
return ____exports
 end,
["dataCollectors.roboport-usage"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local __TS__ArraySome = ____lualib.__TS__ArraySome
local __TS__ObjectValues = ____lualib.__TS__ObjectValues
local ____exports = {}
local ____tick = require("tick")
local getTick = ____tick.getTick
local ____entity_2Dtracker = require("dataCollectors.entity-tracker")
local EntityTracker = ____entity_2Dtracker.default
____exports.default = __TS__Class()
local RoboportUsage = ____exports.default
RoboportUsage.name = "RoboportUsage"
__TS__ClassExtends(RoboportUsage, EntityTracker)
function RoboportUsage.prototype.____constructor(self, nth_tick_period)
    if nth_tick_period == nil then
        nth_tick_period = 30
    end
    EntityTracker.prototype.____constructor(self, {filter = "type", type = "roboport"})
    self.nth_tick_period = nth_tick_period
end
function RoboportUsage.prototype.initialData(self, entity, event)
    if not entity.logistic_cell then
        return
    end
    return {unitNumber = entity.unit_number, location = entity.position, timeBuilt = event.tick, usage = {}}
end
function RoboportUsage.prototype.onPeriodicUpdate(self, entity, data)
    local ____data_usage_0 = data.usage
    ____data_usage_0[#____data_usage_0 + 1] = {
        getTick(),
        entity.logistic_cell.charging_robot_count,
        entity.logistic_cell.to_charge_robot_count
    }
end
function RoboportUsage.prototype.onDeleted(self, _entity, event, data)
    data.timeRemoved = event.tick
    data.removedReason = event.name == defines.events.on_pre_player_mined_item and "mined" or (event.name == defines.events.on_robot_pre_mined and "deconstructed" or "destroyed")
end
function RoboportUsage.prototype.exportData(self)
    for unitNumber, data in pairs(self.entityData) do
        if not __TS__ArraySome(
            data.usage,
            function(____, ____bindingPattern0)
                local numWaiting
                local numCharging
                numCharging = ____bindingPattern0[2]
                numWaiting = ____bindingPattern0[3]
                return numCharging > 0 or numWaiting > 0
            end
        ) then
            self.entityData[unitNumber] = nil
        end
    end
    return {
        period = self.nth_tick_period,
        roboports = __TS__ObjectValues(self.entityData)
    }
end
return ____exports
 end,
["dataCollectors.rocket-launch-time"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local ____exports = {}
____exports.default = __TS__Class()
local RocketLaunchTime = ____exports.default
RocketLaunchTime.name = "RocketLaunchTime"
function RocketLaunchTime.prototype.____constructor(self)
    self.launchTimes = {}
end
function RocketLaunchTime.prototype.on_rocket_launched(self, event)
    local ____self_launchTimes_0 = self.launchTimes
    ____self_launchTimes_0[#____self_launchTimes_0 + 1] = event.tick
end
function RocketLaunchTime.prototype.exportData(self)
    return {rocketLaunchTimes = self.launchTimes}
end
return ____exports
 end,
["main"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__New = ____lualib.__TS__New
local ____exports = {}
local ____event_handler = require("event_handler")
local add_lib = ____event_handler.add_lib
local ____data_2Dcollector = require("data-collector")
local addDataCollector = ____data_2Dcollector.addDataCollector
local exportAllData = ____data_2Dcollector.exportAllData
local ____buffer_2Damounts = require("dataCollectors.buffer-amounts")
local BufferAmounts = ____buffer_2Damounts.default
local ____entity_2Dlayout = require("dataCollectors.entity-layout")
local EntityLayout = ____entity_2Dlayout.default
local ____lab_2Dcontents = require("dataCollectors.lab-contents")
local LabContents = ____lab_2Dcontents.default
local ____machine_2Dproduction = require("dataCollectors.machine-production")
local MachineProduction = ____machine_2Dproduction.default
local ____miner_2Dactivity = require("dataCollectors.miner-activity")
local MinerActivity = ____miner_2Dactivity.default
local ____player_2Dinventory = require("dataCollectors.player-inventory")
local PlayerInventory = ____player_2Dinventory.default
local ____player_2Dposition = require("dataCollectors.player-position")
local PlayerPosition = ____player_2Dposition.default
local ____research_2Dtiming = require("dataCollectors.research-timing")
local ResearchTiming = ____research_2Dtiming.default
local ____roboport_2Dusage = require("dataCollectors.roboport-usage")
local RoboportUsage = ____roboport_2Dusage.default
local ____rocket_2Dlaunch_2Dtime = require("dataCollectors.rocket-launch-time")
local RocketLaunchTime = ____rocket_2Dlaunch_2Dtime.default
local exportOnSiloLaunch = true
addDataCollector(__TS__New(PlayerPosition))
addDataCollector(__TS__New(PlayerInventory, 60))
addDataCollector(__TS__New(MachineProduction, {
    "assembling-machine-1",
    "assembling-machine-2",
    "assembling-machine-3",
    "chemical-plant",
    "oil-refinery",
    "stone-furnace",
    "steel-furnace",
    "rocket-silo"
}))
addDataCollector(__TS__New(BufferAmounts))
addDataCollector(__TS__New(LabContents))
addDataCollector(__TS__New(EntityLayout))
addDataCollector(__TS__New(MinerActivity))
addDataCollector(__TS__New(ResearchTiming))
addDataCollector(__TS__New(RocketLaunchTime))
addDataCollector(__TS__New(RoboportUsage))
if exportOnSiloLaunch then
    add_lib({events = {[defines.events.on_rocket_launched] = function() return exportAllData() end}})
end
commands.add_command(
    "export-replay-data",
    "Export current collected replay data",
    function()
        exportAllData()
        game.print("Exported data to script-output/replay-data/*.json")
    end
)
require("__base__.script.freeplay.control")
return ____exports
 end,
}
return require("main", ...)

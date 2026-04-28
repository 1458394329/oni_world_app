#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#include <iostream>
#include <fstream>
#include <sstream>
#include <iomanip>
#define EMSCRIPTEN_KEEPALIVE
#endif

#include <stack>
#include <array>
#include <climits>
#include <ranges>
#include <algorithm>

#include <clipper.hpp>

#include "config.h"
#include "Setting/SettingsCache.hpp"
#include "WorldGen.hpp"

// I defined only one function for exchanging data between c++ and js,
// it get resource from js and set result to js.
extern "C" void jsExchangeData(uint32_t type, uint32_t count, size_t data);

enum ResultType {
    RT_Starting,
    RT_Trait,
    RT_Geyser,
    RT_Polygon,
    RT_WorldSize,
    RT_Resource,
    RT_SearchStatus
};

struct GeyserRule
{
    int geyserIndex;
    int minCount;
    int maxCount;
};

struct SearchFilter
{
    int traitMask = 0;
    std::vector<GeyserRule> geyserRules;

    bool Empty() const
    {
        return traitMask == 0 && geyserRules.empty();
    }
};

struct SearchCandidate
{
    int seed = 0;
    int traitMatches = -1;
    int geyserDistance = INT_MAX;
    int attempts = 0;
    bool exact = false;
    bool valid = false;
};

static constexpr int SEARCH_ATTEMPT_LIMIT = 1000;
static constexpr int GEYSER_FILTER_METAL_VOLCANO = 1000;
static constexpr int GEYSER_RESULT_COUNT = 32;

// for debug
void WriteToBinary(const std::vector<Site> &sites)
{
    static int index = 10;
    std::vector<uint32_t> data;
    for (auto &site : sites) {
        data.push_back(site.idx);
        data.push_back(*(uint32_t *)&site.x);
        data.push_back(*(uint32_t *)&site.y);
        int count = (int)site.polygon.Vertices.size();
        if (count != 0) {
            data.push_back(count);
            for (auto &point : site.polygon.Vertices) {
                data.push_back(*(uint32_t *)&point.x);
                data.push_back(*(uint32_t *)&point.y);
            }
        }
        if (site.children && !site.children->empty()) {
            for (auto &child : *site.children) {
                data.push_back(child.idx);
                data.push_back(*(uint32_t *)&child.x);
                data.push_back(*(uint32_t *)&child.y);
                int count2 = (int)child.polygon.Vertices.size();
                if (count2 != 0) {
                    data.push_back(count2);
                    for (auto &point : child.polygon.Vertices) {
                        data.push_back(*(uint32_t *)&point.x);
                        data.push_back(*(uint32_t *)&point.y);
                    }
                }
            }
        }
    }
    jsExchangeData(index++, (uint32_t)data.size(), (uint32_t)data.data());
}

class App
{
private:
    SettingsCache m_settings;
    KRandom m_random{0};

    App() = default;

public:
    static App *Instance()
    {
        static App inst;
        return &inst;
    }

    void Initialize(int seed)
    {
        uint32_t count = SETTING_ASSET_FILESIZE;
        auto data = std::make_unique<char[]>(count);
        jsExchangeData(RT_Resource, count, (size_t)data.get());
        std::string_view content(data.get(), count);
        m_settings.LoadSettingsCache(content);
        m_random = KRandom(seed);
    }

    bool Generate(const std::string &code, const SearchFilter &filter);
    void FindBestSeed(const std::vector<World *> &worlds, const SearchFilter &filter);
    std::vector<const WorldTrait *> CollectRequestedTraits(int traitsFlag) const;
    SearchCandidate EvaluateCandidate(const std::vector<World *> &worlds,
                                      World &world, int worldIndex, int seed,
                                      const SearchFilter &filter,
                                      const std::vector<const WorldTrait *> &presets,
                                      int attempts);
    std::vector<int> CollectGeyserCounts(int seed, const WorldGen &worldGen) const;
    void SetResultWorldInfo(int seed, World *world, std::vector<Site> &sites);
    void SetResultTraits(const std::vector<const WorldTrait *> &traits);
    void SetResultGeysers(int seed, const WorldGen &worldGen);
    void SetResultPolygons(World *world, std::vector<Site> &sites);
    void SetSearchStatus(bool exact, int attempts);
    // union sites with the same zone type. if result has hole return true.
    static bool GetZonePolygon(Site &site, Polygon &polygon);
};

static World *GetStartWorld(const std::vector<World *> &worlds, int &index)
{
    index = 0;
    World *world = worlds[index];
    for (size_t i = 0; i < worlds.size(); ++i) {
        world = worlds[i];
        if (world->locationType == LocationType::StartWorld) {
            index = (int)i;
            return world;
        }
    }
    return world;
}

static int GetRuleCount(const std::vector<int> &counts, int geyserIndex)
{
    if (geyserIndex == GEYSER_FILTER_METAL_VOLCANO) {
        int total = 0;
        const int metalVolcanoes[] = {16, 17, 18, 19, 20, 24, 25};
        for (int index : metalVolcanoes) {
            total += counts[index];
        }
        return total;
    }
    if (geyserIndex < 0 || geyserIndex >= (int)counts.size()) {
        return 0;
    }
    return counts[geyserIndex];
}

static int GetGeyserDistance(const std::vector<int> &counts,
                             const std::vector<GeyserRule> &rules)
{
    int distance = 0;
    for (auto &rule : rules) {
        int count = GetRuleCount(counts, rule.geyserIndex);
        if (count < rule.minCount) {
            distance += rule.minCount - count;
        } else if (count > rule.maxCount) {
            distance += count - rule.maxCount;
        }
    }
    return distance;
}

static bool BetterCandidate(const SearchCandidate &lhs, const SearchCandidate &rhs)
{
    if (!rhs.valid) {
        return lhs.valid;
    }
    if (!lhs.valid) {
        return false;
    }
    if (lhs.traitMatches != rhs.traitMatches) {
        return lhs.traitMatches > rhs.traitMatches;
    }
    if (lhs.geyserDistance != rhs.geyserDistance) {
        return lhs.geyserDistance < rhs.geyserDistance;
    }
    return lhs.seed < rhs.seed;
}

bool App::Generate(const std::string &code, const SearchFilter &filter)
{
    if (!m_settings.CoordinateChanged(code, m_settings)) {
        LogE("parse seed code %s failed.", code.c_str());
        return false;
    }
    std::vector<World *> worlds;
    for (auto &worldPlacement : m_settings.cluster->worldPlacements) {
        auto itr = m_settings.worlds.find(worldPlacement.world);
        if (itr == m_settings.worlds.end()) {
            LogE("world %s was wrong.", worldPlacement.world.c_str());
            return false;
        }
        itr->second.locationType = worldPlacement.locationType;
        worlds.push_back(&itr->second);
    }
    if (worlds.size() == 1) {
        worlds[0]->locationType = LocationType::StartWorld;
    }
    SetSearchStatus(true, 0);
    if (!filter.Empty()) {
        FindBestSeed(worlds, filter);
    }
    m_settings.DoSubworldMixing(worlds);
    int seed = m_settings.seed;
    bool genWarpWorld = code.find("M-") == 0;
    for (size_t i = 0; i < worlds.size(); ++i) {
        auto world = worlds[i];
        if (world->locationType == LocationType::Cluster) {
            continue;
        } else if (world->locationType == LocationType::StartWorld) {
            // go on;
        } else if (!world->startingBaseTemplate.contains("::bases/warpworld")) {
            continue; // other inner cluster
        } else if (!genWarpWorld) {
            continue;
        }
        m_settings.seed = seed + i;
        auto traits = m_settings.GetRandomTraits(*world);
        for (auto trait : traits) {
            world->ApplayTraits(*trait, m_settings);
        }
        WorldGen worldGen(*world, m_settings);
        std::vector<Site> sites;
        if (!worldGen.GenerateOverworld(sites)) {
            LogE("generate overworld failed.");
            return false;
        }
        SetResultWorldInfo(seed, world, sites);
        SetResultTraits(traits);
        SetResultGeysers(seed, worldGen);
        SetResultPolygons(world, sites);
    }
    return true;
}

std::vector<const WorldTrait *> App::CollectRequestedTraits(int traitsFlag) const
{
    std::vector<const WorldTrait *> presets;
    int index = 0;
    for (auto &pair : m_settings.traits) {
        if ((traitsFlag >> index & 1) == 1) {
            presets.push_back(&pair.second);
        }
        ++index;
    }
    return presets;
}

std::vector<int> App::CollectGeyserCounts(int seed, const WorldGen &worldGen) const
{
    std::vector<int> counts(GEYSER_RESULT_COUNT, 0);
    auto geysers =
        worldGen.GetGeysers(seed + (int)m_settings.cluster->worldPlacements.size() - 1);
    for (auto &item : geysers) {
        if (item.z >= 0 && item.z < GEYSER_RESULT_COUNT) {
            counts[item.z]++;
        }
    }
    return counts;
}

SearchCandidate App::EvaluateCandidate(const std::vector<World *> &worlds,
                                       World &world, int worldIndex, int seed,
                                       const SearchFilter &filter,
                                       const std::vector<const WorldTrait *> &presets,
                                       int attempts)
{
    SearchCandidate candidate;
    candidate.seed = seed;
    candidate.attempts = attempts;
    m_settings.seed = seed;
    m_settings.DoSubworldMixing(worlds);
    m_settings.seed = seed + worldIndex;
    auto traits = m_settings.GetRandomTraits(world);
    candidate.traitMatches = 0;
    for (auto *preset : presets) {
        if (std::ranges::contains(traits, preset)) {
            candidate.traitMatches++;
        }
    }
    if (filter.geyserRules.empty()) {
        candidate.geyserDistance = 0;
        candidate.exact = candidate.traitMatches == (int)presets.size();
        candidate.valid = true;
        return candidate;
    }
    for (auto trait : traits) {
        world.ApplayTraits(*trait, m_settings);
    }
    WorldGen worldGen(world, m_settings);
    std::vector<Site> sites;
    if (!worldGen.GenerateOverworld(sites)) {
        return candidate;
    }
    auto counts = CollectGeyserCounts(seed, worldGen);
    candidate.geyserDistance = GetGeyserDistance(counts, filter.geyserRules);
    candidate.exact = candidate.traitMatches == (int)presets.size() &&
                      candidate.geyserDistance == 0;
    candidate.valid = true;
    return candidate;
}

void App::FindBestSeed(const std::vector<World *> &worlds, const SearchFilter &filter)
{
    auto presets = CollectRequestedTraits(filter.traitMask);
    int worldIndex = 0;
    World *world = GetStartWorld(worlds, worldIndex);
    if (world == nullptr) {
        m_settings.seed = m_random.Next();
        return;
    }
    SearchCandidate best;
    for (int attempt = 0; attempt < SEARCH_ATTEMPT_LIMIT; ++attempt) {
        if ((attempt + 1) % 10 == 0) {
            LogI("search filters progress: %d/%d", attempt + 1,
                 SEARCH_ATTEMPT_LIMIT);
        }
        int seed = m_random.Next();
        auto candidate = EvaluateCandidate(
            worlds, *world, worldIndex, seed, filter, presets, attempt + 1);
        if (candidate.exact) {
            m_settings.seed = candidate.seed;
            SetSearchStatus(true, candidate.attempts);
            return;
        }
        if (BetterCandidate(candidate, best)) {
            best = candidate;
        }
    }
    if (best.valid) {
        m_settings.seed = best.seed;
        SetSearchStatus(false, best.attempts);
    } else {
        m_settings.seed = m_random.Next();
        SetSearchStatus(false, SEARCH_ATTEMPT_LIMIT);
    }
    if (!presets.empty()) {
        LogI("can not find seed for preset traits");
    }
}

void App::SetResultWorldInfo(int seed, World *world, std::vector<Site> &sites)
{
    Vector2i starting = {sites[0].x, sites[0].y};
    Vector2i worldSize = world->worldsize;
    starting.y = worldSize.y - starting.y;
    int worldType = (world->locationType == LocationType::StartWorld) ? 0 : 1;
    jsExchangeData(RT_Starting, worldType, (size_t)&starting);
    jsExchangeData(RT_WorldSize, seed, (size_t)&worldSize);
}

void App::SetResultTraits(const std::vector<const WorldTrait *> &traits)
{
    std::vector<int> result;
    result.reserve(traits.size());
    for (auto &item : traits) {
        uint32_t index = 0;
        for (auto &pair : m_settings.traits) {
            if (item == &pair.second) {
                result.push_back(index);
                break;
            } else {
                index++;
            }
        }
    }
    jsExchangeData(RT_Trait, (uint32_t)result.size(), (size_t)result.data());
}

void App::SetResultGeysers(int seed, const WorldGen &worldGen)
{
    seed += (int)m_settings.cluster->worldPlacements.size() - 1;
    auto geysers = worldGen.GetGeysers(seed);
    std::vector<int> result;
    result.reserve(geysers.size() * 3);
    for (auto &item : geysers) {
        result.insert(result.end(), {item.z, item.x, item.y}); // z is type
    }
    jsExchangeData(RT_Geyser, (uint32_t)result.size(), (size_t)result.data());
}

void App::SetSearchStatus(bool exact, int attempts)
{
    jsExchangeData(RT_SearchStatus, exact ? 1 : 0, attempts);
}

void App::SetResultPolygons(World *world, std::vector<Site> &sites)
{
    std::vector<int> result;
    std::ranges::for_each(sites, [](Site &site) { site.visited = false; });
    for (auto &item : sites) {
        if (item.visited) {
            continue;
        }
        Polygon polygon;
        bool hasHole = GetZonePolygon(item, polygon);
        result.push_back(hasHole ? 1 : 0);
        result.push_back((int)item.subworld->zoneType);
        result.push_back((int)polygon.Vertices.size());
        for (auto &vex : polygon.Vertices) {
            result.push_back(vex.x);
            result.push_back(world->worldsize.y - vex.y);
        }
    }
    jsExchangeData(RT_Polygon, (uint32_t)result.size(), (size_t)result.data());
}

bool App::GetZonePolygon(Site &site, Polygon &polygon)
{
    ZoneType zoneType = site.subworld->zoneType;
    ClipperLib::Clipper clipper;
    std::stack<Site *> stack;
    stack.push(&site);
    while (!stack.empty()) {
        auto top = stack.top();
        stack.pop();
        if (top->visited) {
            continue;
        }
        ClipperLib::Path path;
        for (Vector2f point : top->polygon.Vertices) {
            point *= 10000.0f;
            path.emplace_back((int)point.x, (int)point.y);
        }
        clipper.AddPath(path, ClipperLib::ptSubject, true);
        top->visited = true;
        for (auto neighbour : top->neighbours) {
            if (neighbour->visited) {
                continue;
            }
            if (neighbour->subworld->zoneType != zoneType) {
                continue;
            }
            stack.push(neighbour);
        }
    }
    ClipperLib::PolyTree polytree;
    ClipperLib::Paths paths;
    clipper.Execute(ClipperLib::ctUnion, polytree, ClipperLib::pftEvenOdd);
    ClipperLib::PolyTreeToPaths(polytree, paths);
    if (!paths.empty()) {
        auto &path = paths[0];
        for (auto &item : path) {
            Vector2f point{(float)item.X, (float)item.Y};
            polygon.Vertices.emplace_back(point * 0.0001f);
        }
    }
    return paths.size() > 1;
}

extern "C" void EMSCRIPTEN_KEEPALIVE app_init(int seed)
{
    App::Instance()->Initialize(seed);
}

extern "C" bool EMSCRIPTEN_KEEPALIVE
app_generate(int type, int seed, int mix, int traitMask, int geyserCount,
             size_t geyserDataPtr)
{
    const char *worlds[] = {
        "SNDST-A-",  "OCAN-A-",    "S-FRZ-",     "LUSH-A-",    "FRST-A-",
        "VOLCA-",    "BAD-A-",     "HTFST-A-",   "OASIS-A-",   "CER-A-",
        "CERS-A-",   "PRE-A-",     "PRES-A-",    "V-SNDST-C-", "V-OCAN-C-",
        "V-SWMP-C-", "V-SFRZ-C-",  "V-LUSH-C-",  "V-FRST-C-",  "V-VOLCA-C-",
        "V-BAD-C-",  "V-HTFST-C-", "V-OASIS-C-", "V-CER-C-",   "V-CERS-C-",
        "V-PRE-C-",  "V-PRES-C-",  "SNDST-C-",   "PRE-C-",     "CER-C-",
        "FRST-C-",   "SWMP-C-",    "M-SWMP-C-",  "M-BAD-C-",   "M-FRZ-C-",
        "M-FLIP-C-", "M-RAD-C-",   "M-CERS-C-"};
    if (type < 0 || (int)std::size(worlds) <= type) {
        return false;
    }
    std::string code = worlds[type];
    code += std::to_string(seed);
    code += "-0-D3-";
    code += SettingsCache::BinaryToBase36(mix);
    SearchFilter filter;
    filter.traitMask = traitMask;
    auto *data = (int *)geyserDataPtr;
    for (int index = 0; index < geyserCount; ++index) {
        int offset = index * 3;
        int minCount = std::max(0, data[offset + 1]);
        int maxCount = std::max(minCount, data[offset + 2]);
        GeyserRule rule{
            data[offset],
            minCount,
            maxCount,
        };
        filter.geyserRules.push_back(rule);
    }
    LogI("generate with code: %s", code.c_str());
    return App::Instance()->Generate(code, filter);
}

#ifndef __EMSCRIPTEN__

int main()
{
    int type, seed, mixing;
    app_init(time(nullptr));
    while (true) {
        std::cout << "input type, seed, mixing: ";
        std::cin >> type >> seed >> mixing;
        if (seed == 0) {
            break;
        }
        if (!app_generate(type, seed, mixing, 0, 0, 0)) {
            LogE("generate failed.");
        }
    }
    return 0;
}

void jsExchangeData(uint32_t type, uint32_t count, size_t data)
{
    const char *geysers[] = {
        "低温蒸汽喷孔", "蒸汽喷孔",     "清水泉",       "低温泥浆泉",
        "污水泉",       "低温盐泥泉",   "盐水泉",       "小型火山",
        "火山",         "二氧化碳泉",   "二氧化碳喷孔", "氢气喷孔",
        "高温污氧喷孔", "含菌污氧喷孔", "氯气喷孔",     "天然气喷孔",
        "铜火山",       "铁火山",       "金火山",       "铝火山",
        "钴火山",       "渗油裂缝",     "液硫泉",       "冷氯喷孔",
        "钨火山",       "铌火山",       "打印舱",       "储油石",
        "输出端",       "输入端",       "传送器",       "低温箱"};
    const char *traits[] = {
        "坠毁的卫星群", "冰封之友",   "不规则的原油区",   "繁茂核心",
        "金属洞穴",     "放射性地壳", "地下海洋",         "火山活跃",
        "大型石块",     "中型石块",   "混合型石块",       "小型石块",
        "被圈闭的原油", "冰冻核心",   "活跃性地质",       "晶洞",
        "休眠性地质",   "大型冰川",   "不规则的原油区",   "岩浆通道",
        "金属贫瘠",     "金属富足",   "备选的打印舱位置", "粘液菌团",
        "地下海洋",     "火山活跃"};
    switch (type) {
    default:
        break;
    case RT_Starting:
        break;
    case RT_Trait: {
        auto ptr = (uint32_t *)data;
        auto end = ptr + count;
        while (ptr < end) {
            auto index = *ptr++;
            LogI("%s", traits[index]);
        }
        break;
    }
    case RT_Geyser: {
        auto ptr = (uint32_t *)data;
        auto end = ptr + count;
        while (ptr < end) {
            auto index = *ptr++;
            auto x = *ptr++;
            auto y = *ptr++;
            LogI("%s: %d, %d", geysers[index], x, y);
        }
        break;
    }
    case RT_Polygon:
        break;
    case RT_Resource: {
        auto ptr = (char *)data;
        *ptr = 'E';
        std::ifstream fstm(SETTING_ASSET_FILEPATH, std::ios::binary);
        if (fstm.is_open()) {
            auto size = fstm.seekg(0, std::ios::end).tellg();
            if (size == count) {
                fstm.seekg(0).read(ptr, count);
            } else {
                LogE("wrong count.");
            }
        } else {
            LogE("can not open file.");
        }
        break;
    }
    case RT_SearchStatus:
        LogI("search status: %s, attempts: %d",
             count == 0 ? "closest" : "exact", (int)data);
        break;
    }
}

#endif

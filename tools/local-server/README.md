# 本地测试服（BDS 1.26.51 + 可选 Endstone）

给行为包做**无头实测**用：本地起一台 BDS，把仓库的包部署进测试世界，看脚本日志。
不需要开游戏、不需要真人玩家，适合验证「这个 API 在 1.26.51 上到底行不行」。

## 一、一次性搭建（已在本机完成，重装环境时照做）

需要在工作区建一个测试实例目录 `.bds-test/`（**已 gitignore**，约 500MB）：

```bash
cd <仓库根>
mkdir -p .bds-test

# 1) BDS 二进制 + 世界 + 依赖（全部来自本机已有的 Beatorini-Server 归档，无需联网）
S=../Beatorini-Server/payload
rsync -a "$S/bds/"        .bds-test/bedrock_server/
rsync -a "$S/wheels/"     .bds-test/wheels/          # 仅 Endstone 需要
rsync -a "$S/python/"     .bds-test/python/          # 仅 Endstone 需要（cpython 3.12.14）
rsync -a --exclude 'db/' "$S/world/Beatorini/" \
         .bds-test/bedrock_server/worlds/TestWorld/  # 去掉 db → 干净测试世界（保留 level.dat 的实验开关）

# 2) 配置（server.properties 关键项）
#    server-port=19133  server-portv6=19134  transport=nethernet
#    level-name=TestWorld  online-mode=false  allow-list=false  allow-cheats=true
#    content-log-file-enabled=true（内容日志是排查 JSON/维度错误的唯一途径）
#    注意：allow-list=true + online-mode=false 会让 BDS 拒绝启动（exit 2）

# 3) 把仓库的包部署进测试世界
tools/local-server/deploy-pack.sh
```

## 二、日常使用

```bash
tools/local-server/run.sh          # 前台/后台起服（日志 .bds-test/logs/server.log）
tools/local-server/cmd.sh stop     # 发控制台命令（走 FIFO，等价 tmux send-keys）
tools/local-server/cmd.sh "execute in island:void_1 run setblock 0 64 0 stone"
tools/local-server/deploy-pack.sh  # 改完代码 → 同步进测试世界（需先停服）
```

脚本日志（`console.warn`）会以 `[Scripting] ...` 出现在服务端日志里；JSON/维度/包的解析错误只在
`bedrock_server/ContentLog*.txt` 里，排查时必看。

## 三、Endstone 的现状（重要）

`pty-run.py` 可以用真 PTY 起 Endstone（本机没装 tmux）：

```bash
python3 tools/local-server/pty-run.py "$PWD/.bds-test" "$PWD/.bds-test/logs/endstone.log" "$PWD/.bds-test/cmd.fifo"
```

但**本机（Arch / glibc 2.44）跑不起来**：Endstone 0.11.12（cp312 wheel + Python 3.12.14）在
BDS 1.26.51.1 上启动即崩：

```
libc++abi: terminating due to uncaught exception of type pybind11::cast_error:
  Unable to cast Python instance of type <class 'str'> to C++ type 'std::__1::basic_string<...>'
  at DedicatedServer::start(std::string const&, Bedrock::ActivationArguments const&)
[ERROR]: Server exited with non-zero code 1.
```

交互模式（PTY）与 `--no-interactive` 都一样崩，与行为包无关（此时包还没加载）。
Endstone 自带 `endstone.libs/libc++*.so`（LD_PRELOAD），而 BDS 是静态链接自己的 libc++，
怀疑是两套 libc++ ABI 在 `std::string` 上的冲突。排查/绕开建议：

- 想在本机测行为包 → **直接用纯 BDS**（`run.sh`），功能验证完全够用
- 想验 Endstone → 在目标 Ubuntu 机器上试，或换 Endstone 版本 / 换 `downloads/x/` 里的
  cp313 wheel + Python 3.13（本机没有 3.13，且 PyPI 不可达，未能验证）

## 四、已经用它验证过的结论（2026-09-25）

| 结论 | 证据 |
|---|---|
| 包在 1.26.51 上完整加载、零异常 | `[Beatorini] All modules initialized!` |
| `worldClockRegistry.registerClock` 可用，marker 按 `time` + `period` 精确触发 | 测试时钟 marker 在 clock.time = 101/301/501/701 触发 |
| `clock.time = world.getTimeOfDay()` 对齐成功 | `[Clock] beatorini:server 就绪（time=19595…）` |
| `TextPrimitive.lineGapHeight` 可用 | 默认 0，赋值 0.35 读回 0.3499999，addText/removeText 正常 |
| `DimensionTypes.getAll()` 含自定义维度 | 262 个（256 island:void_* + 3 原版 + island:vault + 2 测试维度） |
| 自定义维度 JSON **必须写 `format_version: "1.26.50"`** | 不写 → `no valid version passed by the caller`；写 `1.20.0` → `format_version … not present in the Schema` |
| 自定义维度 JSON **不能单独创建维度** | 只放 JSON 不注册 → `Dimension 'x' is invalid.` |
| JSON 的 `dimension_height` / `default_biome` **会作用于脚本注册的同名维度** | 高度由 -64..320 变为 -16..48；群系由 ocean 变为 taiga/jungle |
| 脚本注册的自定义维度默认群系是 `minecraft:ocean` | `island:void_1` / `island:vault` 实测均为 ocean |
| 自定义维度默认高度 = 主世界（-64..320） | `heightRange` 实测 |
| 256 个维度**不必然**导致关服死锁 | 纯 BDS + 本包连续 3 次 `stop` 均 `Quit correctly` 正常退出 |

### 「给已存在的维度补 JSON」实测（P1→P2→P3 三阶段对照）

在 `island:void_1`（已由脚本注册、存档里已有方块数据）上补/撤 `dimensions/island_void_1.json`：

| 项目 | 结论 | 证据 |
|---|---|---|
| `dimension_height` 改已存在维度 | ✅ **运行时生效**：加 JSON 后 `-64..320` → `0..32`；撤掉后立刻回退 `-64..320` | `heightRange` 实测 |
| 收紧高度会不会丢方块 | ✅ **不丢**：y=200/100/-60 的标记方块在超范围期间读不到（`LocationOutOfWorldBoundariesError`），范围恢复后原样读回 | `block(0,200,0)=stone` 等 |
| `default_biome` 改已存在维度 | ⚠️ **只影响之后才落盘的区块**：已有方块数据的区块群系**固化**，加 JSON 也不变 | 旧区块始终 `ocean`（即使默认群系已是 desert） |
| 未落盘的空白区块 | 实时跟随维度默认群系：JSON 生效时读 `desert`，撤掉后读回 `ocean` | 新区块两次读数相反 |
| JSON 生效期间落盘的区块 | 群系**固化进存档**：撤掉 JSON 后仍是 `desert` | (4096,4096) 放石头后撤 JSON，仍为 desert |
| 脚本 API 改群系 | ❌ 2.11.0-beta 没有写群系的接口（只有 `getBiome` / `containsBiomes` / `BiomeFilter` 查询） | d.ts 检索 |

### 维度高度上限实测：真正的约束是「最高点 ≤ 512」

官方组件文档写 `min_y` ∈ [-64, 320]、`height_range` ∈ [16, 384]，但 **1.26.51 实测并未按这个限制执行**，
真正的约束是 `min_y + height_range ≤ 512`（与老 `dimension_bounds` 的 ±512 一致）：

| JSON 配置 | 实测 `heightRange` | 结果 |
|---|---|---|
| `min_y -64, height_range 384` | `-64..320` | ✅ 生效 |
| **`min_y -64, height_range 576`** | **`-64..512`** | ✅ 生效（y=512 可放方块，y=513 越界） |
| `min_y -512, height_range 1024` | `-512..512` | ✅ 生效 |
| `min_y -192, height_range 384` | `-192..192` | ✅ 生效 |
| `min_y 128, height_range 384` | `128..512` | ✅ 生效 |
| `min_y -64, height_range 1024` | `-64..320`（回落默认） | ❌ 超 512 被拒，**整份 JSON 失效（连同 default_biome）** |
| `min_y -64, height_range 2048` | 同上 | ❌ 被拒 |

要点：
- 想「下限 -64 + 上限 512」→ 写 `min_y: -64, height_range: 576`
- 配置非法时是**整文件拒绝**，维度静默回落默认（-64..320、群系 ocean），只在 ContentLog 里报错 → 改高度时务必确认群系/高度读数
- **建筑上限是 511 不是 512**：`heightRange` 报 `-64..512`，但 y=512 可读不可写（`setblock` 报 `Failed to execute 'setblock' as [Null]`），与主世界 `-64..320` → 可建到 319 同一套约定
- 行为包侧两处硬编码已同步改掉（`config.js` 新增 `ISLAND_BOUNDARY_LIMIT_Y` / `ISLAND_DIMENSION_*`）：
  - 边界扩展判据：x/z 用 `ISLAND_BOUNDARY_LIMIT`(256)，y 用 `ISLAND_BOUNDARY_LIMIT_Y`(512)
  - 重置范围：`Math.max(ISLAND_DIMENSION_MIN_Y, …)` / `Math.min(ISLAND_DIMENSION_MAX_Y, …)`

### 上线动作安全性实测（256 个维度 JSON 的部署模拟）

按「上线时会做的动作」逐步验证 `island:void_1`（已有方块数据）：

| 动作 | 结果 |
|---|---|
| 放钻石块 y=64/400/500 → 停服 → 重启 | ✅ 三处全部还在（区块持久化正常） |
| **移除 `dimensions/`**（回到改动前）→ 重启 | y=64 还在；y=400/500 报越界读不到（默认高度 -64..320） |
| **加回 `dimensions/`**（= 上线动作）→ 重启 | ✅ y=64/400/500 **全部原样读回** → **加维度定义不会重置区块数据** |
| 抽查 3 个维度 | `island:void_1` / `void_128` / `void_256` 均为 `-64..512` ✅ |

⚠️ 未解异常（务必留意）：早期实验里把高度**压到 0..32** 的那批标记方块，在后续某次启动后全部消失（同批数据在"压缩→恢复"的相邻两次启动间是完好的，多次启动后才丢）。
推测是**收紧高度期间保存世界会丢弃超范围的区块分段**。本次上线是**扩大**范围（384 → 576），实测反复验证数据完好；但**不要在生产世界做收缩高度的实验**。

**推论（对主题群系空岛）**：老岛的核心区块早已落盘 → 补 JSON 改不动它们的群系（仍是 `ocean`）；
但岛屿扩建出去、玩家从未到过的**新区块**会按当时的默认群系生成 → 会出现「中心海洋 + 外围新群系」的割裂。
要整岛统一主题群系，只能让维度**在首次生成区块之前**就带上 JSON（新维度 / 新存档），或换新维度 ID。

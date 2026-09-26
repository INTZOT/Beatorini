// ============================================================
// 生成空岛维度定义 dimensions/island_void_N.json
//
// 为什么需要这些文件：脚本 registerCustomDimension() 注册的维度只能拿到默认高度（-64..320），
// 想抬高建筑上限必须靠行为包的 dimensions/*.json 覆盖同名维度（已实测：JSON 会作用于
// 脚本注册的同名维度，且高度是运行时生效、撤掉即回退、不销毁方块）。
//
// 高度值来自 scripts/modules/config.js，避免两处漂移。
// 实测约束（BDS 1.26.51）：min_y + height_range ≤ 512，超了整份 JSON 会被拒绝。
//
// 用法：node tools/gen-island-dimensions.js
// ============================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG = path.join(ROOT, "scripts", "modules", "config.js");
const OUT_DIR = path.join(ROOT, "dimensions");

const cfg = fs.readFileSync(CONFIG, "utf8");
const readNum = (name) => {
  const m = cfg.match(new RegExp(`export const ${name}\\s*=\\s*(-?\\d+)`));
  if (!m) throw new Error(`config.js 里找不到 ${name}`);
  return Number(m[1]);
};
const readStr = (name) => {
  const m = cfg.match(new RegExp(`export const ${name}\\s*=\\s*"([^"]+)"`));
  if (!m) throw new Error(`config.js 里找不到 ${name}`);
  return m[1];
};

const NAMESPACE = readStr("DIMENSION_NAMESPACE");
const COUNT = readNum("DIMENSION_COUNT");
const MIN_Y = readNum("ISLAND_DIMENSION_MIN_Y");
const HEIGHT_RANGE = readNum("ISLAND_DIMENSION_HEIGHT_RANGE");
const MAX_Y = readNum("ISLAND_DIMENSION_MAX_Y");
const FORMAT_VERSION = "1.26.50"; // 必须写！不写会被判 no valid version

if (MIN_Y + HEIGHT_RANGE !== MAX_Y) {
  throw new Error(
    `配置不自洽：min_y(${MIN_Y}) + height_range(${HEIGHT_RANGE}) = ${MIN_Y + HEIGHT_RANGE}，` +
      `但 ISLAND_DIMENSION_MAX_Y = ${MAX_Y}`
  );
}
if (MAX_Y > 512) {
  throw new Error(`最高点 ${MAX_Y} 超过实测上限 512，BDS 会拒绝整份 JSON`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
for (let i = 1; i <= COUNT; i++) {
  const definition = {
    format_version: FORMAT_VERSION,
    "minecraft:dimension": {
      description: { identifier: `${NAMESPACE}:void_${i}` },
      components: {
        // generator_type 目前只支持 void，且是必需组件
        "minecraft:generation": { generator_type: "void" },
        "minecraft:dimension_height": {
          min_y: MIN_Y,
          height_range: HEIGHT_RANGE,
        },
        // 刻意不写 minecraft:default_biome：脚本注册维度默认就是 ocean，
        // 而群系只在区块落盘时固化 → 给已生成的老岛补群系会造成「中心海洋 + 外围新群系」割裂。
      },
    },
  };
  const file = path.join(OUT_DIR, `island_void_${i}.json`);
  // 单行紧凑写法：256 个文件，紧凑后整目录 ~90KB（美化排版会到 1MB）
  fs.writeFileSync(file, JSON.stringify(definition) + "\n");
  written++;
}

// --- 金库维度：同样需要包定义 ---------------------------------------------
// island:vault 与 256 个 void 维度走的是同一条裸注册路径（dimensions.js 里只调
// registerCustomDimension(id)，没有高度也没有生成器）。区别在于 void 维度有下面这些
// JSON 覆盖，而 vault 此前没有 —— 线上 2026-09-26 实测后果：
//     execute in island:vault run setblock 0 100 0 air
//       -> Cannot place block outside of the world
// 该维度区块永远无法进入 loaded/ticking，spawnEntity 抛 LocationInUnloadedChunkError，
// 金库实体建不出来、区块从不落盘（所有世界备份中都没有它们），市场永久 0/2 不可用。
// 给它补一份同名定义，机制与 void 维度完全一致。
const VAULT_DIM_ID = readStr("MARKET_VAULT_DIM_ID");
fs.writeFileSync(
  path.join(OUT_DIR, "island_vault.json"),
  JSON.stringify({
    format_version: FORMAT_VERSION,
    "minecraft:dimension": {
      description: { identifier: VAULT_DIM_ID },
      components: {
        "minecraft:generation": { generator_type: "void" },
        "minecraft:dimension_height": { min_y: MIN_Y, height_range: HEIGHT_RANGE },
      },
    },
  }) + "\n"
);
written++;

console.log(
  `已生成 ${written} 个维度定义 → ${path.relative(ROOT, OUT_DIR)}/` +
    `（${NAMESPACE}:void_1 ~ void_${COUNT} + ${VAULT_DIM_ID}，高度 ${MIN_Y}..${MAX_Y}）`
);

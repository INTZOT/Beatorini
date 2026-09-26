// 版本升级辅助：比较两套 @minecraft/* 类型定义 / vanilla-data 的差异
// 场景：游戏更新后（如 26.50 → 26.51），先 npm i 新版本到本地，再和旧版本对比，
//       快速看出「新增了哪些 API / 哪些被移除 / 有哪些新方块物品 ID」。
//
// 用法：
//   node tools/diff-mcapi.js api  <旧 index.d.ts> <新 index.d.ts>
//   node tools/diff-mcapi.js vanilla <旧 vanilla-data/lib> <新 vanilla-data/lib>
//
// 例子（旧版本从 docs/ 取，新版本从 node_modules 取）：
//   node tools/diff-mcapi.js api docs/server/index.d.ts node_modules/@minecraft/server/index.d.ts
//   node tools/diff-mcapi.js vanilla docs/vanilla-data/lib node_modules/@minecraft/vanilla-data/lib
//
// 注意：vanilla-data 的方块 ID 在枚举里是双引号，在方块状态映射里是单引号
//       （'minecraft:xxx': XxxStates），本脚本两种都统计，但会把「状态映射键」
//       也算作一次出现，看结果时留意。

const fs = require("fs");
const path = require("path");

const norm = (s) => s.replace(/\s+/g, " ").trim();

/** 解析 d.ts，返回 Map<类型名, {kind, members:Set}> */
function parseDts(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const owners = new Map();
  let owner = null;
  let ownerDepth = -1;
  let depth = 0;
  let inBlockComment = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (inBlockComment) {
      if (line.includes("*/")) inBlockComment = false;
      continue;
    }
    if (line.startsWith("/*")) {
      if (!line.includes("*/")) inBlockComment = true;
      continue;
    }
    if (line === "" || line.startsWith("//")) continue;

    if (depth === 0) {
      const m = line.match(
        /^export (?:declare )?(?:abstract )?(class|interface|enum|type|namespace|function|const|let|var) ([A-Za-z0-9_$]+)/,
      );
      if (m) {
        owner = m[2];
        ownerDepth = depth;
        if (!owners.has(owner)) owners.set(owner, { kind: m[1], members: new Set() });
      }
    }

    if (owner) {
      const isDecl =
        /^(?:static\s+)?(?:readonly\s+)?(?:get\s+|set\s+)?[A-Za-z_$][A-Za-z0-9_$]*\??\s*(?:<[^>]*>)?\s*\(/.test(line) ||
        /^(?:static\s+)?(?:readonly\s+)?[A-Za-z_$][A-Za-z0-9_$]*\??\s*:/.test(line) ||
        /^[A-Z_0-9]+\s*=/.test(line);
      if (isDecl) owners.get(owner).members.add(norm(line));
    }

    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth <= ownerDepth) owner = null;
      }
    }
  }
  return owners;
}

function apiDiff(oldFile, newFile) {
  const a = parseDts(oldFile);
  const b = parseDts(newFile);
  const addedOwners = [...b.keys()].filter((k) => !a.has(k)).sort();
  const removedOwners = [...a.keys()].filter((k) => !b.has(k)).sort();
  const memberAdds = [];
  for (const [name, info] of b) {
    if (!a.has(name)) continue;
    const added = [...info.members].filter((m) => !a.get(name).members.has(m));
    if (added.length) memberAdds.push({ name, kind: info.kind, added });
  }
  memberAdds.sort((x, y) => y.added.length - x.added.length);

  console.log(`### 新增类型/类/枚举 (${addedOwners.length})\n${addedOwners.join(" ")}`);
  console.log(`\n### 移除的类型 (${removedOwners.length})\n${removedOwners.join(" ")}`);
  console.log(`\n### 已有类型上的新增成员 (${memberAdds.length} 个类型)`);
  for (const { name, kind, added } of memberAdds) {
    console.log(`\n-- ${kind} ${name} (+${added.length})`);
    for (const m of added) console.log("   " + m);
  }
}

/** 收集一个 vanilla-data/lib 目录里所有 minecraft: 开头的 ID */
function collectIds(dir) {
  const out = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".d.ts")) continue;
    const ids = new Set();
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of text.matchAll(/["'](minecraft:[a-z0-9_./]+)["']/g)) ids.add(m[1]);
    out.set(f, ids);
  }
  return out;
}

function vanillaDiff(oldDir, newDir) {
  const a = collectIds(oldDir);
  const b = collectIds(newDir);
  let any = false;
  for (const [f, ids] of b) {
    const prev = a.get(f) || new Set();
    const added = [...ids].filter((i) => !prev.has(i)).sort();
    const removed = [...prev].filter((i) => !ids.has(i)).sort();
    if (!added.length && !removed.length) continue;
    any = true;
    console.log(`\n## ${f}  +${added.length} / -${removed.length}`);
    if (added.length) console.log("新增: " + added.join(" "));
    if (removed.length) console.log("移除: " + removed.join(" "));
  }
  if (!any) console.log("没有差异");
}

const [, , mode, p1, p2] = process.argv;
if (mode === "api" && p1 && p2) apiDiff(p1, p2);
else if (mode === "vanilla" && p1 && p2) vanillaDiff(p1, p2);
else {
  console.error("用法：node tools/diff-mcapi.js api <旧 index.d.ts> <新 index.d.ts>");
  console.error("      node tools/diff-mcapi.js vanilla <旧 lib 目录> <新 lib 目录>");
  process.exit(1);
}

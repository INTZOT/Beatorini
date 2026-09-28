// ============================================================
// 符号解析自检：找出"使用了但既没导入、也没定义"的标识符
//
// 为什么需要它（2026-09-26 生产事故）：
//   `achievements.js` 调用了 `safeParseArray` 却漏了 import，
//   语法检查（node --check）与 import/export 匹配检查都发现不了 ——
//   前者只验证语法，后者只验证"导入的名字在目标模块里存在"。
//   错误直到玩家进服触发 `getAchievements()` 时才以
//   `ReferenceError: 'safeParseArray' is not defined` 暴露到线上。
//
// 用法：node tools/lint-symbols.js [目录，默认 scripts]
// 退出码：0 = 无问题；1 = 发现问题（可用于提交前检查）
// ============================================================
const fs = require("fs");
const path = require("path");

const KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue",
  "return", "function", "class", "const", "let", "var", "new", "delete", "typeof",
  "instanceof", "in", "of", "this", "super", "try", "catch", "finally", "throw",
  "async", "await", "yield", "static", "get", "set", "export", "import", "from", "as",
  "void", "null", "true", "false", "extends", "with", "debugger", "target",
]);

const GLOBALS = new Set([
  "console", "Math", "Date", "JSON", "Number", "String", "Boolean", "Object", "Array",
  "Map", "Set", "WeakMap", "WeakSet", "Promise", "Error", "TypeError", "RangeError",
  "SyntaxError", "Infinity", "NaN", "undefined", "isNaN", "parseInt", "parseFloat",
  "Symbol", "BigInt", "RegExp", "Function", "globalThis", "structuredClone",
  "arguments", "eval", "encodeURIComponent", "decodeURIComponent",
]);

/** 去掉注释与字符串内容，但保留模板字符串里的 ${...} 表达式 */
function stripCommentsAndStrings(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") i++;
        i++;
      }
      i++;
      out += '""';
      continue;
    }
    if (c === "`") {
      i++;
      out += '""';
      while (i < n && src[i] !== "`") {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === "$" && src[i + 1] === "{") {
          // 模板插值里的表达式照常参与符号检查
          let depth = 1;
          i += 2;
          const start = i;
          while (i < n && depth > 0) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            i++;
          }
          out += " " + stripCommentsAndStrings(src.slice(start, i - 1)) + " ";
          continue;
        }
        i++;
      }
      i++;
      continue;
    }
    // 正则字面量（启发式）：`/` 出现在运算符/括号/逗号/行首之后，且不是 `//`、`/*` 或除号
    if (c === "/" && /[=(:,![&|?{};+\-*%<>~^]|^/.test(out.trimEnd().slice(-1) || "^")) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n) {
        const d = src[j];
        if (d === "\\") { j += 2; continue; }
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) { closed = true; break; }
        else if (d === "\n") break;
        j++;
      }
      if (closed) {
        j++;
        while (j < n && /[a-z]/.test(src[j])) j++;
        out += " RE ";
        i = j;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

function collectDeclared(code) {
  const declared = new Set();
  const addParams = (params) => {
    for (const raw of params.split(",")) {
      const p = raw.trim();
      if (!p) continue;
      // 解构参数 { a, b: c } / [a, b] / a = 1
      if (p.startsWith("{") || p.startsWith("[")) {
        for (const m of p.matchAll(/([A-Za-z_$][\w$]*)\s*(?::|,|}|]|$)/g)) {
          const name = m[1];
          // { a: b } 里 a 是键、b 是变量；粗略把两者都算作已声明
          declared.add(name);
        }
        continue;
      }
      const name = p.split("=")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
    }
  };

  for (const m of code.matchAll(/import\s*\{([^}]*)\}/g))
    for (const part of m[1].split(",")) {
      const bits = part.trim().split(/\s+as\s+/).map((x) => x.trim());
      for (const bit of bits) if (/^[A-Za-z_$][\w$]*$/.test(bit)) declared.add(bit);
    }
  for (const m of code.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/g)) declared.add(m[1]);
  for (const m of code.matchAll(/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of code.matchAll(/(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of code.matchAll(/(?:const|let|var)\s+([^;=\n]+)/g))
    for (const part of m[1].split(",")) {
      const name = part.trim().split("=")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
    }
  for (const m of code.matchAll(/(?:const|let|var)\s*\{([^}]*)\}/g))
    for (const part of m[1].split(",")) {
      const name = part.trim().split(":").pop().split("=")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
    }
  for (const m of code.matchAll(/(?:const|let|var)\s*\[([^\]]*)\]/g))
    for (const part of m[1].split(",")) {
      const name = part.trim().split("=")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
    }
  for (const m of code.matchAll(/function\s*[A-Za-z_$]*\s*\(([^)]*)\)/g)) addParams(m[1]);
  for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) addParams(m[1]);
  for (const m of code.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) declared.add(m[1]);
  for (const m of code.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of code.matchAll(/for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  return declared;
}

function lintFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  const code = stripCommentsAndStrings(raw);
  const declared = collectDeclared(code);
  // 对象字面量的键（`name:`）不算引用
  const keys = new Set();
  for (const m of code.matchAll(/(?:^|[{,\s])([A-Za-z_$][\w$]*)\s*:/g)) keys.add(m[1]);

  const problems = [];
  for (const m of code.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)/g)) {
    const name = m[2];
    if (name === "RE") continue; // 正则占位符
    if (KEYWORDS.has(name) || GLOBALS.has(name) || declared.has(name) || keys.has(name)) continue;
    // 排除紧跟 `(` 的成员方法名等误报：仅在 name 前有 `.` 时才是属性，已由正则排除
    problems.push(name);
  }
  return [...new Set(problems)];
}

const root = process.argv[2] || "scripts";
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (full.endsWith(".js")) files.push(full);
  }
})(root);

let bad = 0;
for (const file of files) {
  const problems = lintFile(file);
  if (problems.length === 0) continue;
  bad += problems.length;
  console.log(`✗ ${file}: 可能未定义 → ${problems.join(", ")}`);
}
console.log(
  bad === 0
    ? `✓ ${files.length} 个模块未发现未定义符号`
    : `共 ${bad} 处可疑（若是对象键/属性误报请忽略，` +
        `但 ReferenceError 类问题必须清零）`
);
process.exit(bad === 0 ? 0 : 1);

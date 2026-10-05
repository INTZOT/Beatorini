#!/usr/bin/env bash
# ============================================================
# 打包行为包为 .mcpack（可直接在游戏里导入）
#
# .mcpack 就是"行为包目录的 zip"，但有两个硬性要求：
#   1) manifest.json 必须在压缩包**根目录**（不能多套一层文件夹）
#   2) 只放游戏真正需要的内容：manifest.json / pack_icon.png / entities / scripts
#      / dimensions / structures(*.mcstructure)
#      —— tools/、docs/、node_modules/、*.geo.json、README 等一律不入包
#
# 用法：tools/build-mcpack.sh [版本号]
# 输出：dist/BeatoriniFI-v<版本>.mcpack
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-$(node -p "require('./package.json').version")}"
OUT_DIR="$ROOT/dist"
OUT="$OUT_DIR/BeatoriniFI-v${VERSION}.mcpack"

command -v python3 >/dev/null || { echo "需要 python3（用标准库 zipfile 打包）" >&2; exit 1; }

echo "== 打包 BeatoriniFI v${VERSION} =="
mkdir -p "$OUT_DIR"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

# --- 1) 按白名单收集文件 ---
cp manifest.json "$STAGING/"
[ -f pack_icon.png ] && cp pack_icon.png "$STAGING/"
for dir in entities scripts dimensions; do
  [ -d "$dir" ] && cp -r "$dir" "$STAGING/"
done
if [ -d structures ]; then
  mkdir -p "$STAGING/structures"
  for f in structures/*.mcstructure; do
    [ -e "$f" ] && cp "$f" "$STAGING/structures/"
  done
fi

# --- 2) 打包（Python 标准库，避免依赖 zip 命令）---
python3 - "$STAGING" "$OUT" <<'PY'
import os, sys, zipfile, json
staging, out = sys.argv[1], sys.argv[2]
count = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for root, dirs, files in os.walk(staging):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for name in sorted(files):
            if name.startswith("."):
                continue
            full = os.path.join(root, name)
            z.write(full, os.path.relpath(full, staging).replace(os.sep, "/"))
            count += 1

with zipfile.ZipFile(out) as z:
    names = z.namelist()
    assert "manifest.json" in names, "manifest.json 不在压缩包根目录"
    bad = [
        n for n in names
        if n.endswith((".geo.json", ".md", ".sh", ".ps1"))
        or n.startswith(("tools/", "node_modules/", "docs/", "dist/", ".bds-test/"))
    ]
    assert not bad, f"包内出现不该分发的文件：{bad[:5]}"
    manifest = json.loads(z.read("manifest.json"))
    deps = ", ".join(
        f"{d.get('module_name')}@{d.get('version')}" for d in manifest.get("dependencies", [])
    )
print(f"文件数: {count}")
print(f"包名: {manifest['header']['name']} 版本 {manifest['header']['version']}")
print(f"最低引擎: {manifest['header']['min_engine_version']}")
print(f"依赖: {deps}")
PY

echo "体积: $(du -h "$OUT" | cut -f1)"
echo "输出: $OUT"

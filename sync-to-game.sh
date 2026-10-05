#!/usr/bin/env bash
# 同步本行为包到 Linux 版（RoundStudio BedrockBoot / ProtonGDK）游戏世界目录。
#
# 用法：
#   ./sync-to-game.sh                 # 同步到默认世界（Beatorini）
#   ./sync-to-game.sh -n              # 只预演，不写盘（dry-run）
#   ./sync-to-game.sh /path/to/pack   # 指定其它目标（如 com.mojang/development_behavior_packs/Beatorini）
#
# 说明：
#   - 只推送行为包真正需要的部分：manifest.json / entities / scripts / structures(*.mcstructure)
#   - node_modules、docs、tools、日志文档等开发用文件不会被同步
#   - 不使用 --delete：目标目录里游戏内生成的文件（如 structures/lobby_save.mcstructure）不会被删掉
#   - 同步前请先完全退出游戏，否则游戏可能覆盖或缓存旧脚本

set -euo pipefail

DEFAULT_DST="$HOME/.config/RoundStudio/BedrockBoot2/BedrockBoot.Linux/ProtonGDK/game_prefix/drive_c/users/intzot/AppData/Roaming/Minecraft Bedrock/Users/Shared/games/com.mojang/minecraftWorlds/Beatorini/behavior_packs/Beatorini"

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=0
DST=""

for arg in "$@"; do
  case "$arg" in
    -n|--dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) DST="$arg" ;;
  esac
done
DST="${DST:-${BEATORINI_DST:-$DEFAULT_DST}}"

if [ ! -d "$DST" ]; then
  echo "目标目录不存在：$DST" >&2
  echo "（游戏里先创建/进入一次该世界，目录才会生成）" >&2
  exit 1
fi

if pgrep -f "Minecraft.*(Windows|Bedrock)" >/dev/null 2>&1; then
  echo "警告：检测到 Minecraft 进程在运行，脚本文件可能被锁定/被游戏覆盖，建议先完全退出游戏。" >&2
fi

RSYNC_FLAGS=(-a -i -c --human-readable)
[ "$DRY_RUN" -eq 1 ] && RSYNC_FLAGS+=(--dry-run)

echo "源：$SRC"
echo "目标：$DST"
[ "$DRY_RUN" -eq 1 ] && echo "（dry-run，不会写入任何文件）"

# 1) 清单 + 数据目录（目录不带尾斜杠：整体复制成 $DST/entities、$DST/scripts）
rsync "${RSYNC_FLAGS[@]}" "$SRC/manifest.json" "$DST/"
# 图标（缺失时游戏内显示默认图标；由 tools/gen-pack-icon.js 生成）
if [ -f "$SRC/pack_icon.png" ]; then
  rsync "${RSYNC_FLAGS[@]}" "$SRC/pack_icon.png" "$DST/"
fi
rsync "${RSYNC_FLAGS[@]}" "$SRC/entities" "$SRC/scripts" "$DST/"

# 2) 维度定义（dimensions/*.json，决定空岛建筑上限；由 tools/gen-island-dimensions.js 生成）
if [ -d "$SRC/dimensions" ]; then
  rsync "${RSYNC_FLAGS[@]}" --delete "$SRC/dimensions/" "$DST/dimensions/"
fi

# 3) 结构文件：world 里只认 .mcstructure，排除资源包用的 *.geo.json
rsync "${RSYNC_FLAGS[@]}" --exclude='*.geo.json' "$SRC/structures/" "$DST/structures/"

echo "同步完成：$DST"

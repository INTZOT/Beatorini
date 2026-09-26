#!/usr/bin/env bash
# 把仓库里的行为包同步进本地测试世界（改完代码后跑；建议先停服）
# 用法：tools/local-server/deploy-pack.sh [世界名]     默认 TestWorld
#       tools/local-server/deploy-pack.sh Prod413      同步到指定世界
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORLD="${1:-TestWorld}"
DST="$ROOT/.bds-test/bedrock_server/worlds/$WORLD/behavior_packs/Beatorini"

if [ ! -d "$(dirname "$DST")" ]; then
  echo "世界不存在：$(dirname "$DST")（见 tools/local-server/README.md 第一节）" >&2
  exit 1
fi

mkdir -p "$DST"
"$ROOT/sync-to-game.sh" "$DST"

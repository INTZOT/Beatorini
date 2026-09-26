#!/usr/bin/env bash
# 把仓库里的行为包同步进本地测试世界（改完代码后跑；建议先停服）
# 用法：tools/local-server/deploy-pack.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DST="$ROOT/.bds-test/bedrock_server/worlds/TestWorld/behavior_packs/Beatorini"

if [ ! -d "$(dirname "$DST")" ]; then
  echo "测试世界不存在：$DST（见 tools/local-server/README.md 第一节）" >&2
  exit 1
fi

mkdir -p "$DST"
"$ROOT/sync-to-game.sh" "$DST"

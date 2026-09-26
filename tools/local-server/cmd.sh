#!/usr/bin/env bash
# 给本地测试服发一条控制台命令（等价 tmux send-keys）
# 用法：tools/local-server/cmd.sh stop
#       tools/local-server/cmd.sh "execute in island:void_1 run setblock 0 64 0 stone"
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIFO="$ROOT/.bds-test/cmd.fifo"

if [ ! -p "$FIFO" ]; then
  echo "命令管道不存在：$FIFO（测试服没在跑？先 tools/local-server/run.sh）" >&2
  exit 1
fi
if [ "$#" -eq 0 ]; then
  echo "用法：cmd.sh <控制台命令>" >&2
  exit 1
fi

printf '%s\n' "$*" > "$FIFO"
echo "[harness] 已发送: $*"

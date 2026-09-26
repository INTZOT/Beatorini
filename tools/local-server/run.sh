#!/usr/bin/env bash
# 启动本地 BDS 测试服（纯 BDS；Endstone 见 README.md 第三节）
# 用法：tools/local-server/run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="$ROOT/.bds-test"

if [ ! -x "$APP/bedrock_server/bedrock_server" ]; then
  echo "测试实例不存在：$APP（见 tools/local-server/README.md 第一节）" >&2
  exit 1
fi

mkdir -p "$APP/logs"
cd "$APP"
rm -f cmd.fifo
mkfifo -m 666 cmd.fifo

echo "[harness] BDS 启动 → 日志 $APP/logs/server.log，命令用 tools/local-server/cmd.sh"
# 用 fd 3 长期持有 FIFO 写端，避免 BDS 读到 EOF 后退出
exec 3<>cmd.fifo
cd bedrock_server
exec ./bedrock_server < ../cmd.fifo 2>&1 | tee ../logs/server.log

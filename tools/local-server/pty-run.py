#!/usr/bin/env python3
"""给 Endstone/BDS 提供真 TTY 的看护进程（本机没装 tmux 时替代方案）。

用法: python3 pty-run.py <app_dir> <log_file> <cmd_fifo> [额外参数...]

- 在 <app_dir> 下执行 <app_dir>/.venv/bin/python -m endstone <额外参数>
- 子进程输出同时写入 log_file 与自己的 stdout（便于后台任务收集）
- 从 cmd_fifo 读取行并写入子进程 stdin（等价于 tmux send-keys）
"""
import os
import pty
import select
import signal
import sys

app_dir = sys.argv[1]
log_path = sys.argv[2]
fifo_path = sys.argv[3]
extra = sys.argv[4:]

os.makedirs(os.path.dirname(log_path) or ".", exist_ok=True)
fifo_dir = os.path.dirname(fifo_path)
if fifo_dir:
    os.makedirs(fifo_dir, exist_ok=True)
if not os.path.exists(fifo_path):
    os.mkfifo(fifo_path, 0o666)

pid, master = pty.fork()
if pid == 0:
    os.chdir(app_dir)
    python = os.path.join(app_dir, ".venv", "bin", "python")
    argv = [python, "-m", "endstone"] + extra
    os.execv(python, argv)

fifo_fd = os.open(fifo_path, os.O_RDWR | os.O_NONBLOCK)
log = open(log_path, "ab", buffering=0)
try:
    while True:
        readable, _, _ = select.select([master, fifo_fd], [], [], 1.0)
        if master in readable:
            try:
                data = os.read(master, 65536)
            except OSError:
                data = b""
            if not data:
                break
            log.write(data)
            sys.stdout.buffer.write(data)
            sys.stdout.buffer.flush()
        if fifo_fd in readable:
            chunk = os.read(fifo_fd, 4096)
            if chunk:
                for raw in chunk.split(b"\n"):
                    line = raw.strip()
                    if line:
                        os.write(master, line + b"\r")
finally:
    try:
        os.close(fifo_fd)
    except OSError:
        pass
    log.close()
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        pass
    try:
        os.waitpid(pid, 0)
    except OSError:
        pass
    print("[pty-run] 子进程已退出")

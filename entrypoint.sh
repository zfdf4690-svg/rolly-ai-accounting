#!/bin/sh
# Rolly AI 记账 — 单容器启动脚本
# 1) 后台启动 Python LLM 网关（8000）
# 2) 前台启动 NestJS 全栈（7860，Hugging Face Spaces 入口端口）
set -e

echo ">>> 启动 Python LLM 网关 (8000)"
cd /app/python-llm
python3 -m uvicorn server:app --host 0.0.0.0 --port 8000 &
LLM_PID=$!

echo ">>> 启动 NestJS 全栈 ($PORT)"
cd /app
export SERVER_PORT="${PORT:-7860}"
exec node dist/server/main.js

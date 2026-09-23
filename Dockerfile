# Rolly AI 记账 — 单容器全栈镜像（NestJS 全栈 + Python LLM 网关）
# 用于 Hugging Face Spaces（免费、无需绑卡）等 Docker 平台

# ---- 构建阶段：Node 22 ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:prod

# ---- 运行阶段：Node + Python3 双运行时 ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    FORCE_FRAMEWORK_DISABLE_DATAPASS=true \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=7860 \
    PYTHON_LLM_BASE_URL=http://127.0.0.1:8000

# 安装 Python3（运行 LLM 网关）
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

COPY python-llm ./python-llm
RUN pip3 install --no-cache-dir -r python-llm/requirements.txt

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Hugging Face Spaces 固定入口端口
EXPOSE 7860
CMD ["./entrypoint.sh"]

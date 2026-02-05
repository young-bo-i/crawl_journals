FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Asia/Shanghai

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# 复制 SQL 脚本目录（供 Node.js 迁移脚本读取）
COPY --from=builder /app/sql ./sql
# 复制自定义生产服务器（支持 WebSocket）
COPY --from=builder /app/server.prod.js ./server.prod.js

EXPOSE 3000

# 使用自定义服务器启动（支持 WebSocket）
CMD ["node", "server.prod.js"]

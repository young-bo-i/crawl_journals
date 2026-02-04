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

EXPOSE 3000

# 迁移会在应用启动时通过 mysql.ts 自动执行
CMD ["node", "server.js"]

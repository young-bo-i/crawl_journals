import { createServer, type IncomingMessage } from "http";
import { parse } from "url";
import next from "next";
import { getWsManager } from "./src/server/ws/manager";
import { runMigrations } from "./src/server/db/mysql";
import type { Duplex } from "stream";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // 启动时执行数据库迁移，确保所有错误都能暴露出来
  try {
    console.log("[Server] 启动时执行数据库迁移...");
    await runMigrations();
    console.log("[Server] 数据库迁移完成");
  } catch (err) {
    console.error("[Server] 数据库迁移失败:", err);
    process.exit(1); // 迁移失败则退出，避免服务在数据库异常状态下运行
  }
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // 初始化 WebSocket 管理器（不传 server，我们手动处理 upgrade）
  const wsManager = getWsManager();
  wsManager.initializeWithoutServer();

  // 获取 Next.js 的 upgrade handler（如果存在）
  const nextUpgrade = typeof (app as any).getUpgradeHandler === "function" 
    ? (app as any).getUpgradeHandler() 
    : null;

  // 手动处理 upgrade 事件，区分 Next.js HMR 和我们的 WebSocket
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = parse(req.url || "", true);
    
    if (pathname === "/ws") {
      // 我们的 WebSocket 连接
      wsManager.handleUpgrade(req, socket, head);
    } else if (nextUpgrade) {
      // Next.js HMR WebSocket (/_next/webpack-hmr)
      nextUpgrade(req, socket, head);
    } else {
      // 无法处理，销毁连接
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server on ws://${hostname}:${port}/ws`);
  });
});

import { createServer, type IncomingMessage } from "http";
import { parse } from "url";
import next from "next";
import { getWsManager } from "./src/server/ws/manager";
import type { Duplex } from "stream";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
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

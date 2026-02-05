const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");

const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

// WebSocket 管理
let wss = null;
const clients = new Map();
let clientIdCounter = 0;

function initWebSocket(server) {
  wss = new WebSocketServer({ noServer: true });
  console.log("[WsManager] WebSocket server started");

  wss.on("connection", (ws, req) => {
    const clientId = `client_${++clientIdCounter}`;
    const clientInfo = {
      id: clientId,
      ws,
      subscribedRunId: null,
    };
    clients.set(clientId, clientInfo);
    console.log(`[WsManager] Client connected: ${clientId}, total: ${clients.size}`);

    // 发送连接确认
    ws.send(JSON.stringify({ type: "connected", clientId }));

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(clientId, message);
      } catch (e) {
        console.error(`[WsManager] Failed to parse message from ${clientId}:`, e);
      }
    });

    ws.on("close", () => {
      clients.delete(clientId);
      console.log(`[WsManager] Client disconnected: ${clientId}, remaining: ${clients.size}`);
    });

    ws.on("error", (err) => {
      console.error(`[WsManager] Client error ${clientId}:`, err);
      clients.delete(clientId);
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url || "", true);
    
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      // 其他 upgrade 请求（如 Next.js 内部的），直接销毁
      socket.destroy();
    }
  });
}

function handleMessage(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;

  switch (message.type) {
    case "subscribe":
      client.subscribedRunId = message.runId ?? null;
      console.log(`[WsManager] Client ${clientId} subscribed to run: ${message.runId ?? "all"}`);
      break;
    case "unsubscribe":
      client.subscribedRunId = null;
      console.log(`[WsManager] Client ${clientId} unsubscribed`);
      break;
    case "ping":
      client.ws.send(JSON.stringify({ type: "pong" }));
      break;
    default:
      console.log(`[WsManager] Unknown message type from ${clientId}:`, message.type);
  }
}

// 导出广播函数供 CrawlManager 使用
function broadcastCrawlEvent(runId, event) {
  const message = JSON.stringify({ type: "crawl_event", event });
  
  for (const client of clients.values()) {
    if (client.subscribedRunId === runId || client.subscribedRunId === null) {
      if (client.ws.readyState === 1) { // WebSocket.OPEN
        client.ws.send(message);
      }
    }
  }
}

// 设置全局引用，供其他模块使用
global.__wsManager = {
  broadcastCrawlEvent,
  getClientCount: () => clients.size,
};

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  initWebSocket(server);

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server on ws://${hostname}:${port}/ws`);
  });
});

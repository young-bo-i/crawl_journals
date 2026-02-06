import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import type { CrawlEvent } from "../crawl/runner";

export type WsMessage =
  | { type: "connected"; clientId: string }
  | { type: "status"; data: any }
  | { type: "crawl_event"; event: CrawlEvent }
  | { type: "batch_cover_event"; event: any }
  | { type: "error"; message: string };

type ClientInfo = {
  id: string;
  ws: WebSocket;
  subscribedRunId: string | null;
};

const globalForWs = globalThis as unknown as { wsManager?: WebSocketManager };

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ClientInfo>();
  private clientIdCounter = 0;

  /**
   * 初始化 WebSocket 服务器（绑定到 HTTP Server）
   */
  initialize(server: Server, path: string = "/ws") {
    if (this.wss) {
      console.log("[WsManager] Already initialized");
      return;
    }

    this.wss = new WebSocketServer({ server, path });
    console.log(`[WsManager] WebSocket server started on path: ${path}`);

    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req);
    });
  }

  /**
   * 初始化 WebSocket 服务器（不绑定，手动处理 upgrade）
   */
  initializeWithoutServer() {
    if (this.wss) {
      console.log("[WsManager] Already initialized");
      return;
    }

    this.wss = new WebSocketServer({ noServer: true });
    console.log(`[WsManager] WebSocket server started (noServer mode)`);

    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req);
    });
  }

  /**
   * 手动处理 upgrade 请求
   */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    if (!this.wss) {
      console.error("[WsManager] WebSocket server not initialized");
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss!.emit("connection", ws, req);
    });
  }

  /**
   * 处理新的 WebSocket 连接
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage) {
    const clientId = `client_${++this.clientIdCounter}`;
    const clientInfo: ClientInfo = {
      id: clientId,
      ws,
      subscribedRunId: null,
    };
    this.clients.set(clientId, clientInfo);
    console.log(`[WsManager] Client connected: ${clientId}, total: ${this.clients.size}`);

    // 发送连接确认
    this.send(ws, { type: "connected", clientId });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(clientId, message);
      } catch (e) {
        console.error(`[WsManager] Failed to parse message from ${clientId}:`, e);
      }
    });

    ws.on("close", () => {
      this.clients.delete(clientId);
      console.log(`[WsManager] Client disconnected: ${clientId}, remaining: ${this.clients.size}`);
    });

    ws.on("error", (err) => {
      console.error(`[WsManager] Client error ${clientId}:`, err);
      this.clients.delete(clientId);
    });
  }

  /**
   * 处理客户端消息
   */
  private handleMessage(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case "subscribe":
        // 订阅特定任务的事件
        client.subscribedRunId = message.runId ?? null;
        console.log(`[WsManager] Client ${clientId} subscribed to run: ${message.runId ?? "all"}`);
        break;
      case "unsubscribe":
        client.subscribedRunId = null;
        console.log(`[WsManager] Client ${clientId} unsubscribed`);
        break;
      case "ping":
        this.send(client.ws, { type: "pong" } as any);
        break;
      default:
        console.log(`[WsManager] Unknown message type from ${clientId}:`, message.type);
    }
  }

  /**
   * 广播爬取事件给所有订阅的客户端
   */
  broadcastCrawlEvent(runId: string, event: CrawlEvent) {
    const message: WsMessage = { type: "crawl_event", event };
    const messageStr = JSON.stringify(message);

    for (const client of this.clients.values()) {
      // 只发送给订阅了该 runId 或订阅了所有事件的客户端
      if (client.subscribedRunId === runId || client.subscribedRunId === null) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(messageStr);
        }
      }
    }
  }

  /**
   * 发送状态更新给所有客户端
   */
  broadcastStatus(data: any) {
    const message: WsMessage = { type: "status", data };
    this.broadcast(message);
  }

  /**
   * 广播消息给所有连接的客户端
   */
  broadcast(message: WsMessage) {
    const messageStr = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(messageStr);
      }
    }
  }

  /**
   * 发送消息给特定客户端
   */
  private send(ws: WebSocket, message: WsMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * 获取连接数
   */
  getClientCount() {
    return this.clients.size;
  }
}

export function getWsManager(): WebSocketManager {
  if (!globalForWs.wsManager) {
    globalForWs.wsManager = new WebSocketManager();
  }
  return globalForWs.wsManager;
}

// 用于生产环境的全局广播函数
declare const global: typeof globalThis & {
  __wsManager?: {
    broadcastCrawlEvent: (runId: string, event: CrawlEvent) => void;
    getClientCount: () => number;
  };
};

/**
 * 广播爬取事件（兼容开发和生产环境）
 */
export function broadcastCrawlEvent(runId: string, event: CrawlEvent) {
  // 生产环境使用全局引用
  if (global.__wsManager) {
    global.__wsManager.broadcastCrawlEvent(runId, event);
    return;
  }
  
  // 开发环境使用 WebSocketManager 实例
  try {
    getWsManager().broadcastCrawlEvent(runId, event);
  } catch {
    // WebSocket 可能未初始化
  }
}

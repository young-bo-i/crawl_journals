import { getCrawlManager } from "@/server/crawl/manager";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  if (!runId) return new Response("runId required", { status: 400 });

  const emitter = getCrawlManager().getEmitter(runId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      send({ type: "hello", runId, at: new Date().toISOString() });

      if (!emitter) {
        send({ type: "end", runId, at: new Date().toISOString(), note: "run not active" });
        controller.close();
        return;
      }

      const onEvent = (e: unknown) => send(e);
      const onEnd = () => {
        send({ type: "end", runId, at: new Date().toISOString() });
        controller.close();
      };
      emitter.on("event", onEvent);
      emitter.once("end", onEnd);

      const keepalive = setInterval(() => {
        send({ type: "ping", at: new Date().toISOString() });
      }, 15_000);

      const cleanup = () => {
        clearInterval(keepalive);
        emitter.off("event", onEvent);
      };

      req.signal?.addEventListener?.("abort", () => {
        cleanup();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

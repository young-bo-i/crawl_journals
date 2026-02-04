import { z } from "zod";
import { getCrawlManager } from "@/server/crawl/manager";

export const runtime = "nodejs";

const schema = z.object({ runId: z.string().min(1) });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { runId } = schema.parse(body);
  await getCrawlManager().stop(runId);
  return Response.json({ ok: true });
}


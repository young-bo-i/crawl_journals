import { z } from "zod";
import { queryJcrList } from "@/server/db/jcr-db";

export const runtime = "nodejs";

const schema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  quartile: z.enum(["Q1", "Q2", "Q3", "Q4"]).optional(),
  sortBy: z.enum(["journal", "if_2024"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

/**
 * GET /api/jcr
 * 获取 JCR 影响因子列表
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const params = schema.parse(Object.fromEntries(url.searchParams.entries()));

    const result = await queryJcrList({
      page: params.page,
      pageSize: params.pageSize,
      q: params.q,
      quartile: params.quartile,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    });

    return Response.json({
      ok: true,
      total: result.total,
      page: params.page,
      pageSize: params.pageSize,
      rows: result.rows,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return Response.json(
        {
          ok: false,
          error: "Invalid parameters",
          details: err.issues,
        },
        { status: 400 }
      );
    }

    return Response.json(
      {
        ok: false,
        error: err?.message ?? "Internal server error",
      },
      { status: 500 }
    );
  }
}

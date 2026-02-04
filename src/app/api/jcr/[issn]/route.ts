import { getJcrByIssn, getFqbJcrByIssn } from "@/server/db/jcr-db";

export const runtime = "nodejs";

/**
 * GET /api/jcr/[issn]
 * 根据 ISSN 获取期刊的 JCR 和中科院分区数据
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ issn: string }> }
) {
  try {
    const { issn } = await params;

    if (!issn) {
      return Response.json(
        { ok: false, error: "ISSN is required" },
        { status: 400 }
      );
    }

    // 查询 JCR 数据
    const jcrData = await getJcrByIssn(issn);

    // 查询中科院分区数据
    const fqbData = await getFqbJcrByIssn(issn);

    return Response.json({
      ok: true,
      jcr: jcrData,
      fqb: fqbData,
    });
  } catch (err: any) {
    return Response.json(
      {
        ok: false,
        error: err?.message ?? "Internal server error",
      },
      { status: 500 }
    );
  }
}

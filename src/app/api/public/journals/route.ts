import { z } from "zod";
import { queryJournals, SortField, SortOrder } from "@/server/db/repo";

export const runtime = "nodejs";

const schema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  inDoaj: z.coerce.boolean().optional(),
  inNlm: z.coerce.boolean().optional(),
  hasWikidata: z.coerce.boolean().optional(),
  isOpenAccess: z.coerce.boolean().optional(),
  sortBy: z.enum(["id", "oa_display_name", "oa_host_organization", "oa_country_code", "oa_works_count", "oa_cited_by_count", "updated_at"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

/**
 * GET /api/public/journals
 * 
 * 公开 API 接口，返回期刊数据
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const params = schema.parse(Object.fromEntries(url.searchParams.entries()));

    const { total, rows } = await queryJournals({
      q: params.q ?? null,
      page: params.page,
      pageSize: params.pageSize,
      inDoaj: params.inDoaj,
      inNlm: params.inNlm,
      hasWikidata: params.hasWikidata,
      isOpenAccess: params.isOpenAccess,
      sortBy: params.sortBy as SortField | undefined,
      sortOrder: params.sortOrder as SortOrder | undefined,
    });

    const journalsData = rows.map((row) => ({
      id: row.id,
      issn_l: row.issn_l,
      issns: row.issns,
      // OpenAlex 基础数据
      title: row.oa_display_name,
      publisher: row.oa_host_organization,
      country: row.oa_country_code,
      homepage: row.oa_homepage_url,
      type: row.oa_type,
      // OpenAlex 其他数据
      works_count: row.oa_works_count,
      cited_by_count: row.oa_cited_by_count,
      is_open_access: row.oa_is_oa,
      in_doaj: row.oa_is_in_doaj,
      in_nlm: row.nlm_in_catalog,
      has_wikidata: row.wikidata_has_entity,
      updated_at: row.updated_at,
    }));

    const totalPages = Math.ceil(total / params.pageSize);

    return Response.json({
      ok: true,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages,
      },
      data: journalsData,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: "Invalid parameters", details: err.issues },
        { status: 400 }
      );
    }
    return Response.json(
      { ok: false, error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

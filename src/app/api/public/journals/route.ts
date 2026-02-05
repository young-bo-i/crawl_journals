import { z } from "zod";
import { queryJournals, getJournalDetail, SortField, SortOrder } from "@/server/db/repo";
import { getJcrByIssn, getFqbJcrByIssn, getJcrByTitle, getFqbJcrByTitle } from "@/server/db/jcr-db";

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
  include: z.enum(["basic", "with_jcr", "full"]).default("basic"),
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
    
    const includeJcr = params.include === "with_jcr" || params.include === "full";

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

    const journalsData = await Promise.all(
      rows.map(async (row) => {
        const baseData = {
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
        };
        
        if (!includeJcr) {
          return baseData;
        }
        
        // JCR 和中科院分区数据
        let jcrData: any[] = [];
        let fqbData: any[] = [];
        
        if (row.issn_l) {
          jcrData = await getJcrByIssn(row.issn_l);
          fqbData = await getFqbJcrByIssn(row.issn_l);
        } else if (row.oa_display_name) {
          jcrData = await getJcrByTitle(row.oa_display_name);
          fqbData = await getFqbJcrByTitle(row.oa_display_name);
        }
        
        const jcrFormatted = jcrData.map((data: any) => ({
          year: data.year || 2024,
          journal: data.journal,
          issn: data.issn,
          eissn: data.eissn,
          category: data.category,
          impact_factor: data.if_2024,
          quartile: data.if_quartile_2024,
          rank: data.if_rank_2024,
        }));

        const fqbFormatted = fqbData.map((data) => ({
          year: data.year,
          journal: data.journal,
          issn: data.issn,
          major_category: data.major_category,
          major_partition: data.major_partition,
          is_top_journal: data.is_top === "是",
        }));

        return {
          ...baseData,
          jcr: jcrFormatted,
          cas_partition: fqbFormatted,
        };
      })
    );

    const totalPages = Math.ceil(total / params.pageSize);

    return Response.json({
      ok: true,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages,
      },
      include: params.include,
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

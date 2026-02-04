import { z } from "zod";
import { queryJournals, getJournalDetail, SortField, SortOrder } from "@/server/db/repo";

export const runtime = "nodejs";

const schema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  inDoaj: z.coerce.boolean().optional(),
  inNlm: z.coerce.boolean().optional(),
  hasWikidata: z.coerce.boolean().optional(),
  isOpenAccess: z.coerce.boolean().optional(),
  sortBy: z.enum(["id", "title", "publisher", "country", "oa_works_count", "oa_cited_by_count", "updated_at"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = schema.parse(Object.fromEntries(url.searchParams.entries()));

  const { rows } = await queryJournals({
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
      const detail = await getJournalDetail(row.id);
      
      return {
        id: row.id,
        issn_l: row.issn_l,
        issns: row.issns,
        title: row.title,
        publisher: row.publisher,
        country: row.country,
        languages: row.languages,
        subjects: row.subjects,
        is_open_access: row.is_open_access,
        homepage: row.homepage,
        works_count: row.oa_works_count,
        cited_by_count: row.oa_cited_by_count,
        in_doaj: row.oa_is_in_doaj,
        in_nlm: row.nlm_in_catalog,
        has_wikidata: row.wikidata_has_entity,
        field_sources: row.field_sources,
        updated_at: row.updated_at,
        aliases: detail?.aliases ?? [],
        fetch_status: detail?.fetchStatus ?? [],
      };
    })
  );

  const exportData = {
    export_info: {
      export_time: new Date().toISOString(),
      page: params.page,
      page_size: params.pageSize,
      total_journals: journalsData.length,
      filters: {
        q: params.q || null,
        inDoaj: params.inDoaj ?? null,
        inNlm: params.inNlm ?? null,
        hasWikidata: params.hasWikidata ?? null,
        isOpenAccess: params.isOpenAccess ?? null,
        sortBy: params.sortBy || null,
        sortOrder: params.sortOrder || null,
      },
    },
    journals: journalsData,
  };

  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="journals_page_${params.page}.json"`,
    },
  });
}

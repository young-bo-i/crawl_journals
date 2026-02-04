import ExcelJS from "exceljs";
import { z } from "zod";
import { fieldDict } from "@/shared/fields";
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

const SOURCE_NAMES = [
  { key: "openalex", label: "OpenAlex" },
  { key: "crossref", label: "Crossref" },
  { key: "doaj", label: "DOAJ" },
  { key: "nlm", label: "NLM" },
  { key: "wikidata", label: "Wikidata" },
] as const;

function formatBool(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  return v ? "是" : "否";
}

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

  // 获取详细信息
  const rowsWithDetails = await Promise.all(
    rows.map(async (row) => {
      const detail = await getJournalDetail(row.id);
      return { ...row, detail };
    })
  );

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("期刊数据");

  const columns = [
    { header: "OpenAlex ID", key: "id", width: 16 },
    { header: "ISSN-L", key: "issn_l", width: 12 },
    { header: "期刊标题", key: "title", width: 40 },
    { header: "标题来源", key: "title_source", width: 15 },
    { header: "出版社", key: "publisher", width: 28 },
    { header: "出版社来源", key: "publisher_source", width: 15 },
    { header: "国家/地区", key: "country", width: 12 },
    { header: "语种", key: "languages", width: 20 },
    { header: "学科/主题", key: "subjects", width: 30 },
    { header: "是否OA", key: "is_open_access", width: 10 },
    { header: "是否被DOAJ收录", key: "oa_is_in_doaj", width: 15 },
    { header: "是否在NLM Catalog", key: "nlm_in_catalog", width: 18 },
    { header: "是否有Wikidata", key: "wikidata_has_entity", width: 15 },
    { header: "主页/官网", key: "homepage", width: 30 },
    { header: "作品数", key: "oa_works_count", width: 10 },
    { header: "被引数", key: "oa_cited_by_count", width: 10 },
    { header: "更新时间", key: "updated_at", width: 22 },
  ];

  // 为每个来源添加状态列
  for (const source of SOURCE_NAMES) {
    columns.push({ header: `${source.label}_状态`, key: `${source.key}_status`, width: 12 });
  }

  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };

  for (const row of rowsWithDetails) {
    const fieldSources = row.field_sources ?? {};

    const rowData: Record<string, any> = {
      id: row.id,
      issn_l: row.issn_l ?? "",
      title: row.title ?? "",
      title_source: fieldSources.title ?? "",
      publisher: row.publisher ?? "",
      publisher_source: fieldSources.publisher ?? "",
      country: row.country ?? "",
      languages: (row.languages ?? []).join("; "),
      subjects: (row.subjects ?? []).join("; "),
      is_open_access: formatBool(row.is_open_access),
      oa_is_in_doaj: formatBool(row.oa_is_in_doaj),
      nlm_in_catalog: formatBool(row.nlm_in_catalog),
      wikidata_has_entity: formatBool(row.wikidata_has_entity),
      homepage: row.homepage ?? "",
      oa_works_count: row.oa_works_count ?? "",
      oa_cited_by_count: row.oa_cited_by_count ?? "",
      updated_at: row.updated_at,
    };

    // 填充来源状态
    for (const source of SOURCE_NAMES) {
      const fetchStatus = row.detail?.fetchStatus?.find((s: any) => s.source === source.key);
      rowData[`${source.key}_status`] = fetchStatus?.status ?? "无数据";
    }

    sheet.addRow(rowData);
  }

  // 字段说明工作表
  const dict = wb.addWorksheet("字段说明");
  dict.columns = [
    { header: "字段Key", key: "key", width: 22 },
    { header: "中文名称", key: "label", width: 20 },
    { header: "说明", key: "desc", width: 60 },
  ];
  for (const f of fieldDict) dict.addRow(f);
  dict.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="journals_page_${params.page}.xlsx"`,
    },
  });
}

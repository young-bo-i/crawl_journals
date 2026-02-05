import { z } from "zod";
import { queryJournals, SortField, SortOrder } from "@/server/db/repo";
import { SORTABLE_COLUMNS } from "@/shared/journal-columns";

export const runtime = "nodejs";

// 动态生成可排序字段的枚举
const sortableKeys = SORTABLE_COLUMNS.map(c => c.key) as [string, ...string[]];

const schema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  // 布尔筛选
  inDoaj: z.coerce.boolean().optional(),
  inNlm: z.coerce.boolean().optional(),
  hasWikidata: z.coerce.boolean().optional(),
  hasWikipedia: z.coerce.boolean().optional(),
  isOpenAccess: z.coerce.boolean().optional(),
  isCore: z.coerce.boolean().optional(),
  isOa: z.coerce.boolean().optional(),
  inScielo: z.coerce.boolean().optional(),
  isOjs: z.coerce.boolean().optional(),
  doajBoai: z.coerce.boolean().optional(),
  inScimago: z.coerce.boolean().optional(),
  // 字符串筛选
  country: z.string().optional(),
  oaType: z.string().optional(),
  // 数值范围筛选
  minWorksCount: z.coerce.number().optional(),
  maxWorksCount: z.coerce.number().optional(),
  minCitedByCount: z.coerce.number().optional(),
  maxCitedByCount: z.coerce.number().optional(),
  minFirstYear: z.coerce.number().optional(),
  maxFirstYear: z.coerce.number().optional(),
  // 排序
  sortBy: z.enum(sortableKeys).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  // 要返回的字段（逗号分隔）
  fields: z.string().optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = schema.parse(Object.fromEntries(url.searchParams.entries()));
  
  // 解析要返回的字段
  const fields = params.fields ? params.fields.split(",").filter(Boolean) : undefined;
  
  const { total, rows } = await queryJournals({
    q: params.q ?? null,
    page: params.page,
    pageSize: params.pageSize,
    // 布尔筛选
    inDoaj: params.inDoaj,
    inNlm: params.inNlm,
    hasWikidata: params.hasWikidata,
    hasWikipedia: params.hasWikipedia,
    isOpenAccess: params.isOpenAccess,
    isCore: params.isCore,
    isOa: params.isOa,
    inScielo: params.inScielo,
    isOjs: params.isOjs,
    doajBoai: params.doajBoai,
    inScimago: params.inScimago,
    // 字符串筛选
    country: params.country,
    oaType: params.oaType,
    // 数值范围筛选
    minWorksCount: params.minWorksCount,
    maxWorksCount: params.maxWorksCount,
    minCitedByCount: params.minCitedByCount,
    maxCitedByCount: params.maxCitedByCount,
    minFirstYear: params.minFirstYear,
    maxFirstYear: params.maxFirstYear,
    // 排序
    sortBy: params.sortBy as SortField | undefined,
    sortOrder: params.sortOrder as SortOrder | undefined,
    // 字段选择
    fields,
  });
  
  return Response.json({ total, rows });
}

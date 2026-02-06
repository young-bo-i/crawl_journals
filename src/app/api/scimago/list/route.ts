/**
 * SCImago 数据列表查询 API
 * GET /api/scimago/list
 * 
 * 参数:
 * - page: 页码 (默认 1)
 * - limit: 每页条数 (默认 20, 最大 100)
 * - year: 年份筛选
 * - quartile: 分区筛选 (Q1/Q2/Q3/Q4)
 * - q: 搜索关键词 (期刊名称)
 * - sort: 排序字段 (rank/sjr/h_index)
 * - order: 排序方向 (asc/desc)
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/mysql";
import type { RowDataPacket } from "mysql2";

export type ScimagoListItem = {
  sourceid: number;
  year: number;
  rank: number | null;
  title: string;
  type: string;
  issns: string[];
  publisher: string;
  is_open_access: boolean;
  is_diamond_oa: boolean;
  sjr: number | null;
  sjr_quartile: string | null;
  h_index: number | null;
  total_docs: number | null;
  total_docs_3years: number | null;
  total_refs: number | null;
  total_citations_3years: number | null;
  citable_docs_3years: number | null;
  citations_per_doc_2years: number | null;
  refs_per_doc: number | null;
  female_percent: number | null;
  overton: number | null;
  sdg: number | null;
  country: string;
  region: string;
  coverage: string;
  categories: string;
  areas: string;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const year = searchParams.get("year");
    const quartile = searchParams.get("quartile");
    const q = searchParams.get("q");
    const sort = searchParams.get("sort") || "rank";
    const order = searchParams.get("order") || "asc";
    
    const offset = (page - 1) * limit;
    
    // 构建查询条件
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (year) {
      conditions.push("year = ?");
      params.push(parseInt(year, 10));
    }
    
    if (quartile) {
      conditions.push("sjr_quartile = ?");
      params.push(quartile.toUpperCase());
    }
    
    if (q) {
      // 判断是否是 ISSN 格式 (如 1234-5678 或 12345678)
      const issnPattern = /^\d{4}-?\d{3}[\dXx]$/;
      if (issnPattern.test(q.trim())) {
        // 标准化 ISSN 格式
        let issn = q.trim().toUpperCase().replace(/-/g, "");
        if (issn.length === 8) {
          issn = `${issn.slice(0, 4)}-${issn.slice(4)}`;
        }
        // 通过 scimago_issn_index 表查询
        conditions.push("EXISTS (SELECT 1 FROM scimago_issn_index sii WHERE sii.sourceid = scimago_rankings.sourceid AND sii.year = scimago_rankings.year AND sii.issn = ?)");
        params.push(issn);
      } else {
        // 按期刊名称搜索（使用 FULLTEXT 索引，比 LIKE '%x%' 快得多）
        const phraseQuery = `"${q.replace(/"/g, '')}"`;
        conditions.push("MATCH(title) AGAINST(? IN BOOLEAN MODE)");
        params.push(phraseQuery);
      }
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    
    // 验证排序字段
    const validSortFields = ["rank", "sjr", "h_index", "year", "title"];
    const sortField = validSortFields.includes(sort) ? (sort === "rank" ? "`rank`" : sort) : "`rank`";
    const sortOrder = order.toLowerCase() === "desc" ? "DESC" : "ASC";
    
    const pool = await getDb();
    
    // 查询总数
    const [countResult] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM scimago_rankings ${whereClause}`,
      params
    );
    const total = countResult[0]?.total ?? 0;
    
    // 查询数据 (LIMIT 和 OFFSET 直接拼接，因为它们已经是数字)
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        sourceid, year, \`rank\`, title, type, issns, publisher,
        is_open_access, is_diamond_oa, sjr, sjr_quartile, h_index,
        total_docs, total_docs_3years, total_refs, total_citations_3years,
        citable_docs_3years, citations_per_doc_2years, refs_per_doc,
        female_percent, overton, sdg, country, region, coverage, categories, areas
       FROM scimago_rankings 
       ${whereClause}
       ORDER BY ${sortField} ${sortOrder}
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    
    // 解析 JSON 字段
    const data: ScimagoListItem[] = rows.map((row: any) => ({
      sourceid: row.sourceid,
      year: row.year,
      rank: row.rank,
      title: row.title,
      type: row.type,
      issns: typeof row.issns === "string" ? JSON.parse(row.issns) : (row.issns || []),
      publisher: row.publisher,
      is_open_access: Boolean(row.is_open_access),
      is_diamond_oa: Boolean(row.is_diamond_oa),
      sjr: row.sjr ? parseFloat(row.sjr) : null,
      sjr_quartile: row.sjr_quartile,
      h_index: row.h_index,
      total_docs: row.total_docs,
      total_docs_3years: row.total_docs_3years,
      total_refs: row.total_refs,
      total_citations_3years: row.total_citations_3years,
      citable_docs_3years: row.citable_docs_3years,
      citations_per_doc_2years: row.citations_per_doc_2years ? parseFloat(row.citations_per_doc_2years) : null,
      refs_per_doc: row.refs_per_doc ? parseFloat(row.refs_per_doc) : null,
      female_percent: row.female_percent ? parseFloat(row.female_percent) : null,
      overton: row.overton,
      sdg: row.sdg,
      country: row.country,
      region: row.region,
      coverage: row.coverage,
      categories: row.categories,
      areas: row.areas,
    }));
    
    return NextResponse.json({
      success: true,
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e: any) {
    console.error("[SCImago List] 查询失败:", e);
    return NextResponse.json(
      { error: e.message ?? "查询失败" },
      { status: 500 }
    );
  }
}

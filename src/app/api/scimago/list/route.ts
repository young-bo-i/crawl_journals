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
  sjr: number | null;
  sjr_quartile: string | null;
  h_index: number | null;
  country: string;
  categories: string;
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
      conditions.push("title LIKE ?");
      params.push(`%${q}%`);
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
        is_open_access, sjr, sjr_quartile, h_index, country, categories
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
      sjr: row.sjr ? parseFloat(row.sjr) : null,
      sjr_quartile: row.sjr_quartile,
      h_index: row.h_index,
      country: row.country,
      categories: row.categories,
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

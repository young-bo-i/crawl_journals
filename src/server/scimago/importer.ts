/**
 * SCImago 数据导入器
 * 解析 CSV 文件并批量导入到数据库
 */

import { getDb } from "@/server/db/mysql";
import type { ResultSetHeader } from "mysql2";

// CSV 列定义（与 SCImago 导出格式对应）
const CSV_COLUMNS = [
  "Rank",
  "Sourceid",
  "Title",
  "Type",
  "Issn",
  "Publisher",
  "Open Access",
  "Open Access Diamond",
  "SJR",
  "SJR Best Quartile",
  "H index",
  "Total Docs", // 年份会动态变化，如 "Total Docs. (2024)"
  "Total Docs. (3years)",
  "Total Refs.",
  "Total Citations (3years)",
  "Citable Docs. (3years)",
  "Citations / Doc. (2years)",
  "Ref. / Doc.",
  "%Female",
  "Overton",
  "SDG",
  "Country",
  "Region",
  "Publisher2", // 重复的 Publisher 列
  "Coverage",
  "Categories",
  "Areas",
] as const;

export type ScimagoRow = {
  sourceid: number;
  year: number;
  rank: number | null;
  title: string;
  type: string;
  issns: string[]; // 解析后的 ISSN 数组
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

export type ImportResult = {
  year: number;
  totalRows: number;
  inserted: number;
  updated: number;
  errors: number;
  errorMessages: string[];
};

/**
 * 解析欧洲格式的小数（逗号作为小数点）
 * "145,004" → 145.004
 */
function parseEuropeanNumber(value: string): number | null {
  if (!value || value.trim() === "") return null;
  // 移除引号，将逗号替换为点
  const cleaned = value.replace(/"/g, "").replace(",", ".").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * 解析整数
 */
function parseInteger(value: string): number | null {
  if (!value || value.trim() === "") return null;
  const cleaned = value.replace(/"/g, "").trim();
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

/**
 * 解析布尔值
 * "Yes" / "No" → true / false
 */
function parseBoolean(value: string): boolean {
  const cleaned = value.replace(/"/g, "").trim().toLowerCase();
  return cleaned === "yes";
}

/**
 * 解析 ISSN 字符串
 * "15424863, 00079235" → ["1542-4863", "0007-9235"]
 */
function parseIssns(value: string): string[] {
  if (!value || value.trim() === "" || value === '""') return [];
  
  // 移除外层引号
  const cleaned = value.replace(/^"|"$/g, "").trim();
  if (!cleaned) return [];
  
  // 分割并标准化每个 ISSN
  return cleaned.split(",").map(issn => {
    const raw = issn.trim();
    // 如果已经有连字符，直接返回
    if (raw.includes("-")) return raw.toUpperCase();
    // 否则添加连字符（ISSN 格式：1234-5678）
    if (raw.length === 8) {
      return `${raw.slice(0, 4)}-${raw.slice(4)}`.toUpperCase();
    }
    return raw.toUpperCase();
  }).filter(issn => issn.length > 0);
}

/**
 * 解析 CSV 行（处理引号内的分号和嵌套引号）
 * 
 * 处理边缘情况：
 * - 正常引号: "value" → value
 * - 嵌套引号: "Wei sheng yan jiu" bian ji bu" → Wei sheng yan jiu" bian ji bu
 *   (引号只有在后面紧跟分隔符 ; 或行尾时才认为是字段结束)
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = i < line.length - 1 ? line[i + 1] : null;
    
    if (char === '"') {
      if (!inQuotes) {
        // 开始引号
        inQuotes = true;
        current += char;
      } else {
        // 在引号内遇到引号
        // 只有当后面是分隔符 ; 或行尾时，才认为引号结束
        if (nextChar === ';' || nextChar === null) {
          inQuotes = false;
          current += char;
        } else if (nextChar === '"') {
          // 转义的引号 "" → "
          current += char;
          i++; // 跳过下一个引号
        } else {
          // 嵌套的引号（格式错误的 CSV），保留并继续
          current += char;
        }
      }
    } else if (char === ";" && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

/**
 * 清理字符串值（移除引号）
 */
function cleanString(value: string): string {
  return value.replace(/^"|"$/g, "").trim();
}

/**
 * 解析单行 CSV 数据
 */
function parseRow(fields: string[], year: number): ScimagoRow | null {
  if (fields.length < 27) {
    return null;
  }
  
  const sourceid = parseInteger(fields[1]);
  if (!sourceid) return null;
  
  return {
    sourceid,
    year,
    rank: parseInteger(fields[0]),
    title: cleanString(fields[2]),
    type: cleanString(fields[3]),
    issns: parseIssns(fields[4]),
    publisher: cleanString(fields[5]),
    is_open_access: parseBoolean(fields[6]),
    is_diamond_oa: parseBoolean(fields[7]),
    sjr: parseEuropeanNumber(fields[8]),
    sjr_quartile: cleanString(fields[9]) || null,
    h_index: parseInteger(fields[10]),
    total_docs: parseInteger(fields[11]),
    total_docs_3years: parseInteger(fields[12]),
    total_refs: parseInteger(fields[13]),
    total_citations_3years: parseInteger(fields[14]),
    citable_docs_3years: parseInteger(fields[15]),
    citations_per_doc_2years: parseEuropeanNumber(fields[16]),
    refs_per_doc: parseEuropeanNumber(fields[17]),
    female_percent: parseEuropeanNumber(fields[18]),
    overton: parseInteger(fields[19]),
    sdg: parseInteger(fields[20]),
    country: cleanString(fields[21]),
    region: cleanString(fields[22]),
    // fields[23] 是重复的 Publisher，跳过
    coverage: cleanString(fields[24]),
    categories: cleanString(fields[25]),
    areas: cleanString(fields[26]),
  };
}

/**
 * 从文件名提取年份
 * "scimagojr 2024.csv" → 2024
 */
export function extractYearFromFilename(filename: string): number | null {
  const match = filename.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 批量导入数据到数据库
 */
async function batchInsert(rows: ScimagoRow[], batchSize: number = 500): Promise<{ inserted: number; updated: number }> {
  const pool = await getDb();
  let inserted = 0;
  let updated = 0;
  
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    
    // 构建批量 INSERT 语句 (27 个字段)
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    
    const values: any[] = [];
    for (const row of batch) {
      values.push(
        row.sourceid,
        row.year,
        row.rank,
        row.title,
        row.type,
        JSON.stringify(row.issns),
        row.publisher,
        row.is_open_access,
        row.is_diamond_oa,
        row.sjr,
        row.sjr_quartile,
        row.h_index,
        row.total_docs,
        row.total_docs_3years,
        row.total_refs,
        row.total_citations_3years,
        row.citable_docs_3years,
        row.citations_per_doc_2years,
        row.refs_per_doc,
        row.female_percent,
        row.overton,
        row.sdg,
        row.country,
        row.region,
        row.coverage,
        row.categories,
        row.areas
      );
    }
    
    const sql = `
      INSERT INTO scimago_rankings (
        sourceid, year, \`rank\`, title, type, issns, publisher,
        is_open_access, is_diamond_oa, sjr, sjr_quartile, h_index,
        total_docs, total_docs_3years, total_refs, total_citations_3years,
        citable_docs_3years, citations_per_doc_2years, refs_per_doc,
        female_percent, overton, sdg, country, region, coverage, categories, areas
      ) VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        \`rank\` = VALUES(\`rank\`),
        title = VALUES(title),
        type = VALUES(type),
        issns = VALUES(issns),
        publisher = VALUES(publisher),
        is_open_access = VALUES(is_open_access),
        is_diamond_oa = VALUES(is_diamond_oa),
        sjr = VALUES(sjr),
        sjr_quartile = VALUES(sjr_quartile),
        h_index = VALUES(h_index),
        total_docs = VALUES(total_docs),
        total_docs_3years = VALUES(total_docs_3years),
        total_refs = VALUES(total_refs),
        total_citations_3years = VALUES(total_citations_3years),
        citable_docs_3years = VALUES(citable_docs_3years),
        citations_per_doc_2years = VALUES(citations_per_doc_2years),
        refs_per_doc = VALUES(refs_per_doc),
        female_percent = VALUES(female_percent),
        overton = VALUES(overton),
        sdg = VALUES(sdg),
        country = VALUES(country),
        region = VALUES(region),
        coverage = VALUES(coverage),
        categories = VALUES(categories),
        areas = VALUES(areas)
    `;
    
    const [result] = await pool.execute<ResultSetHeader>(sql, values);
    
    // affectedRows = inserted + updated*2 (MySQL 特性)
    // 如果是新插入，affectedRows = 1
    // 如果是更新，affectedRows = 2
    const batchInserted = result.affectedRows - (batch.length - Math.floor(result.affectedRows / 2));
    inserted += Math.max(0, result.affectedRows - batch.length);
    updated += batch.length - Math.max(0, result.affectedRows - batch.length);
  }
  
  return { inserted, updated };
}

/**
 * 更新 ISSN 索引表
 */
async function updateIssnIndex(rows: ScimagoRow[]): Promise<void> {
  const pool = await getDb();
  
  // 收集所有 ISSN 映射
  const issnMappings: Array<{ issn: string; sourceid: number; year: number }> = [];
  
  for (const row of rows) {
    for (const issn of row.issns) {
      if (issn && issn.length >= 8) {
        issnMappings.push({
          issn: issn.substring(0, 9), // 确保不超过 9 字符
          sourceid: row.sourceid,
          year: row.year,
        });
      }
    }
  }
  
  if (issnMappings.length === 0) return;
  
  // 批量插入 ISSN 索引
  const batchSize = 1000;
  for (let i = 0; i < issnMappings.length; i += batchSize) {
    const batch = issnMappings.slice(i, i + batchSize);
    const placeholders = batch.map(() => "(?, ?, ?)").join(", ");
    const values = batch.flatMap(m => [m.issn, m.sourceid, m.year]);
    
    await pool.execute(
      `INSERT IGNORE INTO scimago_issn_index (issn, sourceid, year) VALUES ${placeholders}`,
      values
    );
  }
}

/**
 * 导入单个 CSV 文件
 */
export async function importScimagoFile(
  content: string,
  filename: string,
  onProgress?: (progress: { current: number; total: number; phase: string }) => void
): Promise<ImportResult> {
  const year = extractYearFromFilename(filename);
  if (!year) {
    throw new Error(`无法从文件名提取年份: ${filename}`);
  }
  
  const lines = content.split("\n").filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error(`文件为空或格式错误: ${filename}`);
  }
  
  // 跳过标题行
  const dataLines = lines.slice(1);
  const totalRows = dataLines.length;
  
  const rows: ScimagoRow[] = [];
  const errorMessages: string[] = [];
  let errors = 0;
  
  // 解析阶段
  onProgress?.({ current: 0, total: totalRows, phase: "parsing" });
  
  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    try {
      const fields = parseCSVLine(line);
      const row = parseRow(fields, year);
      if (row) {
        rows.push(row);
      } else {
        errors++;
        if (errorMessages.length < 10) {
          errorMessages.push(`行 ${i + 2}: 解析失败`);
        }
      }
    } catch (e: any) {
      errors++;
      if (errorMessages.length < 10) {
        errorMessages.push(`行 ${i + 2}: ${e.message}`);
      }
    }
    
    if (i % 1000 === 0) {
      onProgress?.({ current: i, total: totalRows, phase: "parsing" });
    }
  }
  
  // 写入阶段
  onProgress?.({ current: 0, total: rows.length, phase: "inserting" });
  
  const { inserted, updated } = await batchInsert(rows);
  
  // 更新 ISSN 索引
  onProgress?.({ current: rows.length, total: rows.length, phase: "indexing" });
  await updateIssnIndex(rows);
  
  return {
    year,
    totalRows,
    inserted,
    updated,
    errors,
    errorMessages,
  };
}

/**
 * 获取已导入的年份统计
 */
export async function getScimagoStats(): Promise<Array<{ year: number; count: number }>> {
  const pool = await getDb();
  const [rows] = await pool.execute<any[]>(
    `SELECT year, COUNT(*) as count FROM scimago_rankings GROUP BY year ORDER BY year DESC`
  );
  return rows.map((r: any) => ({ year: r.year, count: r.count }));
}

/**
 * 获取 SCImago 总记录数
 */
export async function getScimagoTotalCount(): Promise<number> {
  const pool = await getDb();
  const [rows] = await pool.execute<any[]>(
    `SELECT COUNT(*) as total FROM scimago_rankings`
  );
  return rows[0]?.total ?? 0;
}

/**
 * 删除所有 SCImago 数据
 */
export async function deleteScimagoData(): Promise<{ deleted: number; indexDeleted: number }> {
  const pool = await getDb();
  
  // 先删除索引表（有外键约束）
  const [indexResult] = await pool.execute<ResultSetHeader>(
    `DELETE FROM scimago_issn_index`
  );
  
  // 再删除主表
  const [mainResult] = await pool.execute<ResultSetHeader>(
    `DELETE FROM scimago_rankings`
  );
  
  console.log(`[SCImago Delete] 已删除 ${mainResult.affectedRows} 条排名数据, ${indexResult.affectedRows} 条索引数据`);
  
  return {
    deleted: mainResult.affectedRows,
    indexDeleted: indexResult.affectedRows,
  };
}

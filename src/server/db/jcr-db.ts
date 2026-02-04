import path from "node:path";
import { open, type Database } from "sqlite";
import sqlite3 from "sqlite3";

let jcrDb: Database | null = null;

/**
 * 获取 JCR 数据库连接
 */
export async function getJcrDb(): Promise<Database> {
  if (jcrDb) return jcrDb;

  const dbPath = path.join(process.cwd(), "data", "jcr.db");
  jcrDb = await open({
    filename: dbPath,
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READONLY,
  });

  console.log(`[JCR DB] Connected to ${dbPath}`);
  return jcrDb;
}

/**
 * JCR 影响因子记录类型
 */
export type JcrRecord = {
  journal: string;
  issn: string | null;
  eissn: string | null;
  category: string | null;
  if_2024: number | string | null;  // 可能是数字或文本如 "<0.1"
  if_quartile_2024: string | null;
  if_rank_2024: string | null;
};

/**
 * 中科院分区记录类型
 */
export type FqbJcrRecord = {
  journal: string;
  year: number;
  issn: string | null;
  review: string | null;
  open_access: string | null;
  web_of_science: string | null;
  major_category: string | null;
  major_partition: string | null;
  is_top: string | null;
  minor_category_1: string | null;
  minor_partition_1: string | null;
  minor_category_2: string | null;
  minor_partition_2: string | null;
  minor_category_3: string | null;
  minor_partition_3: string | null;
  minor_category_4: string | null;
  minor_partition_4: string | null;
  minor_category_5: string | null;
  minor_partition_5: string | null;
  minor_category_6: string | null;
  minor_partition_6: string | null;
};

/**
 * 查询 JCR 影响因子列表
 */
export async function queryJcrList(args: {
  page: number;
  pageSize: number;
  q?: string | null;
  quartile?: string | null;
  sortBy?: "journal" | "if_2024";
  sortOrder?: "asc" | "desc";
}): Promise<{ total: number; rows: JcrRecord[] }> {
  const db = await getJcrDb();
  
  let whereConditions: string[] = [];
  const params: any[] = [];

  if (args.q) {
    whereConditions.push(`(Journal LIKE ? OR ISSN LIKE ? OR eISSN LIKE ?)`);
    const searchTerm = `%${args.q}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (args.quartile) {
    whereConditions.push(`"IF Quartile(2024)" = ?`);
    params.push(args.quartile);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  // 统计总数
  const countSql = `SELECT COUNT(*) as count FROM JCR2024 ${whereClause}`;
  const countResult = await db.get<{ count: number }>(countSql, ...params);
  const total = countResult?.count ?? 0;

  // 查询分页数据
  const sortColumn = args.sortBy === "if_2024" ? `"IF(2024)"` : "Journal";
  const sortOrder = args.sortOrder === "asc" ? "ASC" : "DESC";
  const offset = (args.page - 1) * args.pageSize;

  const dataSql = `
    SELECT 
      Journal as journal,
      ISSN as issn,
      eISSN as eissn,
      Category as category,
      "IF(2024)" as if_2024,
      "IF Quartile(2024)" as if_quartile_2024,
      "IF Rank(2024)" as if_rank_2024
    FROM JCR2024
    ${whereClause}
    ORDER BY ${sortColumn} ${sortOrder}
    LIMIT ? OFFSET ?
  `;

  const rows = await db.all<JcrRecord[]>(dataSql, ...params, args.pageSize, offset);

  return { total, rows };
}

/**
 * 根据 ISSN 查询期刊的所有年份 JCR 数据
 */
export async function getJcrByIssn(issn: string): Promise<JcrRecord[]> {
  const db = await getJcrDb();
  
  const results: JcrRecord[] = [];
  
  // 查询 JCR2024（有 ISSN, eISSN, Category, Rank）
  const sql2024 = `
    SELECT 
      Journal as journal,
      ISSN as issn,
      eISSN as eissn,
      Category as category,
      "IF(2024)" as if_2024,
      "IF Quartile(2024)" as if_quartile_2024,
      "IF Rank(2024)" as if_rank_2024,
      2024 as year
    FROM JCR2024
    WHERE ISSN = ? OR eISSN = ?
    LIMIT 1
  `;
  const result2024 = await db.get<JcrRecord & { year: number }>(sql2024, issn, issn);
  if (result2024) results.push(result2024);
  
  // 查询 JCR2023（有 ISSN, eISSN, Category, Rank）
  const sql2023 = `
    SELECT 
      Journal as journal,
      ISSN as issn,
      EISSN as eissn,
      Category as category,
      "IF(2023)" as if_2024,
      "IF Quartile(2023)" as if_quartile_2024,
      "Category Rank(2023)" as if_rank_2024,
      2023 as year
    FROM JCR2023
    WHERE ISSN = ? OR EISSN = ?
    LIMIT 1
  `;
  const result2023 = await db.get<JcrRecord & { year: number }>(sql2023, issn, issn);
  if (result2023) results.push(result2023);
  
  // 如果没有找到任何记录，就不继续查询
  if (results.length === 0) return results;
  
  const journalName = result2024?.journal || result2023?.journal;
  if (!journalName) return results;
  
  // 查询 JCR2022（只有 Journal, IF, Quartile）
  const sql2022 = `
    SELECT 
      Journal as journal,
      NULL as issn,
      NULL as eissn,
      NULL as category,
      "IF(2022)" as if_2024,
      "IF Quartile(2022)" as if_quartile_2024,
      NULL as if_rank_2024,
      2022 as year
    FROM JCR2022
    WHERE Journal = ?
    LIMIT 1
  `;
  const result2022 = await db.get<JcrRecord & { year: number }>(sql2022, journalName);
  if (result2022) results.push(result2022);
  
  // 查询 JCR2021（只有 Journal, IF）
  const sql2021 = `
    SELECT 
      Journal as journal,
      NULL as issn,
      NULL as eissn,
      NULL as category,
      "IF(2021)" as if_2024,
      NULL as if_quartile_2021,
      NULL as if_rank_2024,
      2021 as year
    FROM JCR2021
    WHERE Journal = ?
    LIMIT 1
  `;
  const result2021 = await db.get<JcrRecord & { year: number }>(sql2021, journalName);
  if (result2021) results.push(result2021);
  
  // 查询 JCR2020（只有 Journal, IF）
  const sql2020 = `
    SELECT 
      Journal as journal,
      NULL as issn,
      NULL as eissn,
      NULL as category,
      "IF (2020)" as if_2024,
      NULL as if_quartile_2024,
      NULL as if_rank_2024,
      2020 as year
    FROM JCR2020
    WHERE Journal = ?
    LIMIT 1
  `;
  const result2020 = await db.get<JcrRecord & { year: number }>(sql2020, journalName);
  if (result2020) results.push(result2020);
  
  return results;
}

/**
 * 根据期刊名称查询 JCR 数据（单条）
 */
export async function getJcrByJournalName(journalName: string): Promise<JcrRecord | null> {
  const db = await getJcrDb();
  
  const sql = `
    SELECT 
      Journal as journal,
      ISSN as issn,
      eISSN as eissn,
      Category as category,
      "IF(2024)" as if_2024,
      "IF Quartile(2024)" as if_quartile_2024,
      "IF Rank(2024)" as if_rank_2024
    FROM JCR2024
    WHERE Journal = ?
    LIMIT 1
  `;

  const result = await db.get<JcrRecord>(sql, journalName);
  return result ?? null;
}

/**
 * 根据期刊名称查询所有年份的 JCR 数据（用于非 ISSN 期刊）
 * 使用 COLLATE NOCASE 进行大小写不敏感匹配，可以利用索引
 */
export async function getJcrByTitle(title: string): Promise<JcrRecord[]> {
  const db = await getJcrDb();
  const results: JcrRecord[] = [];
  
  const normalizedTitle = title.trim();
  
  // 查询 JCR2024（使用 COLLATE NOCASE 索引）
  const sql2024 = `
    SELECT 
      Journal as journal,
      ISSN as issn,
      eISSN as eissn,
      Category as category,
      "IF(2024)" as if_2024,
      "IF Quartile(2024)" as if_quartile_2024,
      "IF Rank(2024)" as if_rank_2024,
      2024 as year
    FROM JCR2024
    WHERE Journal = ? COLLATE NOCASE
    LIMIT 1
  `;
  const result2024 = await db.get<JcrRecord & { year: number }>(sql2024, normalizedTitle);
  if (result2024) results.push(result2024);
  
  // 查询 JCR2023
  const sql2023 = `
    SELECT 
      Journal as journal,
      ISSN as issn,
      EISSN as eissn,
      Category as category,
      "IF(2023)" as if_2024,
      "IF Quartile(2023)" as if_quartile_2024,
      "Category Rank(2023)" as if_rank_2024,
      2023 as year
    FROM JCR2023
    WHERE Journal = ? COLLATE NOCASE
    LIMIT 1
  `;
  const result2023 = await db.get<JcrRecord & { year: number }>(sql2023, normalizedTitle);
  if (result2023) results.push(result2023);
  
  // 查询 JCR2022
  const sql2022 = `
    SELECT 
      Journal as journal,
      NULL as issn,
      NULL as eissn,
      NULL as category,
      "IF(2022)" as if_2024,
      "IF Quartile(2022)" as if_quartile_2024,
      NULL as if_rank_2024,
      2022 as year
    FROM JCR2022
    WHERE Journal = ? COLLATE NOCASE
    LIMIT 1
  `;
  const result2022 = await db.get<JcrRecord & { year: number }>(sql2022, normalizedTitle);
  if (result2022) results.push(result2022);
  
  // 查询 JCR2021
  const sql2021 = `
    SELECT 
      Journal as journal,
      NULL as issn,
      NULL as eissn,
      NULL as category,
      "IF(2021)" as if_2024,
      NULL as if_quartile_2024,
      NULL as if_rank_2024,
      2021 as year
    FROM JCR2021
    WHERE Journal = ? COLLATE NOCASE
    LIMIT 1
  `;
  const result2021 = await db.get<JcrRecord & { year: number }>(sql2021, normalizedTitle);
  if (result2021) results.push(result2021);
  
  // 查询 JCR2020
  const sql2020 = `
    SELECT 
      Journal as journal,
      NULL as issn,
      NULL as eissn,
      NULL as category,
      "IF (2020)" as if_2024,
      NULL as if_quartile_2024,
      NULL as if_rank_2024,
      2020 as year
    FROM JCR2020
    WHERE Journal = ? COLLATE NOCASE
    LIMIT 1
  `;
  const result2020 = await db.get<JcrRecord & { year: number }>(sql2020, normalizedTitle);
  if (result2020) results.push(result2020);
  
  return results;
}

/**
 * 根据期刊名称查询所有年份的中科院分区数据（用于非 ISSN 期刊）
 * 使用 COLLATE NOCASE 进行大小写不敏感匹配，可以利用索引
 */
export async function getFqbJcrByTitle(title: string): Promise<FqbJcrRecord[]> {
  const db = await getJcrDb();
  const results: FqbJcrRecord[] = [];
  
  const normalizedTitle = title.trim();
  
  // 查询 FQBJCR2025（使用 COLLATE NOCASE 索引）
  const sql2025 = `
    SELECT 
      Journal as journal,
      "年份" as year,
      "ISSN/EISSN" as issn,
      Review as review,
      "Open Access" as open_access,
      "Web of Science" as web_of_science,
      "大类" as major_category,
      "大类分区" as major_partition,
      Top as is_top,
      "小类1" as minor_category_1,
      "小类1分区" as minor_partition_1,
      "小类2" as minor_category_2,
      "小类2分区" as minor_partition_2,
      "小类3" as minor_category_3,
      "小类3分区" as minor_partition_3,
      "小类4" as minor_category_4,
      "小类4分区" as minor_partition_4,
      "小类5" as minor_category_5,
      "小类5分区" as minor_partition_5,
      "小类6" as minor_category_6,
      "小类6分区" as minor_partition_6
    FROM FQBJCR2025
    WHERE Journal = ? COLLATE NOCASE
    LIMIT 1
  `;
  const result2025 = await db.get<FqbJcrRecord>(sql2025, normalizedTitle);
  if (result2025) results.push(result2025);
  
  // 查询 FQBJCR2023
  const sql2023 = `
    SELECT 
      Journal as journal,
      "年份" as year,
      ISSN as issn,
      Review as review,
      "Open Access" as open_access,
      "Web of Science" as web_of_science,
      "大类" as major_category,
      "大类分区" as major_partition,
      Top as is_top,
      "小类1" as minor_category_1,
      "小类1分区" as minor_partition_1,
      "小类2" as minor_category_2,
      "小类2分区" as minor_partition_2,
      "小类3" as minor_category_3,
      "小类3分区" as minor_partition_3,
      "小类4" as minor_category_4,
      "小类4分区" as minor_partition_4,
      "小类5" as minor_category_5,
      "小类5分区" as minor_partition_5,
      "小类6" as minor_category_6,
      "小类6分区" as minor_partition_6
    FROM FQBJCR2023
    WHERE Journal = ? COLLATE NOCASE
    LIMIT 1
  `;
  const result2023 = await db.get<FqbJcrRecord>(sql2023, normalizedTitle);
  if (result2023) results.push(result2023);
  
  // 查询 FQBJCR2022
  const sql2022 = `
    SELECT 
      Journal as journal,
      "年份" as year,
      ISSN as issn,
      Review as review,
      "Open Access" as open_access,
      "Web of Science" as web_of_science,
      "大类" as major_category,
      "大类分区" as major_partition,
      Top as is_top,
      "小类1" as minor_category_1,
      "小类1分区" as minor_partition_1,
      "小类2" as minor_category_2,
      "小类2分区" as minor_partition_2,
      "小类3" as minor_category_3,
      "小类3分区" as minor_partition_3,
      "小类4" as minor_category_4,
      "小类4分区" as minor_partition_4,
      "小类5" as minor_category_5,
      "小类5分区" as minor_partition_5,
      "小类6" as minor_category_6,
      "小类6分区" as minor_partition_6
    FROM FQBJCR2022
    WHERE Journal = ? COLLATE NOCASE
    LIMIT 1
  `;
  const result2022 = await db.get<FqbJcrRecord>(sql2022, normalizedTitle);
  if (result2022) results.push(result2022);
  
  // 查询 FQBJCR2021
  const sql2021 = `
    SELECT 
      Journal as journal,
      "年份" as year,
      ISSN as issn,
      Review as review,
      "Open Access" as open_access,
      "Web of Science" as web_of_science,
      "大类" as major_category,
      "大类分区" as major_partition,
      Top as is_top,
      "小类1" as minor_category_1,
      "小类1分区" as minor_partition_1,
      "小类2" as minor_category_2,
      "小类2分区" as minor_partition_2,
      "小类3" as minor_category_3,
      "小类3分区" as minor_partition_3,
      "小类4" as minor_category_4,
      "小类4分区" as minor_partition_4,
      "小类5" as minor_category_5,
      "小类5分区" as minor_partition_5,
      "小类6" as minor_category_6,
      "小类6分区" as minor_partition_6
    FROM FQBJCR2021
    WHERE Journal = ? COLLATE NOCASE
    LIMIT 1
  `;
  const result2021 = await db.get<FqbJcrRecord>(sql2021, normalizedTitle);
  if (result2021) results.push(result2021);
  
  return results;
}

/**
 * 根据 ISSN 查询所有年份的中科院分区数据
 */
export async function getFqbJcrByIssn(issn: string): Promise<FqbJcrRecord[]> {
  const db = await getJcrDb();
  const results: FqbJcrRecord[] = [];
  
  // 查询 FQBJCR2025
  const sql2025 = `
    SELECT 
      Journal as journal,
      "年份" as year,
      "ISSN/EISSN" as issn,
      Review as review,
      "Open Access" as open_access,
      "Web of Science" as web_of_science,
      "大类" as major_category,
      "大类分区" as major_partition,
      Top as is_top,
      "小类1" as minor_category_1,
      "小类1分区" as minor_partition_1,
      "小类2" as minor_category_2,
      "小类2分区" as minor_partition_2,
      "小类3" as minor_category_3,
      "小类3分区" as minor_partition_3,
      "小类4" as minor_category_4,
      "小类4分区" as minor_partition_4,
      "小类5" as minor_category_5,
      "小类5分区" as minor_partition_5,
      "小类6" as minor_category_6,
      "小类6分区" as minor_partition_6
    FROM FQBJCR2025
    WHERE "ISSN/EISSN" LIKE ?
    LIMIT 1
  `;
  const result2025 = await db.get<FqbJcrRecord>(sql2025, `%${issn}%`);
  if (result2025) results.push(result2025);
  
  // 查询 FQBJCR2023
  const sql2023 = `
    SELECT 
      Journal as journal,
      "年份" as year,
      ISSN as issn,
      Review as review,
      "Open Access" as open_access,
      "Web of Science" as web_of_science,
      "大类" as major_category,
      "大类分区" as major_partition,
      Top as is_top,
      "小类1" as minor_category_1,
      "小类1分区" as minor_partition_1,
      "小类2" as minor_category_2,
      "小类2分区" as minor_partition_2,
      "小类3" as minor_category_3,
      "小类3分区" as minor_partition_3,
      "小类4" as minor_category_4,
      "小类4分区" as minor_partition_4,
      "小类5" as minor_category_5,
      "小类5分区" as minor_partition_5,
      "小类6" as minor_category_6,
      "小类6分区" as minor_partition_6
    FROM FQBJCR2023
    WHERE ISSN LIKE ?
    LIMIT 1
  `;
  const result2023 = await db.get<FqbJcrRecord>(sql2023, `%${issn}%`);
  if (result2023) results.push(result2023);
  
  // 查询 FQBJCR2022
  const sql2022 = `
    SELECT 
      Journal as journal,
      "年份" as year,
      ISSN as issn,
      Review as review,
      "Open Access" as open_access,
      "Web of Science" as web_of_science,
      "大类" as major_category,
      "大类分区" as major_partition,
      Top as is_top,
      "小类1" as minor_category_1,
      "小类1分区" as minor_partition_1,
      "小类2" as minor_category_2,
      "小类2分区" as minor_partition_2,
      "小类3" as minor_category_3,
      "小类3分区" as minor_partition_3,
      "小类4" as minor_category_4,
      "小类4分区" as minor_partition_4,
      "小类5" as minor_category_5,
      "小类5分区" as minor_partition_5,
      "小类6" as minor_category_6,
      "小类6分区" as minor_partition_6
    FROM FQBJCR2022
    WHERE ISSN LIKE ?
    LIMIT 1
  `;
  const result2022 = await db.get<FqbJcrRecord>(sql2022, `%${issn}%`);
  if (result2022) results.push(result2022);
  
  // 查询 FQBJCR2021
  const sql2021 = `
    SELECT 
      Journal as journal,
      "年份" as year,
      ISSN as issn,
      Review as review,
      "Open Access" as open_access,
      "Web of Science" as web_of_science,
      "大类" as major_category,
      "大类分区" as major_partition,
      Top as is_top,
      "小类1" as minor_category_1,
      "小类1分区" as minor_partition_1,
      "小类2" as minor_category_2,
      "小类2分区" as minor_partition_2,
      "小类3" as minor_category_3,
      "小类3分区" as minor_partition_3,
      "小类4" as minor_category_4,
      "小类4分区" as minor_partition_4,
      "小类5" as minor_category_5,
      "小类5分区" as minor_partition_5,
      "小类6" as minor_category_6,
      "小类6分区" as minor_partition_6
    FROM FQBJCR2021
    WHERE ISSN LIKE ?
    LIMIT 1
  `;
  const result2021 = await db.get<FqbJcrRecord>(sql2021, `%${issn}%`);
  if (result2021) results.push(result2021);
  
  return results;
}

import fs from "node:fs";
import path from "node:path";

export type Migration = {
  name: string;
  sql: string;
};

/**
 * SQL 文件搜索路径
 */
const SQL_SEARCH_PATHS = [
  path.join(process.cwd(), "sql"),
  path.join(process.cwd(), "..", "sql"),
  "/app/sql",
];

/**
 * 从 sql/ 目录加载 SQL 脚本
 */
function loadSqlFile(filename: string): string {
  for (const dir of SQL_SEARCH_PATHS) {
    const filePath = path.join(dir, filename);
    try {
      if (fs.existsSync(filePath)) {
        console.log(`[SQL] 加载文件: ${filePath}`);
        return fs.readFileSync(filePath, "utf-8");
      }
    } catch {
      continue;
    }
  }

  throw new Error(`SQL 文件未找到: ${filename}，搜索路径: ${SQL_SEARCH_PATHS.join(", ")}`);
}

/**
 * 自动扫描 sql/ 目录，加载所有 .sql 文件（按文件名排序）
 */
function loadAllMigrations(): Migration[] {
  // 找到 sql 目录
  let sqlDir: string | null = null;
  for (const dir of SQL_SEARCH_PATHS) {
    if (fs.existsSync(dir)) {
      sqlDir = dir;
      break;
    }
  }

  if (!sqlDir) {
    throw new Error(`SQL 目录未找到，搜索路径: ${SQL_SEARCH_PATHS.join(", ")}`);
  }

  // 读取所有 .sql 文件
  const files = fs.readdirSync(sqlDir)
    .filter(f => f.endsWith(".sql") && /^\d{3}_/.test(f))
    .sort();

  console.log(`[SQL] 发现 ${files.length} 个迁移文件: ${files.join(", ")}`);

  return files.map(filename => ({
    name: filename.replace(".sql", ""),
    sql: loadSqlFile(filename),
  }));
}

/**
 * SQL 迁移列表（自动从 sql/ 目录加载）
 */
export const migrations: Migration[] = loadAllMigrations();

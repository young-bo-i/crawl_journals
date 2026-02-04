import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { nowLocal } from "@/server/util/time";

export type { RowDataPacket, ResultSetHeader };

/**
 * 解析 SQL 脚本为单独的语句
 * 正确处理字符串、注释和分号
 */
function parseSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inString = false;
  let stringChar = "";
  let i = 0;
  
  while (i < sql.length) {
    const char = sql[i];
    const next = sql[i + 1];
    
    // 跳过单行注释
    if (char === "-" && next === "-" && !inString) {
      // 跳到行尾
      while (i < sql.length && sql[i] !== "\n") {
        i++;
      }
      i++; // 跳过换行符
      continue;
    }
    
    // 处理字符串（支持单引号和双引号）
    if ((char === "'" || char === '"') && !inString) {
      inString = true;
      stringChar = char;
      current += char;
      i++;
      continue;
    }
    
    if (inString && char === stringChar) {
      // 检查是否是转义的引号（'' 或 ""）
      if (next === stringChar) {
        current += char + next;
        i += 2;
        continue;
      }
      inString = false;
      current += char;
      i++;
      continue;
    }
    
    // 分号分隔语句（不在字符串内）
    if (char === ";" && !inString) {
      const stmt = current.trim();
      if (stmt && !stmt.startsWith("--")) {
        statements.push(stmt);
      }
      current = "";
      i++;
      continue;
    }
    
    current += char;
    i++;
  }
  
  // 处理最后一条语句
  const lastStmt = current.trim();
  if (lastStmt && !lastStmt.startsWith("--")) {
    statements.push(lastStmt);
  }
  
  return statements;
}

// 全局连接池
const globalForDb = globalThis as unknown as {
  mysqlPool?: Pool;
  dbMigrated?: boolean;
};

/**
 * 解析数据库连接 URL
 */
function parseDbUrl(url: string) {
  // mysql://user:password@host:port/database
  const match = url.match(/^mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
  if (!match) {
    throw new Error(`无效的 MySQL DATABASE_URL: ${url}`);
  }
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4], 10),
    database: match[5],
  };
}

/**
 * 获取 MySQL 连接池
 */
export async function getPool(): Promise<Pool> {
  if (!globalForDb.mysqlPool) {
    const url = process.env.DATABASE_URL;
    if (!url || !url.startsWith("mysql://")) {
      throw new Error("请设置 DATABASE_URL 环境变量，格式: mysql://user:password@host:port/database");
    }

    const config = parseDbUrl(url);
    console.log(`[MySQL] 连接到 ${config.host}:${config.port}/${config.database}`);

    globalForDb.mysqlPool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: "utf8mb4",
      timezone: "+08:00",
      // 支持多语句执行（用于迁移）
      multipleStatements: true,
    });

    // 测试连接
    const conn = await globalForDb.mysqlPool.getConnection();
    console.log(`[MySQL] 连接成功`);
    conn.release();
  }

  return globalForDb.mysqlPool;
}

/**
 * 执行数据库初始化 SQL
 * 每次启动都执行所有 SQL 文件，依靠 SQL 本身的幂等性保证正确
 */
export async function runMigrations(): Promise<void> {
  if (globalForDb.dbMigrated) {
    return;
  }

  const pool = await getPool();
  const { migrations } = await import("./migrations/index");

  console.log(`[MySQL] 开始执行数据库初始化，共 ${migrations.length} 个 SQL 文件`);

  for (const migration of migrations) {
    console.log(`[MySQL] 执行 ${migration.name}.sql`);
    const conn = await pool.getConnection();
    
    try {
      const statements = parseSqlStatements(migration.sql);
      let executed = 0;
      let skipped = 0;
      
      for (const stmt of statements) {
        try {
          await conn.query(stmt);
          executed++;
        } catch (err: any) {
          // 幂等性：忽略"已存在"类错误
          const ignorableErrors = [
            1050, // Table already exists
            1060, // Duplicate column name
            1061, // Duplicate key name (索引已存在)
            1068, // Multiple primary key defined
          ];
          
          if (ignorableErrors.includes(err?.errno)) {
            skipped++;
          } else {
            console.error(`[MySQL] SQL 执行失败: ${stmt.substring(0, 80)}...`);
            console.error(`[MySQL] 错误: ${err.message}`);
            throw err;
          }
        }
      }
      
      console.log(`[MySQL] ${migration.name}: ${executed} 条执行, ${skipped} 条跳过（已存在）`);
    } finally {
      conn.release();
    }
  }

  globalForDb.dbMigrated = true;
  console.log(`[MySQL] 数据库初始化完成`);
}

/**
 * 获取已初始化的数据库连接池（自动运行迁移）
 */
export async function getDb(): Promise<Pool> {
  const pool = await getPool();
  await runMigrations();
  return pool;
}

/**
 * 执行单条 SQL 查询
 * 使用 query 而非 execute 以避免 BLOB 列的兼容性问题
 */
export async function query<T extends RowDataPacket[]>(
  sql: string,
  params?: any[]
): Promise<T> {
  const pool = await getDb();
  const [rows] = await pool.query<T>(sql, params);
  return rows;
}

/**
 * 执行单条 SQL 查询，返回第一行
 */
export async function queryOne<T extends RowDataPacket>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  const rows = await query<T[]>(sql, params);
  return rows[0] ?? null;
}

/**
 * 执行 INSERT/UPDATE/DELETE 语句
 * 使用 query 而非 execute 以避免兼容性问题
 */
export async function execute(
  sql: string,
  params?: any[]
): Promise<ResultSetHeader> {
  const pool = await getDb();
  const [result] = await pool.query<ResultSetHeader>(sql, params);
  return result;
}

/**
 * 获取一个事务连接
 */
export async function getTransaction(): Promise<PoolConnection> {
  const pool = await getDb();
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  return conn;
}

/**
 * 关闭连接池
 */
export async function closePool(): Promise<void> {
  if (globalForDb.mysqlPool) {
    await globalForDb.mysqlPool.end();
    globalForDb.mysqlPool = undefined;
    globalForDb.dbMigrated = false;
    console.log(`[MySQL] 连接池已关闭`);
  }
}

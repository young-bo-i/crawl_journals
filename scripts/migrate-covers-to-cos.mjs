/**
 * 将 journal_covers 中的 BLOB 封面图片批量迁移到腾讯 COS 对象存储
 *
 * 运行方式：node scripts/migrate-covers-to-cos.mjs
 *
 * 处理逻辑：
 * 1. 查询所有 cos_key IS NULL 且 image IS NOT NULL 的记录
 * 2. 并发上传到 COS（带并发控制）
 * 3. 上传成功后更新 cos_key，清空 image BLOB
 * 4. 支持中断续传（cos_key IS NULL 条件自动跳过已迁移的）
 *
 * 迁移完成后可手动执行:
 *   ALTER TABLE journal_covers DROP COLUMN image;
 * 以彻底释放数据库空间。
 *
 * 环境变量（需在运行前设置或写入 .env）：
 *   COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION
 *   COS_DOMAIN（可选）, COS_COVER_PREFIX（默认 covers）
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME（或使用下方默认值）
 */

import mysql from "mysql2/promise";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";

// ============ 配置 ============

const CONCURRENCY = 5;      // COS 上传并发数
const BATCH_SIZE = 100;      // 每批从 DB 取的记录数
const WEBP_QUALITY = 80;     // WebP 转换质量

// 数据库配置（可通过环境变量覆盖）
const DB_CONFIG = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "root123",
  database: process.env.DB_NAME || "crawl_journals",
  connectionLimit: CONCURRENCY + 2,
  waitForConnections: true,
};

// COS 配置
const COS_SECRET_ID = process.env.COS_SECRET_ID || "";
const COS_SECRET_KEY = process.env.COS_SECRET_KEY || "";
const COS_BUCKET = process.env.COS_BUCKET || "";
const COS_REGION = process.env.COS_REGION || "";
const COS_COVER_PREFIX = process.env.COS_COVER_PREFIX || "covers";

// ============ 校验 ============

if (!COS_SECRET_ID || !COS_SECRET_KEY || !COS_BUCKET || !COS_REGION) {
  console.error("错误：缺少 COS 环境变量（COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION）");
  process.exit(1);
}

// ============ COS 客户端 ============

const cosClient = new COS({ SecretId: COS_SECRET_ID, SecretKey: COS_SECRET_KEY });

function cosUpload(key, buffer, contentType) {
  return new Promise((resolve, reject) => {
    cosClient.putObject(
      {
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      },
      (err, data) => {
        if (err) reject(err);
        else resolve(data);
      }
    );
  });
}

// ============ 主函数 ============

async function main() {
  const pool = mysql.createPool(DB_CONFIG);
  console.log(`Connected to MySQL @ ${DB_CONFIG.host}:${DB_CONFIG.port}`);
  console.log(`COS Bucket: ${COS_BUCKET}, Region: ${COS_REGION}, Prefix: ${COS_COVER_PREFIX}/`);

  // 统计待迁移数量
  const [countRows] = await pool.execute(
    "SELECT COUNT(*) AS cnt, ROUND(SUM(LENGTH(image))/1024/1024, 1) AS mb FROM journal_covers WHERE cos_key IS NULL AND image IS NOT NULL"
  );
  const totalCount = Number(countRows[0].cnt);
  const totalMb = Number(countRows[0].mb || 0);

  console.log(`\n待迁移: ${totalCount} 张封面, 约 ${totalMb} MB\n`);

  if (totalCount === 0) {
    console.log("所有封面已迁移至 COS，无需操作。");
    await pool.end();
    return;
  }

  let migrated = 0;
  let errors = 0;
  let freedBytes = 0;
  const startTime = Date.now();

  // 处理单条记录
  async function migrateOne(journalId) {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        "SELECT image, image_type, image_name FROM journal_covers WHERE journal_id = ? AND cos_key IS NULL AND image IS NOT NULL",
        [journalId]
      );
      if (rows.length === 0) return; // 已被其他进程迁移

      let { image, image_type, image_name } = rows[0];
      const originalSize = image.length;

      // 确保是 WebP 格式
      let buffer = image;
      let mimeType = image_type || "image/jpeg";
      let fileName = `${journalId}.webp`;

      if (mimeType !== "image/webp") {
        try {
          const webpBuffer = await sharp(image).webp({ quality: WEBP_QUALITY }).toBuffer();
          if (webpBuffer.length < image.length) {
            buffer = webpBuffer;
          }
          mimeType = "image/webp";
        } catch {
          // 转换失败保留原格式
          const extMap = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif" };
          const ext = extMap[mimeType] || ".bin";
          fileName = `${journalId}${ext}`;
        }
      }

      const cosKey = `${COS_COVER_PREFIX}/${fileName}`;

      // 上传到 COS
      await cosUpload(cosKey, buffer, mimeType);

      // 更新数据库：写入 cos_key，清空 BLOB
      await conn.execute(
        "UPDATE journal_covers SET cos_key = ?, image = NULL, image_type = ?, image_name = ? WHERE journal_id = ?",
        [cosKey, mimeType, fileName, journalId]
      );

      freedBytes += originalSize;
      migrated++;

      // 进度日志
      if (migrated % 50 === 0 || migrated === totalCount) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = (migrated / elapsed).toFixed(1);
        const pct = ((migrated / totalCount) * 100).toFixed(1);
        const eta = ((totalCount - migrated) / (migrated / elapsed)).toFixed(0);
        const freedMb = (freedBytes / 1024 / 1024).toFixed(1);
        console.log(
          `[${elapsed.toFixed(1)}s] ${migrated}/${totalCount} (${pct}%) ${rate}/s, ` +
          `已释放 ${freedMb} MB, ETA ${eta}s`
        );
      }
    } catch (err) {
      errors++;
      console.error(`  ERROR ${journalId}: ${err.message?.slice(0, 120)}`);
    } finally {
      conn.release();
    }
  }

  // 分批取 ID，并发处理
  while (true) {
    const [ids] = await pool.query(
      `SELECT journal_id FROM journal_covers WHERE cos_key IS NULL AND image IS NOT NULL LIMIT ${BATCH_SIZE}`
    );
    if (ids.length === 0) break;

    // 分组并发执行
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const chunk = ids.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(({ journal_id }) => migrateOne(journal_id)));
    }
  }

  // 最终报告
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const freedMb = (freedBytes / 1024 / 1024).toFixed(1);
  const freedGb = (freedBytes / 1024 / 1024 / 1024).toFixed(2);

  console.log(`\n========== 迁移完成 ==========`);
  console.log(`成功迁移: ${migrated} 张`);
  console.log(`错误: ${errors} 张`);
  console.log(`释放数据库空间: ${freedMb} MB (${freedGb} GB)`);
  console.log(`耗时: ${elapsed}s`);

  // 检查剩余未迁移的
  const [remaining] = await pool.execute(
    "SELECT COUNT(*) AS cnt FROM journal_covers WHERE cos_key IS NULL AND image IS NOT NULL"
  );
  const remainCount = Number(remaining[0].cnt);
  if (remainCount > 0) {
    console.log(`\n⚠ 仍有 ${remainCount} 条记录未迁移（可能因错误跳过），可重新运行脚本重试。`);
  } else {
    console.log(`\n所有封面已成功迁移至 COS！`);
    console.log(`可执行以下 SQL 释放数据库空间：`);
    console.log(`  ALTER TABLE journal_covers DROP COLUMN image;`);
  }

  await pool.end();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

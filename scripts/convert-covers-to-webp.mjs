/**
 * 批量将 journal_covers 中的 JPEG/PNG/GIF 图片转为 WebP 格式（并发版）
 * 
 * 运行方式：node scripts/convert-covers-to-webp.mjs
 * 
 * 处理逻辑：
 * 1. 查询所有非 WebP 图片的 journal_id
 * 2. 并发读取 BLOB → sharp 转 WebP(quality=80) → 写回数据库
 * 3. 更新 image_type 和 image_name 后缀
 * 4. 支持断点续传（已是 webp 的自动跳过）
 */

import mysql from "mysql2/promise";
import sharp from "sharp";

const CONCURRENCY = 10;     // 并发数
const BATCH_SIZE = 200;     // 每批从 DB 取的 ID 数量
const WEBP_QUALITY = 80;    // WebP 质量（1-100）

const DB_CONFIG = {
  host: "127.0.0.1",
  port: 3308,
  user: "root",
  password: "root123",
  database: "crawl_journals",
  connectionLimit: CONCURRENCY + 2,
  waitForConnections: true,
};

async function main() {
  const pool = mysql.createPool(DB_CONFIG);
  console.log(`Connected to MySQL (concurrency=${CONCURRENCY})`);

  // 统计待转换数量
  const [countRows] = await pool.execute(
    "SELECT image_type, COUNT(*) AS cnt, ROUND(SUM(LENGTH(image))/1024/1024,1) AS mb FROM journal_covers WHERE image_type != 'image/webp' GROUP BY image_type"
  );
  console.log("\n待转换图片统计：");
  let totalCount = 0;
  let totalMb = 0;
  for (const r of countRows) {
    console.log(`  ${r.image_type}: ${r.cnt} 张, ${r.mb} MB`);
    totalCount += Number(r.cnt);
    totalMb += Number(r.mb);
  }
  console.log(`  合计: ${totalCount} 张, ${totalMb.toFixed(1)} MB\n`);

  if (totalCount === 0) {
    console.log("所有图片已经是 WebP 格式，无需转换。");
    await pool.end();
    return;
  }

  let processed = 0;
  let savedBytes = 0;
  let errors = 0;
  const startTime = Date.now();

  // 处理单张图片
  async function convertOne(journal_id) {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        "SELECT image, image_type, image_name FROM journal_covers WHERE journal_id = ?",
        [journal_id]
      );
      if (rows.length === 0) return;

      const { image, image_type, image_name } = rows[0];
      const originalSize = image.length;

      // sharp 转 WebP
      const webpBuffer = await sharp(image)
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      const newSize = webpBuffer.length;
      const finalBuffer = newSize < originalSize ? webpBuffer : image;
      const finalSize = finalBuffer.length;

      // 更新文件名后缀
      const newName = image_name
        ? image_name.replace(/\.(jpe?g|png|gif)$/i, ".webp")
        : `${journal_id}.webp`;

      // 写回数据库
      await conn.execute(
        "UPDATE journal_covers SET image = ?, image_type = 'image/webp', image_name = ? WHERE journal_id = ?",
        [finalBuffer, newName, journal_id]
      );

      const saved = originalSize - finalSize;
      savedBytes += saved;
      processed++;

      if (processed % 200 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (processed / ((Date.now() - startTime) / 1000)).toFixed(1);
        const savedMb = (savedBytes / 1024 / 1024).toFixed(1);
        const pct = ((processed / totalCount) * 100).toFixed(1);
        const eta = ((totalCount - processed) / (processed / ((Date.now() - startTime) / 1000))).toFixed(0);
        console.log(
          `[${elapsed}s] ${processed}/${totalCount} (${pct}%) ${rate}/s, ` +
          `节省 ${savedMb} MB, ETA ${eta}s`
        );
      }
    } catch (err) {
      errors++;
      console.error(`  ERROR ${journal_id}: ${err.message.slice(0, 80)}`);
      // 标记为 image/webp 避免反复重试损坏图片
      await conn.execute(
        "UPDATE journal_covers SET image_type = 'image/webp' WHERE journal_id = ?",
        [journal_id]
      ).catch(() => {});
    } finally {
      conn.release();
    }
  }

  // 分批取 ID，并发处理
  while (true) {
    const [ids] = await pool.query(
      `SELECT journal_id FROM journal_covers WHERE image_type != 'image/webp' LIMIT ${BATCH_SIZE}`
    );
    if (ids.length === 0) break;

    // 分组并发执行
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const chunk = ids.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(({ journal_id }) => convertOne(journal_id)));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const savedMb = (savedBytes / 1024 / 1024).toFixed(1);
  const savedGb = (savedBytes / 1024 / 1024 / 1024).toFixed(2);

  console.log(`\n========== 转换完成 ==========`);
  console.log(`总处理: ${processed} 张`);
  console.log(`错误: ${errors} 张`);
  console.log(`节省空间: ${savedMb} MB (${savedGb} GB)`);
  console.log(`耗时: ${elapsed}s`);

  // 最终统计
  const [finalStats] = await pool.execute(
    "SELECT image_type, COUNT(*) AS cnt, ROUND(SUM(LENGTH(image))/1024/1024,1) AS mb FROM journal_covers GROUP BY image_type"
  );
  console.log("\n转换后统计：");
  for (const r of finalStats) {
    console.log(`  ${r.image_type}: ${r.cnt} 张, ${r.mb} MB`);
  }

  await pool.end();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

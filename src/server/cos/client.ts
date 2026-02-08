/**
 * 腾讯 COS 对象存储 - 封面图片管理模块
 *
 * 负责将期刊封面上传到 COS 并管理其生命周期。
 * 所有 COS 配置通过环境变量注入。
 */

import COS from "cos-nodejs-sdk-v5";

// ============ 配置 ============

function getConfig() {
  const secretId = process.env.COS_SECRET_ID ?? "";
  const secretKey = process.env.COS_SECRET_KEY ?? "";
  const bucket = process.env.COS_BUCKET ?? "";
  const region = process.env.COS_REGION ?? "";
  const domain = process.env.COS_DOMAIN ?? ""; // 可选：自定义域名 / CDN 域名
  const prefix = process.env.COS_COVER_PREFIX ?? "covers";

  if (!secretId || !secretKey || !bucket || !region) {
    throw new Error(
      "[COS] 缺少必要配置，请检查环境变量: COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION"
    );
  }

  return { secretId, secretKey, bucket, region, domain, prefix };
}

/** 检查 COS 是否已配置（所有必要环境变量非空） */
export function isCosConfigured(): boolean {
  const secretId = process.env.COS_SECRET_ID ?? "";
  const secretKey = process.env.COS_SECRET_KEY ?? "";
  const bucket = process.env.COS_BUCKET ?? "";
  const region = process.env.COS_REGION ?? "";
  return !!(secretId && secretKey && bucket && region);
}

// ============ COS 客户端单例 ============

let _client: COS | null = null;

function getClient(): COS {
  if (!_client) {
    const { secretId, secretKey } = getConfig();
    _client = new COS({ SecretId: secretId, SecretKey: secretKey });
  }
  return _client;
}

// ============ 公开 API ============

/**
 * 将封面图片上传到 COS（自动转 WebP）
 *
 * @returns cos_key（对象键，如 "covers/abc123.webp"）
 */
export async function uploadCover(
  journalId: string,
  imageBuffer: Buffer,
  mimeType: string
): Promise<{ cosKey: string; finalBuffer: Buffer; finalMimeType: string; finalFileName: string }> {
  const { bucket, region, prefix } = getConfig();
  const cos = getClient();

  // ---------- WebP 转换 ----------
  let buffer = imageBuffer;
  let mime = mimeType;
  let fileName = `${journalId}.webp`;

  if (mimeType !== "image/webp") {
    try {
      const sharp = (await import("sharp")).default;
      const webpBuffer = await sharp(imageBuffer).webp({ quality: 80 }).toBuffer();
      // 只在转换后更小时替换
      if (webpBuffer.length < imageBuffer.length) {
        buffer = webpBuffer;
      }
      mime = "image/webp";
    } catch (err) {
      console.warn(
        `[COS] WebP conversion failed for ${journalId}, uploading original format:`,
        (err as Error).message
      );
      // 保留原格式
      const extMap: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
      };
      const ext = extMap[mimeType] || ".bin";
      fileName = `${journalId}${ext}`;
    }
  }

  const cosKey = `${prefix}/${fileName}`;

  // ---------- 上传 ----------
  await new Promise<COS.PutObjectResult>((resolve, reject) => {
    cos.putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: cosKey,
        Body: buffer,
        ContentType: mime,
      },
      (err, data) => {
        if (err) reject(err);
        else resolve(data);
      }
    );
  });

  console.log(`[COS] uploaded ${cosKey} (${(buffer.length / 1024).toFixed(0)} KB)`);

  return { cosKey, finalBuffer: buffer, finalMimeType: mime, finalFileName: fileName };
}

/**
 * 从 COS 删除封面对象
 */
export async function deleteCover(cosKey: string): Promise<void> {
  const { bucket, region } = getConfig();
  const cos = getClient();

  await new Promise<COS.DeleteObjectResult>((resolve, reject) => {
    cos.deleteObject(
      { Bucket: bucket, Region: region, Key: cosKey },
      (err, data) => {
        if (err) reject(err);
        else resolve(data);
      }
    );
  });

  console.log(`[COS] deleted ${cosKey}`);
}

/**
 * 根据 cos_key 生成完整的公网访问 URL
 *
 * 如果配置了 COS_DOMAIN（自定义域名 / CDN），则使用该域名；
 * 否则使用默认的 COS 域名 `{bucket}.cos.{region}.myqcloud.com`。
 */
export function getCoverUrl(cosKey: string): string {
  const { bucket, region, domain } = getConfig();

  if (domain) {
    // 自定义域名 / CDN 域名（自动补 https 协议头）
    const base = domain.startsWith("http") ? domain : `https://${domain}`;
    return `${base.replace(/\/$/, "")}/${cosKey}`;
  }

  // 默认 COS 域名
  return `https://${bucket}.cos.${region}.myqcloud.com/${cosKey}`;
}

import { 
  getJournalDetail,
  getJournalCoverImage,
  updateJournalCoverImage,
  deleteJournalCoverImage,
} from "@/server/db/repo";

export const runtime = "nodejs";

// 允许的图片类型
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/** 明确的非图片 Content-Type，遇到时直接拒绝 */
const REJECT_CONTENT_TYPES = [
  "text/html", "text/plain", "text/xml",
  "application/json", "application/xml",
  "application/xhtml+xml", "application/javascript", "text/css",
];

/** 通过文件魔数 (magic bytes) 检测真实图片类型 */
function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return "image/gif";
  if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
      && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return "image/webp";
  return null;
}

// 获取封面图片
export async function GET(_: Request, { params }: { params: Promise<{ issn: string }> }) {
  const { issn: idOrIssn } = await params;
  
  // 先检查期刊是否存在
  const detail = await getJournalDetail(idOrIssn);
  if (!detail) {
    return Response.json({ error: "Journal not found" }, { status: 404 });
  }
  
  const cover = await getJournalCoverImage(detail.journal.id);
  if (!cover) {
    return Response.json({ error: "No cover image" }, { status: 404 });
  }

  // COS 模式：302 重定向到 COS URL
  if (cover.cosUrl) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: cover.cosUrl,
        "Cache-Control": "public, max-age=86400", // 缓存 1 天
      },
    });
  }
  
  // 回退模式：从 BLOB 返回二进制数据（兼容未迁移的记录）
  return new Response(new Uint8Array(cover.image!), {
    headers: {
      "Content-Type": cover.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(cover.fileName)}"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}

// 上传封面图片（支持 FormData 文件上传 和 JSON URL 上传两种方式）
export async function POST(req: Request, { params }: { params: Promise<{ issn: string }> }) {
  const { issn: idOrIssn } = await params;
  
  // 先检查期刊是否存在
  const detail = await getJournalDetail(idOrIssn);
  if (!detail) {
    return Response.json({ error: "Journal not found" }, { status: 404 });
  }
  
  const contentType = req.headers.get("content-type") ?? "";
  
  try {
    let buffer: Buffer;
    let mimeType: string;
    let fileName: string;
    
    if (contentType.includes("application/json")) {
      // === JSON 方式：通过 URL 下载图片 ===
      const body = await req.json();
      const imageUrl = body.imageUrl;
      
      if (!imageUrl || typeof imageUrl !== "string") {
        return Response.json({ error: "Missing imageUrl in request body" }, { status: 400 });
      }
      
      // 从 URL 下载图片
      const imgRes = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; JournalCoverBot/1.0)",
          "Accept": "image/*",
        },
        signal: AbortSignal.timeout(15000), // 15 秒超时
      });
      
      if (!imgRes.ok) {
        return Response.json(
          { error: `Failed to download image: HTTP ${imgRes.status}` },
          { status: 502 }
        );
      }
      
      // 检测 MIME 类型
      const serverMime = imgRes.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      
      // 严格拒绝非图片 Content-Type（如 text/html 网页）
      if (REJECT_CONTENT_TYPES.some((t) => serverMime.startsWith(t))) {
        return Response.json(
          { error: `URL returned non-image content (Content-Type: ${serverMime})` },
          { status: 400 }
        );
      }
      
      const arrayBuffer = await imgRes.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      
      // 用魔数检测真实图片类型
      if (ALLOWED_TYPES.includes(serverMime)) {
        mimeType = serverMime;
      } else {
        const detected = detectImageMime(buffer);
        if (detected) {
          mimeType = detected;
        } else {
          return Response.json(
            { error: `URL does not point to a valid image (Content-Type: ${serverMime || "unknown"})` },
            { status: 400 }
          );
        }
      }
      
      // 二次魔数校验（确保实际内容是图片）
      if (!detectImageMime(buffer)) {
        return Response.json(
          { error: "Downloaded content is not a valid image" },
          { status: 400 }
        );
      }
      
      if (buffer.length > MAX_SIZE) {
        return Response.json(
          { error: `Image too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Maximum: ${MAX_SIZE / 1024 / 1024}MB` },
          { status: 400 }
        );
      }
      
      // 从 URL 提取文件名
      const urlPath = new URL(imageUrl).pathname;
      fileName = urlPath.split("/").pop() || "cover.jpg";
      
    } else {
      // === FormData 方式：传统文件上传 ===
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      
      if (!file) {
        return Response.json({ error: "No file provided" }, { status: 400 });
      }
      
      // 验证文件类型
      if (!ALLOWED_TYPES.includes(file.type)) {
        return Response.json({ 
          error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP" 
        }, { status: 400 });
      }
      
      // 验证文件大小
      if (file.size > MAX_SIZE) {
        return Response.json({ 
          error: `File too large. Maximum size: ${MAX_SIZE / 1024 / 1024}MB` 
        }, { status: 400 });
      }
      
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      mimeType = file.type;
      fileName = file.name;
    }
    
    // 保存到数据库
    const success = await updateJournalCoverImage(
      detail.journal.id,
      buffer,
      mimeType,
      fileName
    );
    
    if (success) {
      return Response.json({ 
        success: true, 
        message: "Cover image uploaded successfully",
        fileName,
        mimeType,
        size: buffer.length,
      });
    } else {
      return Response.json({ error: "Failed to save cover image" }, { status: 500 });
    }
  } catch (err) {
    console.error("Failed to upload cover image:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// 删除封面图片
export async function DELETE(_: Request, { params }: { params: Promise<{ issn: string }> }) {
  const { issn: idOrIssn } = await params;
  
  // 先检查期刊是否存在
  const detail = await getJournalDetail(idOrIssn);
  if (!detail) {
    return Response.json({ error: "Journal not found" }, { status: 404 });
  }
  
  const success = await deleteJournalCoverImage(detail.journal.id);
  
  if (success) {
    return Response.json({ success: true, message: "Cover image deleted" });
  } else {
    return Response.json({ error: "Failed to delete cover image" }, { status: 500 });
  }
}

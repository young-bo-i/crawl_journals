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
  
  return new Response(new Uint8Array(cover.image), {
    headers: {
      "Content-Type": cover.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(cover.fileName)}"`,
      "Cache-Control": "public, max-age=86400", // 缓存 1 天
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
      mimeType = imgRes.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
      if (!ALLOWED_TYPES.includes(mimeType)) {
        // 尝试从 URL 推断
        const ext = imageUrl.split("?")[0].split(".").pop()?.toLowerCase();
        const extMap: Record<string, string> = {
          jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
          gif: "image/gif", webp: "image/webp",
        };
        mimeType = (ext && extMap[ext]) || "image/jpeg";
      }
      
      const arrayBuffer = await imgRes.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      
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

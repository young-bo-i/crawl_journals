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

// 上传封面图片
export async function POST(req: Request, { params }: { params: Promise<{ issn: string }> }) {
  const { issn: idOrIssn } = await params;
  
  // 先检查期刊是否存在
  const detail = await getJournalDetail(idOrIssn);
  if (!detail) {
    return Response.json({ error: "Journal not found" }, { status: 404 });
  }
  
  try {
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
    
    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 保存到数据库
    const success = await updateJournalCoverImage(
      detail.journal.id,
      buffer,
      file.type,
      file.name
    );
    
    if (success) {
      return Response.json({ 
        success: true, 
        message: "Cover image uploaded successfully",
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
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

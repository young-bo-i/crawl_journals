import { z } from "zod";
import { 
  getJournalDetail, 
  updateJournalCustomFields,
  type JournalCustomFields 
} from "@/server/db/repo";

export const runtime = "nodejs";

// 支持 OpenAlex ID 或 ISSN 查询
export async function GET(_: Request, { params }: { params: Promise<{ issn: string }> }) {
  const { issn: idOrIssn } = await params;
  const detail = await getJournalDetail(idOrIssn);
  if (!detail) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(detail);
}

// 更新期刊自定义字段
const updateSchema = z.object({
  custom_title: z.string().max(500).nullable().optional(),
  custom_publisher: z.string().max(500).nullable().optional(),
  custom_country: z.string().max(10).nullable().optional(),
  custom_homepage: z.string().url().max(1000).nullable().optional().or(z.literal("")),
  custom_description: z.string().max(5000).nullable().optional(),
  custom_notes: z.string().max(5000).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ issn: string }> }) {
  const { issn: idOrIssn } = await params;
  
  // 先检查期刊是否存在
  const detail = await getJournalDetail(idOrIssn);
  if (!detail) {
    return Response.json({ error: "Journal not found" }, { status: 404 });
  }
  
  try {
    const body = await req.json();
    const parsed = updateSchema.parse(body);
    
    // 处理空字符串转为 null
    const fields: JournalCustomFields = {};
    if (parsed.custom_title !== undefined) {
      fields.custom_title = parsed.custom_title?.trim() || null;
    }
    if (parsed.custom_publisher !== undefined) {
      fields.custom_publisher = parsed.custom_publisher?.trim() || null;
    }
    if (parsed.custom_country !== undefined) {
      fields.custom_country = parsed.custom_country?.trim().toUpperCase() || null;
    }
    if (parsed.custom_homepage !== undefined) {
      fields.custom_homepage = parsed.custom_homepage?.trim() || null;
    }
    if (parsed.custom_description !== undefined) {
      fields.custom_description = parsed.custom_description?.trim() || null;
    }
    if (parsed.custom_notes !== undefined) {
      fields.custom_notes = parsed.custom_notes?.trim() || null;
    }
    
    const success = await updateJournalCustomFields(detail.journal.id, fields);
    
    if (success) {
      // 返回更新后的数据
      const updated = await getJournalDetail(detail.journal.id);
      return Response.json({ success: true, journal: updated?.journal });
    } else {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Invalid input", details: err.issues }, { status: 400 });
    }
    console.error("Failed to update journal:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

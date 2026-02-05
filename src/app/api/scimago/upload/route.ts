/**
 * SCImago 数据上传导入 API
 * POST /api/scimago/upload
 * 
 * 接收 CSV 文件并导入到数据库
 */

import { NextRequest, NextResponse } from "next/server";
import { importScimagoFile, extractYearFromFilename } from "@/server/scimago/importer";

export const config = {
  api: {
    bodyParser: false,
  },
};

// 增加超时时间，因为大文件导入可能需要较长时间
export const maxDuration = 300; // 5 分钟

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "没有上传文件" },
        { status: 400 }
      );
    }
    
    // 过滤有效的 SCImago CSV 文件
    const validFiles = files.filter(file => {
      const name = file.name.toLowerCase();
      return name.startsWith("scimagojr") && name.endsWith(".csv");
    });
    
    if (validFiles.length === 0) {
      return NextResponse.json(
        { error: "没有找到有效的 SCImago CSV 文件（文件名需以 'scimagojr' 开头）" },
        { status: 400 }
      );
    }
    
    // 按年份排序（从旧到新）
    validFiles.sort((a, b) => {
      const yearA = extractYearFromFilename(a.name) ?? 0;
      const yearB = extractYearFromFilename(b.name) ?? 0;
      return yearA - yearB;
    });
    
    const results: Array<{
      filename: string;
      year: number;
      totalRows: number;
      inserted: number;
      updated: number;
      errors: number;
      errorMessages: string[];
    }> = [];
    
    // 逐个处理文件
    for (const file of validFiles) {
      console.log(`[SCImago Import] 开始处理文件: ${file.name}`);
      
      try {
        const content = await file.text();
        const result = await importScimagoFile(content, file.name);
        
        results.push({
          filename: file.name,
          ...result,
        });
        
        console.log(`[SCImago Import] 完成: ${file.name}, 导入 ${result.inserted} 条, 更新 ${result.updated} 条`);
      } catch (e: any) {
        console.error(`[SCImago Import] 处理文件失败: ${file.name}`, e);
        results.push({
          filename: file.name,
          year: extractYearFromFilename(file.name) ?? 0,
          totalRows: 0,
          inserted: 0,
          updated: 0,
          errors: 1,
          errorMessages: [e.message],
        });
      }
    }
    
    // 统计总数
    const summary = {
      totalFiles: results.length,
      totalRows: results.reduce((sum, r) => sum + r.totalRows, 0),
      totalInserted: results.reduce((sum, r) => sum + r.inserted, 0),
      totalUpdated: results.reduce((sum, r) => sum + r.updated, 0),
      totalErrors: results.reduce((sum, r) => sum + r.errors, 0),
    };
    
    return NextResponse.json({
      success: true,
      summary,
      results,
    });
  } catch (e: any) {
    console.error("[SCImago Import] 导入失败:", e);
    return NextResponse.json(
      { error: e.message ?? "导入失败" },
      { status: 500 }
    );
  }
}

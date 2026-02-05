/**
 * SCImago 数据删除 API
 * DELETE /api/scimago/delete
 */

import { NextResponse } from "next/server";
import { deleteScimagoData } from "@/server/scimago/importer";

export async function DELETE() {
  try {
    const result = await deleteScimagoData();
    
    return NextResponse.json({
      success: true,
      deleted: result.deleted,
      indexDeleted: result.indexDeleted,
    });
  } catch (e: any) {
    console.error("[SCImago Delete] 删除失败:", e);
    return NextResponse.json(
      { error: e.message ?? "删除失败" },
      { status: 500 }
    );
  }
}

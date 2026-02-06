import { NextResponse } from "next/server";
import { getDb } from "@/server/db/mysql";

/**
 * 健康检查 API
 * 同时触发数据库连接和迁移
 */
export async function GET() {
  try {
    // 获取数据库连接（会自动执行迁移）
    const db = await getDb();
    
    // 简单检查数据库连接是否正常
    await db.query("SELECT 1");
    
    return NextResponse.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Health] 健康检查失败:", error);
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

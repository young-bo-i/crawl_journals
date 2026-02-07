export const runtime = "nodejs";

/**
 * GET /api/image-proxy?url=...
 *
 * 图片代理：后端代理请求外部图片 URL，解决浏览器跨域/防盗链问题。
 * 前端大图预览和缩略图均可通过此接口加载。
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.google.com/",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return new Response(`Upstream returned ${res.status}`, { status: 502 });
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buffer = await res.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400", // 缓存 1 天
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    console.error("[image-proxy] Failed:", err?.message, "url:", imageUrl.substring(0, 100));
    return new Response(err?.message || "Proxy failed", { status: 502 });
  }
}

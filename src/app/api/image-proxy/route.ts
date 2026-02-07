import http from "node:http";
import https from "node:https";
import { SocksProxyAgent } from "socks-proxy-agent";
import { getDownloadProxy } from "@/app/api/image-search/route";

export const runtime = "nodejs";

/**
 * GET /api/image-proxy?url=...
 *
 * 图片代理：后端代理请求外部图片 URL，解决浏览器跨域/防盗链问题。
 * 如果系统设置中配置了图片下载 SOCKS5 代理，则通过代理请求。
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  try {
    const proxyAddr = await getDownloadProxy();

    const fetchOptions: RequestInit & { agent?: http.Agent } = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.google.com/",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    };

    let res: Response;

    if (proxyAddr) {
      // 使用 SOCKS5 代理：通过 node:http/https 手动请求
      const agent = new SocksProxyAgent(proxyAddr);
      const buffer = await new Promise<{ data: Buffer; contentType: string; status: number }>((resolve, reject) => {
        const isHttps = imageUrl.startsWith("https");
        const lib = isHttps ? https : http;
        const urlObj = new URL(imageUrl);

        const nodeReq = lib.request(
          {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: "GET",
            agent,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
              Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9",
              Referer: "https://www.google.com/",
            },
            timeout: 20000,
          },
          (nodeRes) => {
            const chunks: Buffer[] = [];
            nodeRes.on("data", (chunk: Buffer) => chunks.push(chunk));
            nodeRes.on("end", () => {
              resolve({
                data: Buffer.concat(chunks),
                contentType: nodeRes.headers["content-type"] || "image/jpeg",
                status: nodeRes.statusCode || 502,
              });
            });
            nodeRes.on("error", reject);
          }
        );
        nodeReq.on("error", reject);
        nodeReq.on("timeout", () => {
          nodeReq.destroy();
          reject(new Error("Request timeout"));
        });
        nodeReq.end();
      });

      if (buffer.status < 200 || buffer.status >= 400) {
        return new Response(`Upstream returned ${buffer.status}`, { status: 502 });
      }

      return new Response(new Uint8Array(buffer.data), {
        headers: {
          "Content-Type": buffer.contentType,
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } else {
      // 直连
      res = await fetch(imageUrl, fetchOptions);

      if (!res.ok) {
        return new Response(`Upstream returned ${res.status}`, { status: 502 });
      }

      const contentType = res.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await res.arrayBuffer();

      return new Response(arrayBuffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  } catch (err: any) {
    console.error("[image-proxy] Failed:", err?.message, "url:", imageUrl.substring(0, 100));
    return new Response(err?.message || "Proxy failed", { status: 502 });
  }
}

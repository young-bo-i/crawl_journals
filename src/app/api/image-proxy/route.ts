import http from "node:http";
import https from "node:https";
import { SocksProxyAgent } from "socks-proxy-agent";
import { getDownloadProxy } from "@/app/api/image-search/route";

export const runtime = "nodejs";

/** 明确的非图片 Content-Type，遇到时直接拒绝 */
const REJECT_CONTENT_TYPES = [
  "text/html", "text/plain", "text/xml",
  "application/json", "application/xml",
  "application/xhtml+xml", "application/javascript", "text/css",
];

/** 通过文件魔数 (magic bytes) 检测真实图片类型 */
function detectImageMime(buffer: Buffer | Uint8Array): string | null {
  if (buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return "image/gif";
  if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
      && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return "image/webp";
  return null;
}

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

      // 验证内容确实是图片
      const proxyMime = buffer.contentType.split(";")[0]?.trim() || "";
      if (REJECT_CONTENT_TYPES.some((t) => proxyMime.startsWith(t))) {
        return new Response(`Upstream returned non-image content (${proxyMime})`, { status: 502 });
      }
      const detectedMime = detectImageMime(buffer.data);
      const finalContentType = detectedMime || (proxyMime.startsWith("image/") ? proxyMime : "image/jpeg");

      return new Response(new Uint8Array(buffer.data), {
        headers: {
          "Content-Type": finalContentType,
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

      const contentType = (res.headers.get("content-type") || "").split(";")[0]?.trim() || "";

      // 严格拒绝非图片 Content-Type
      if (REJECT_CONTENT_TYPES.some((t) => contentType.startsWith(t))) {
        return new Response(`Upstream returned non-image content (${contentType})`, { status: 502 });
      }

      const arrayBuffer = await res.arrayBuffer();
      const bufferView = new Uint8Array(arrayBuffer);
      const detectedMime = detectImageMime(bufferView);
      const finalContentType = detectedMime || (contentType.startsWith("image/") ? contentType : "image/jpeg");

      return new Response(arrayBuffer, {
        headers: {
          "Content-Type": finalContentType,
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

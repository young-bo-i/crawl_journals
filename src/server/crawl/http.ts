import https from "node:https";
import http from "node:http";
import { SocksProxyAgent } from "socks-proxy-agent";

export type HttpResult = {
  ok: boolean;
  status: number;
  contentType: string | null;
  headers: Record<string, string>;
  bodyText: string;
};

export type FetchOptions = RequestInit & {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** 可选 SOCKS5 代理，例如 socks5://127.0.0.1:1080 */
  proxyUrl?: string;
};

export async function fetchTextWithTimeout(
  input: string,
  init: FetchOptions,
): Promise<HttpResult> {
  // 有代理时走 Node http/https + SocksProxyAgent
  if (init.proxyUrl) {
    return fetchViaProxy(input, init);
  }

  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? 30_000;
  const timeout = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  try {
    let signal: AbortSignal = controller.signal;
    if (init.signal) {
      const anyFn = (AbortSignal as any)?.any;
      if (typeof anyFn === "function") {
        signal = anyFn([init.signal, controller.signal]) as AbortSignal;
      } else {
        if (init.signal.aborted) controller.abort(init.signal.reason);
        else init.signal.addEventListener("abort", () => controller.abort(init.signal?.reason), { once: true });
        signal = controller.signal;
      }
    }
    const res = await fetch(input, { ...init, signal });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const bodyText = await res.text();
    const contentType = res.headers.get("content-type");
    return {
      ok: res.ok,
      status: res.status,
      contentType,
      headers,
      bodyText,
    } satisfies HttpResult;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 通过 SOCKS5 代理发起 HTTP(S) 请求
 */
function fetchViaProxy(url: string, init: FetchOptions): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const mod = isHttps ? https : http;
    const agent = new SocksProxyAgent(init.proxyUrl!);
    const timeoutMs = init.timeoutMs ?? 30_000;

    // 将 Headers / Record 转为纯 Record<string, string>
    const reqHeaders: Record<string, string> = { Host: parsed.hostname };
    if (init.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { reqHeaders[k] = v; });
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) reqHeaders[k] = v;
      } else {
        Object.assign(reqHeaders, init.headers);
      }
    }

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: (init.method ?? "GET").toUpperCase(),
      headers: reqHeaders,
      timeout: timeoutMs,
      agent,
    };

    let aborted = false;

    const req = mod.request(options, (res) => {
      // 跟随重定向（最多 5 次）
      if (
        res.statusCode &&
        [301, 302, 303, 307, 308].includes(res.statusCode) &&
        res.headers.location
      ) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        fetchViaProxy(redirectUrl, init).then(resolve).catch(reject);
        return;
      }

      let data = "";
      res.setEncoding("utf-8");
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (v) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
        }
        const status = res.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          contentType: res.headers["content-type"] ?? null,
          headers,
          bodyText: data,
        });
      });
    });

    // 外部 AbortSignal 支持
    if (init.signal) {
      if (init.signal.aborted) {
        req.destroy();
        reject(new Error("aborted"));
        return;
      }
      init.signal.addEventListener(
        "abort",
        () => {
          aborted = true;
          req.destroy();
          reject(new Error("aborted"));
        },
        { once: true },
      );
    }

    req.on("error", (err) => {
      if (!aborted) reject(err);
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

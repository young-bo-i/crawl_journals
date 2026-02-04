export type HttpResult = {
  ok: boolean;
  status: number;
  contentType: string | null;
  headers: Record<string, string>;
  bodyText: string;
};

export async function fetchTextWithTimeout(
  input: string,
  init: RequestInit & { timeoutMs?: number; signal?: AbortSignal },
) {
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

import { fetchTextWithTimeout } from "../http";

const CROSSREF_BASE = "https://api.crossref.org";

export async function fetchCrossrefJournal(args: { issn: string; timeoutMs?: number; signal?: AbortSignal }) {
  const mailto = process.env.CROSSREF_MAILTO?.trim();
  const ua = mailto
    ? `crawl_journals/0.1 (mailto:${mailto})`
    : "crawl_journals/0.1 (mailto:PLEASE_SET_CROSSREF_MAILTO)";
  const url = `${CROSSREF_BASE}/journals/${encodeURIComponent(args.issn)}`;
  return fetchTextWithTimeout(url, {
    timeoutMs: args.timeoutMs ?? 30_000,
    signal: args.signal,
    headers: {
      accept: "application/json",
      "user-agent": ua,
    },
  });
}

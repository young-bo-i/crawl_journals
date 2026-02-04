import { fetchTextWithTimeout } from "../http";

const DOAJ_BASE = "https://doaj.org/api/v3";

export async function fetchDoajJournalByIssn(args: { issn: string; timeoutMs?: number; signal?: AbortSignal }) {
  const url = `${DOAJ_BASE}/search/journals/${encodeURIComponent(`issn:${args.issn}`)}`;
  const apiKey = process.env.DOAJ_API_KEY?.trim();
  return fetchTextWithTimeout(url, {
    timeoutMs: args.timeoutMs ?? 30_000,
    signal: args.signal,
    headers: {
      accept: "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      "user-agent": "crawl_journals/0.1",
    },
  });
}

/**
 * 根据期刊标题搜索 DOAJ（用于非 ISSN 期刊）
 * 使用精确匹配标题
 */
export async function fetchDoajJournalByTitle(args: { title: string; timeoutMs?: number; signal?: AbortSignal }) {
  // 使用 bibjson.title 字段进行精确匹配
  const query = `bibjson.title:"${args.title.replace(/"/g, '\\"')}"`;
  const url = `${DOAJ_BASE}/search/journals/${encodeURIComponent(query)}`;
  const apiKey = process.env.DOAJ_API_KEY?.trim();
  return fetchTextWithTimeout(url, {
    timeoutMs: args.timeoutMs ?? 30_000,
    signal: args.signal,
    headers: {
      accept: "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      "user-agent": "crawl_journals/0.1",
    },
  });
}

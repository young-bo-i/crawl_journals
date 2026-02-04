import { fetchTextWithTimeout } from "../http";

const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function baseParams() {
  const params = new URLSearchParams();
  const tool = process.env.NCBI_TOOL?.trim();
  const email = process.env.NCBI_EMAIL?.trim();
  const apiKey = process.env.NCBI_API_KEY?.trim();
  if (tool) params.set("tool", tool);
  if (email) params.set("email", email);
  if (apiKey) params.set("api_key", apiKey);
  return params;
}

export async function fetchNlmEsearch(args: { issn: string; timeoutMs?: number; signal?: AbortSignal }) {
  const params = baseParams();
  params.set("db", "nlmcatalog");
  params.set("term", `${args.issn}[ISSN]`);
  params.set("retmode", "json");
  const url = `${NCBI_BASE}/esearch.fcgi?${params.toString()}`;
  return fetchTextWithTimeout(url, {
    timeoutMs: args.timeoutMs ?? 30_000,
    signal: args.signal,
    headers: { accept: "application/json", "user-agent": "crawl_journals/0.1" },
  });
}

/**
 * 根据期刊标题搜索 NLM Catalog（用于非 ISSN 期刊）
 */
export async function fetchNlmEsearchByTitle(args: { title: string; timeoutMs?: number; signal?: AbortSignal }) {
  const params = baseParams();
  params.set("db", "nlmcatalog");
  // 使用 Title 字段搜索
  params.set("term", `${args.title}[Title]`);
  params.set("retmode", "json");
  const url = `${NCBI_BASE}/esearch.fcgi?${params.toString()}`;
  return fetchTextWithTimeout(url, {
    timeoutMs: args.timeoutMs ?? 30_000,
    signal: args.signal,
    headers: { accept: "application/json", "user-agent": "crawl_journals/0.1" },
  });
}

export async function fetchNlmEsummary(args: { uids: string[]; timeoutMs?: number; signal?: AbortSignal }) {
  const params = baseParams();
  params.set("db", "nlmcatalog");
  params.set("id", args.uids.join(","));
  params.set("retmode", "json");
  const url = `${NCBI_BASE}/esummary.fcgi?${params.toString()}`;
  return fetchTextWithTimeout(url, {
    timeoutMs: args.timeoutMs ?? 30_000,
    signal: args.signal,
    headers: { accept: "application/json", "user-agent": "crawl_journals/0.1" },
  });
}

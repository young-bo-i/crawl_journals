import { fetchTextWithTimeout } from "../http";

export function buildIssnSparql(issn: string) {
  return `
    SELECT ?item ?itemLabel ?officialWebsite WHERE {
      ?item wdt:P236 "${issn}" .
      OPTIONAL { ?item wdt:P856 ?officialWebsite . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en,zh". }
    }
    LIMIT 50
  `.trim();
}

/**
 * 构建按标题搜索的 SPARQL 查询（用于非 ISSN 期刊）
 */
export function buildTitleSparql(title: string) {
  // 转义特殊字符
  const escapedTitle = title.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
  return `
    SELECT ?item ?itemLabel ?officialWebsite WHERE {
      ?item wdt:P31/wdt:P279* wd:Q5633421 .
      ?item rdfs:label ?label .
      FILTER(CONTAINS(LCASE(?label), LCASE("${escapedTitle}")))
      OPTIONAL { ?item wdt:P856 ?officialWebsite . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en,zh". }
    }
    LIMIT 10
  `.trim();
}

export async function fetchWikidataByIssn(args: { issn: string; timeoutMs?: number; signal?: AbortSignal }) {
  const endpoint = (process.env.WIKIDATA_ENDPOINT ?? "https://query.wikidata.org/sparql").trim();
  const query = buildIssnSparql(args.issn);
  const params = new URLSearchParams();
  params.set("format", "json");
  params.set("query", query);
  const url = `${endpoint}?${params.toString()}`;
  return fetchTextWithTimeout(url, {
    timeoutMs: args.timeoutMs ?? 45_000,
    signal: args.signal,
    headers: {
      accept: "application/sparql-results+json",
      "user-agent": "crawl_journals/0.1",
    },
  });
}

/**
 * 根据期刊标题搜索 Wikidata（用于非 ISSN 期刊）
 */
export async function fetchWikidataByTitle(args: { title: string; timeoutMs?: number; signal?: AbortSignal }) {
  const endpoint = (process.env.WIKIDATA_ENDPOINT ?? "https://query.wikidata.org/sparql").trim();
  const query = buildTitleSparql(args.title);
  const params = new URLSearchParams();
  params.set("format", "json");
  params.set("query", query);
  const url = `${endpoint}?${params.toString()}`;
  return fetchTextWithTimeout(url, {
    timeoutMs: args.timeoutMs ?? 45_000,
    signal: args.signal,
    headers: {
      accept: "application/sparql-results+json",
      "user-agent": "crawl_journals/0.1",
    },
  });
}

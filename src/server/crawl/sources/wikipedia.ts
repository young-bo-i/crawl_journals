import { fetchTextWithTimeout } from "../http";

/**
 * Wikipedia 数据源模块
 * 通过 ISSN 或期刊名称查询 Wikipedia 文章，获取摘要、Infobox 和分类信息
 */

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const WIKIPEDIA_REST_API = "https://en.wikipedia.org/api/rest_v1";
const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";

/**
 * 通过 Wikidata SPARQL 查询获取期刊对应的 Wikipedia 文章标题
 */
async function getWikipediaArticleFromWikidata(
  issn: string,
  signal?: AbortSignal
): Promise<string | null> {
  const query = `
    SELECT ?article WHERE {
      ?item wdt:P236 "${issn}" .
      ?article schema:about ?item ;
               schema:isPartOf <https://en.wikipedia.org/> .
    }
    LIMIT 1
  `.trim();

  const params = new URLSearchParams();
  params.set("format", "json");
  params.set("query", query);
  const url = `${WIKIDATA_SPARQL}?${params.toString()}`;

  try {
    const res = await fetchTextWithTimeout(url, {
      timeoutMs: 30000,
      signal,
      headers: {
        accept: "application/sparql-results+json",
        "user-agent": "crawl_journals/0.1",
      },
    });

    if (res.status !== 200) return null;

    const data = JSON.parse(res.bodyText);
    const bindings = data?.results?.bindings;
    if (!Array.isArray(bindings) || bindings.length === 0) return null;

    // 从 Wikipedia URL 提取文章标题
    const articleUrl = bindings[0]?.article?.value;
    if (!articleUrl) return null;

    // URL 格式: https://en.wikipedia.org/wiki/Article_Title
    const match = articleUrl.match(/\/wiki\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * 通过标题搜索 Wikipedia 文章
 */
async function searchWikipediaByTitle(
  title: string,
  signal?: AbortSignal
): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    list: "search",
    srsearch: `"${title}" journal`,
    srlimit: "5",
    srprop: "snippet",
  });

  const url = `${WIKIPEDIA_API}?${params.toString()}`;

  try {
    const res = await fetchTextWithTimeout(url, {
      timeoutMs: 30000,
      signal,
      headers: {
        "user-agent": "crawl_journals/0.1",
      },
    });

    if (res.status !== 200) return null;

    const data = JSON.parse(res.bodyText);
    const results = data?.query?.search;
    if (!Array.isArray(results) || results.length === 0) return null;

    // 尝试找到最匹配的结果（标题完全匹配或包含 "journal"）
    for (const result of results) {
      const resultTitle = result.title?.toLowerCase() || "";
      const searchTitle = title.toLowerCase();
      
      // 完全匹配或包含期刊名
      if (
        resultTitle === searchTitle ||
        resultTitle === `${searchTitle} (journal)` ||
        resultTitle.includes(searchTitle)
      ) {
        return result.title;
      }
    }

    // 如果没有精确匹配，返回第一个结果
    return results[0]?.title || null;
  } catch {
    return null;
  }
}

/**
 * 获取 Wikipedia 页面摘要（REST API）
 */
async function fetchPageSummary(
  articleTitle: string,
  signal?: AbortSignal
): Promise<{
  title: string;
  extract: string;
  description: string | null;
  thumbnail: string | null;
} | null> {
  const encodedTitle = encodeURIComponent(articleTitle.replace(/ /g, "_"));
  const url = `${WIKIPEDIA_REST_API}/page/summary/${encodedTitle}`;

  try {
    const res = await fetchTextWithTimeout(url, {
      timeoutMs: 30000,
      signal,
      headers: {
        "user-agent": "crawl_journals/0.1",
      },
    });

    if (res.status !== 200) return null;

    const data = JSON.parse(res.bodyText);
    return {
      title: data.title || articleTitle,
      extract: data.extract || "",
      description: data.description || null,
      thumbnail: data.thumbnail?.source || null,
    };
  } catch {
    return null;
  }
}

/**
 * 获取 Wikipedia 页面分类
 */
async function fetchPageCategories(
  articleTitle: string,
  signal?: AbortSignal
): Promise<string[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "categories",
    titles: articleTitle,
    cllimit: "50",
    clshow: "!hidden",
  });

  const url = `${WIKIPEDIA_API}?${params.toString()}`;

  try {
    const res = await fetchTextWithTimeout(url, {
      timeoutMs: 30000,
      signal,
      headers: {
        "user-agent": "crawl_journals/0.1",
      },
    });

    if (res.status !== 200) return [];

    const data = JSON.parse(res.bodyText);
    const pages = data?.query?.pages;
    if (!pages) return [];

    const pageData = Object.values(pages)[0] as any;
    const categories = pageData?.categories;
    if (!Array.isArray(categories)) return [];

    return categories
      .map((c: any) => c.title?.replace(/^Category:/, "") || "")
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 获取 Wikipedia 页面的 Infobox 数据
 */
async function fetchPageInfobox(
  articleTitle: string,
  signal?: AbortSignal
): Promise<Record<string, string>> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "revisions",
    titles: articleTitle,
    rvprop: "content",
    rvslots: "main",
  });

  const url = `${WIKIPEDIA_API}?${params.toString()}`;

  try {
    const res = await fetchTextWithTimeout(url, {
      timeoutMs: 30000,
      signal,
      headers: {
        "user-agent": "crawl_journals/0.1",
      },
    });

    if (res.status !== 200) return {};

    const data = JSON.parse(res.bodyText);
    const pages = data?.query?.pages;
    if (!pages) return {};

    const pageData = Object.values(pages)[0] as any;
    const content = pageData?.revisions?.[0]?.slots?.main?.["*"];
    if (!content) return {};

    return parseInfobox(content);
  } catch {
    return {};
  }
}

/**
 * 解析 Wikitext 中的 Infobox
 */
function parseInfobox(wikitext: string): Record<string, string> {
  const result: Record<string, string> = {};

  // 匹配 Infobox journal 或类似模板
  const infoboxMatch = wikitext.match(
    /\{\{Infobox\s+(?:journal|magazine|periodical)[^}]*\}\}/is
  );
  if (!infoboxMatch) return result;

  const infoboxContent = infoboxMatch[0];

  // 提取字段（格式：| field = value）
  const fieldRegex = /\|\s*(\w+)\s*=\s*([^|{}]*?)(?=\s*(?:\||}}|$))/g;
  let match;
  while ((match = fieldRegex.exec(infoboxContent)) !== null) {
    const key = match[1].trim().toLowerCase();
    let value = match[2].trim();

    // 清理 wiki 标记
    value = value
      .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2") // [[link|text]] -> text
      .replace(/\[\[([^\]]+)\]\]/g, "$1") // [[link]] -> link
      .replace(/\{\{[^}]+\}\}/g, "") // 移除模板
      .replace(/<[^>]+>/g, "") // 移除 HTML 标签
      .replace(/'''?/g, "") // 移除粗体/斜体
      .trim();

    if (value) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * 组合结果格式
 */
export interface WikipediaResult {
  article_title: string;
  extract: string;
  description: string | null;
  thumbnail: string | null;
  categories: string[];
  infobox: Record<string, string>;
  source_method: "issn" | "title_search";
}

/**
 * 通过 ISSN 查询 Wikipedia（优先方式）
 */
export async function fetchWikipediaByIssn(args: {
  issn: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{ status: number; bodyText: string }> {
  try {
    // 1. 通过 Wikidata 获取 Wikipedia 文章标题
    const articleTitle = await getWikipediaArticleFromWikidata(
      args.issn,
      args.signal
    );

    if (!articleTitle) {
      return {
        status: 404,
        bodyText: JSON.stringify({ error: "No Wikipedia article found for this ISSN" }),
      };
    }

    // 2. 获取页面数据
    const [summary, categories, infobox] = await Promise.all([
      fetchPageSummary(articleTitle, args.signal),
      fetchPageCategories(articleTitle, args.signal),
      fetchPageInfobox(articleTitle, args.signal),
    ]);

    if (!summary) {
      return {
        status: 404,
        bodyText: JSON.stringify({ error: "Failed to fetch Wikipedia page" }),
      };
    }

    const result: WikipediaResult = {
      article_title: summary.title,
      extract: summary.extract,
      description: summary.description,
      thumbnail: summary.thumbnail,
      categories,
      infobox,
      source_method: "issn",
    };

    return {
      status: 200,
      bodyText: JSON.stringify(result),
    };
  } catch (err: any) {
    return {
      status: 500,
      bodyText: JSON.stringify({ error: err?.message || "Unknown error" }),
    };
  }
}

/**
 * 通过期刊名称查询 Wikipedia（备用方式）
 */
export async function fetchWikipediaByTitle(args: {
  title: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{ status: number; bodyText: string }> {
  try {
    // 1. 搜索 Wikipedia 文章
    const articleTitle = await searchWikipediaByTitle(args.title, args.signal);

    if (!articleTitle) {
      return {
        status: 404,
        bodyText: JSON.stringify({ error: "No Wikipedia article found for this title" }),
      };
    }

    // 2. 获取页面数据
    const [summary, categories, infobox] = await Promise.all([
      fetchPageSummary(articleTitle, args.signal),
      fetchPageCategories(articleTitle, args.signal),
      fetchPageInfobox(articleTitle, args.signal),
    ]);

    if (!summary) {
      return {
        status: 404,
        bodyText: JSON.stringify({ error: "Failed to fetch Wikipedia page" }),
      };
    }

    const result: WikipediaResult = {
      article_title: summary.title,
      extract: summary.extract,
      description: summary.description,
      thumbnail: summary.thumbnail,
      categories,
      infobox,
      source_method: "title_search",
    };

    return {
      status: 200,
      bodyText: JSON.stringify(result),
    };
  } catch (err: any) {
    return {
      status: 500,
      bodyText: JSON.stringify({ error: err?.message || "Unknown error" }),
    };
  }
}

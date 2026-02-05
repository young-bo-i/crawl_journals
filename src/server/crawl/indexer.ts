import type { SourceName, JournalRow } from "@/server/db/repo";
import { tryParseJson } from "@/server/util/json";

/**
 * 从 OpenAlex API 响应中提取期刊数据
 */
export function extractOpenAlex(bodyText: string | null): Partial<JournalRow> {
  const json = tryParseJson<any>(bodyText);
  if (!json) return {};
  
  // 提取 OpenAlex ID（去掉 URL 前缀）
  const id = json.id ? String(json.id).replace("https://openalex.org/", "") : null;
  if (!id) return {};
  
  // 提取 ISSN 列表
  const issns = Array.isArray(json.issn) ? json.issn.filter((i: any) => typeof i === "string") : null;
  
  return {
    id,
    issn_l: json.issn_l ?? null,
    issns,
    
    // OpenAlex 字段（带 oa_ 前缀）
    oa_display_name: json.display_name ?? null,
    oa_type: json.type ?? null,
    oa_alternate_titles: Array.isArray(json.alternate_titles) ? json.alternate_titles : null,
    oa_host_organization: json.host_organization_name ?? json.publisher ?? null,
    oa_host_organization_lineage: Array.isArray(json.host_organization_lineage) ? json.host_organization_lineage : null,
    oa_works_count: typeof json.works_count === "number" ? json.works_count : null,
    oa_cited_by_count: typeof json.cited_by_count === "number" ? json.cited_by_count : null,
    oa_works_api_url: json.works_api_url ?? null,
    oa_apc_prices: Array.isArray(json.apc_prices) ? json.apc_prices : null,
    oa_apc_usd: typeof json.apc_usd === "number" ? json.apc_usd : null,
    oa_counts_by_year: Array.isArray(json.counts_by_year) ? json.counts_by_year : null,
    oa_first_publication_year: typeof json.first_publication_year === "number" ? json.first_publication_year : null,
    oa_last_publication_year: typeof json.last_publication_year === "number" ? json.last_publication_year : null,
    oa_is_core: typeof json.is_core === "boolean" ? json.is_core : null,
    oa_is_oa: typeof json.is_oa === "boolean" ? json.is_oa : null,
    oa_is_high_oa_rate: typeof json.is_high_oa_rate === "boolean" ? json.is_high_oa_rate : null,
    oa_is_high_oa_rate_since_year: typeof json.is_high_oa_rate_since_year === "number" ? json.is_high_oa_rate_since_year : null,
    oa_is_in_doaj: typeof json.is_in_doaj === "boolean" ? json.is_in_doaj : null,
    oa_is_in_doaj_since_year: typeof json.is_in_doaj_since_year === "number" ? json.is_in_doaj_since_year : null,
    oa_is_in_scielo: typeof json.is_in_scielo === "boolean" ? json.is_in_scielo : null,
    oa_is_ojs: typeof json.is_ojs === "boolean" ? json.is_ojs : null,
    oa_oa_flip_year: typeof json.oa_flip_year === "number" ? json.oa_flip_year : null,
    oa_oa_works_count: typeof json.oa_works_count === "number" ? json.oa_works_count : null,
    oa_societies: Array.isArray(json.societies) ? json.societies : null,
    oa_summary_stats: json.summary_stats && typeof json.summary_stats === "object" ? json.summary_stats : null,
    oa_topics: Array.isArray(json.topics) ? json.topics : null,
    oa_topic_share: Array.isArray(json.topic_share) ? json.topic_share : null,
    oa_ids: json.ids && typeof json.ids === "object" ? json.ids : null,
    oa_created_date: json.created_date ?? null,
    oa_updated_date: json.updated_date ?? null,
  };
}

/**
 * 从 Crossref API 响应中提取期刊数据
 */
export function extractCrossref(bodyText: string | null): Partial<JournalRow> {
  const json = tryParseJson<any>(bodyText);
  const msg = json?.message;
  if (!msg) return {};
  
  return {
    cr_title: Array.isArray(msg.title) ? msg.title[0] : msg.title ?? null,
    cr_publisher: msg.publisher ?? null,
    cr_subjects: Array.isArray(msg.subject) ? msg.subject : (Array.isArray(msg.subjects) ? msg.subjects : null),
    cr_issn_types: Array.isArray(msg["issn-type"]) ? msg["issn-type"] : null,
    cr_url: msg.URL ?? null,
    cr_last_status_check_time: typeof msg["last-status-check-time"] === "number" ? msg["last-status-check-time"] : null,
    cr_counts: msg.counts && typeof msg.counts === "object" ? msg.counts : null,
    cr_breakdowns: msg.breakdowns && typeof msg.breakdowns === "object" ? msg.breakdowns : null,
    cr_coverage: msg.coverage && typeof msg.coverage === "object" ? msg.coverage : null,
    cr_coverage_type: msg["coverage-type"] && typeof msg["coverage-type"] === "object" ? msg["coverage-type"] : null,
    cr_flags: msg.flags && typeof msg.flags === "object" ? msg.flags : null,
  };
}

/**
 * 从 DOAJ API 响应中提取期刊数据
 */
export function extractDoaj(bodyText: string | null): Partial<JournalRow> & { inDoaj: boolean } {
  const json = tryParseJson<any>(bodyText);
  const first = json?.results?.[0];
  const bib = first?.bibjson;
  if (!bib) return { inDoaj: false };
  
  return {
    inDoaj: true,
    doaj_title: bib.title ?? null,
    doaj_publisher: bib.publisher ?? null,
    doaj_country: bib.country ?? null,
    doaj_languages: Array.isArray(bib.language) ? bib.language : (bib.language ? [bib.language] : null),
    doaj_subjects: Array.isArray(bib.subject) ? bib.subject : null,
    doaj_links: Array.isArray(bib.link) ? bib.link : null,
    doaj_apc: bib.apc && typeof bib.apc === "object" ? bib.apc : null,
    doaj_license: Array.isArray(bib.license) ? bib.license : null,
    doaj_alternative_title: bib.alternative_title ?? null,
    doaj_article: bib.article && typeof bib.article === "object" ? bib.article : null,
    doaj_boai: typeof bib.boai === "boolean" ? bib.boai : null,
    doaj_copyright: bib.copyright && typeof bib.copyright === "object" ? bib.copyright : null,
    doaj_deposit_policy: Array.isArray(bib.deposit_policy) ? bib.deposit_policy : null,
    doaj_discontinued_date: bib.discontinued_date ?? null,
    doaj_editorial: bib.editorial && typeof bib.editorial === "object" ? bib.editorial : null,
    doaj_eissn: bib.eissn ?? null,
    doaj_pissn: bib.pissn ?? null,
    doaj_institution: bib.institution && typeof bib.institution === "object" ? bib.institution : null,
    doaj_is_replaced_by: Array.isArray(bib.is_replaced_by) ? bib.is_replaced_by : null,
    doaj_keywords: Array.isArray(bib.keywords) ? bib.keywords : null,
    doaj_labels: Array.isArray(bib.labels) ? bib.labels : null,
    doaj_oa_start: bib.oa_start && typeof bib.oa_start === "object" ? bib.oa_start : null,
    doaj_other_charges: bib.other_charges && typeof bib.other_charges === "object" ? bib.other_charges : null,
    doaj_pid_scheme: Array.isArray(bib.pid_scheme) ? bib.pid_scheme : null,
    doaj_plagiarism: bib.plagiarism && typeof bib.plagiarism === "object" ? bib.plagiarism : null,
    doaj_preservation: bib.preservation && typeof bib.preservation === "object" ? bib.preservation : null,
    doaj_publication_time_weeks: typeof bib.publication_time_weeks === "number" ? bib.publication_time_weeks : null,
    doaj_ref: bib.ref && typeof bib.ref === "object" ? bib.ref : null,
    doaj_replaces: Array.isArray(bib.replaces) ? bib.replaces : null,
    doaj_waiver: bib.waiver && typeof bib.waiver === "object" ? bib.waiver : null,
  };
}

/**
 * 从 NLM ESearch API 响应中提取数据
 */
export function extractNlmEsearch(bodyText: string | null): { inNlm: boolean; uids: string[] } {
  const json = tryParseJson<any>(bodyText);
  const ids = json?.esearchresult?.idlist;
  if (!Array.isArray(ids) || ids.length === 0) return { inNlm: false, uids: [] };
  return { inNlm: true, uids: ids.map(String) };
}

/**
 * 从 Wikidata SPARQL 响应中提取数据
 */
export function extractWikidata(bodyText: string | null): Partial<JournalRow> & { hasWikidata: boolean } {
  const json = tryParseJson<any>(bodyText);
  const bindings = json?.results?.bindings;
  if (!Array.isArray(bindings) || bindings.length === 0) {
    return { hasWikidata: false, wikidata_has_entity: false };
  }
  
  const homepage = bindings
    .map((b: any) => b?.officialWebsite?.value ?? b?.homepage?.value ?? null)
    .find((x: any) => typeof x === "string" && x.startsWith("http"));
  
  return {
    hasWikidata: true,
    wikidata_has_entity: true,
    wikidata_homepage: homepage ?? null,
  };
}

/**
 * 从 Wikipedia API 响应中提取数据
 */
export function extractWikipedia(bodyText: string | null): Partial<JournalRow> & { hasWikipedia: boolean } {
  const json = tryParseJson<any>(bodyText);
  if (!json || json.error) return { hasWikipedia: false, wikipedia_has_article: false };
  if (!json.article_title && !json.extract) return { hasWikipedia: false, wikipedia_has_article: false };
  
  return {
    hasWikipedia: true,
    wikipedia_has_article: true,
    wikipedia_article_title: json.article_title ?? null,
    wikipedia_extract: json.extract ?? null,
    wikipedia_description: json.description ?? null,
    wikipedia_thumbnail: json.thumbnail ?? null,
    wikipedia_categories: Array.isArray(json.categories) ? json.categories : null,
    wikipedia_infobox: json.infobox && typeof json.infobox === "object" ? json.infobox : null,
  };
}

/**
 * 合并各数据源的数据，生成聚合后的期刊数据
 * @param args.existing - 已有的期刊数据（包含 OpenAlex 数据，用于流水线模式）
 * @param args.openalex - OpenAlex 数据（用于非流水线模式）
 */
export function mergeJournalData(args: {
  existing?: Partial<JournalRow>;
  openalex?: Partial<JournalRow>;
  crossref?: Partial<JournalRow>;
  doaj?: Partial<JournalRow> & { inDoaj?: boolean };
  nlm?: { inNlm: boolean; uids: string[] };
  wikidata?: Partial<JournalRow> & { hasWikidata?: boolean };
  wikipedia?: Partial<JournalRow> & { hasWikipedia?: boolean };
}): Partial<JournalRow> {
  const fieldSources: Record<string, SourceName> = {};
  
  // 使用 existing 或 openalex 作为基础数据
  const baseData = args.existing ?? args.openalex;
  
  // 辅助函数：从多个候选值中选择第一个有效值
  function pick<T>(candidates: Array<{ v: T | null | undefined; s: SourceName }>): { v: T | null; s?: SourceName } {
    for (const c of candidates) {
      if (c.v === null || c.v === undefined) continue;
      if (typeof c.v === "string" && c.v.trim() === "") continue;
      return { v: c.v as T, s: c.s };
    }
    return { v: null };
  }
  
  // 合并字符串数组并去重
  function uniqStrings(items: Array<string | null | undefined>): string[] {
    const set = new Set<string>();
    for (const it of items) {
      if (!it) continue;
      const v = String(it).trim();
      if (!v) continue;
      set.add(v);
    }
    return Array.from(set);
  }
  
  // 聚合核心字段
  const title = pick<string>([
    { v: args.doaj?.doaj_title ?? null, s: "doaj" },
    { v: args.crossref?.cr_title ?? null, s: "crossref" },
    { v: baseData?.oa_display_name ?? null, s: "openalex" },
  ]);
  if (title.s) fieldSources.title = title.s;
  
  const publisher = pick<string>([
    { v: args.crossref?.cr_publisher ?? null, s: "crossref" },
    { v: args.doaj?.doaj_publisher ?? null, s: "doaj" },
    { v: baseData?.oa_host_organization ?? null, s: "openalex" },
  ]);
  if (publisher.s) fieldSources.publisher = publisher.s;
  
  const country = pick<string>([
    { v: args.doaj?.doaj_country ?? null, s: "doaj" },
  ]);
  if (country.s) fieldSources.country = country.s;
  
  const homepage = pick<string>([
    { v: (args.doaj?.doaj_links as any[])?.find((l: any) => l?.type === "homepage")?.url ?? null, s: "doaj" },
    { v: args.wikidata?.wikidata_homepage ?? null, s: "wikidata" },
  ]);
  if (homepage.s) fieldSources.homepage = homepage.s;
  
  // 合并语言
  const languages = uniqStrings([
    ...(args.doaj?.doaj_languages ?? []),
  ]);
  if (languages.length > 0) fieldSources.languages = "doaj";
  
  // 合并学科/主题
  const doajSubjects = (args.doaj?.doaj_subjects as any[])?.map((s: any) => s?.term).filter(Boolean) ?? [];
  const crSubjects = args.crossref?.cr_subjects ?? [];
  const subjects = uniqStrings([...doajSubjects, ...(crSubjects as string[])]);
  if (subjects.length > 0) {
    fieldSources.subjects = doajSubjects.length > 0 ? "doaj" : "crossref";
  }
  
  // OA 状态
  const isOpenAccess = pick<boolean>([
    { v: args.doaj?.inDoaj === true ? true : null, s: "doaj" },
    { v: baseData?.oa_is_oa ?? null, s: "openalex" },
  ]);
  if (isOpenAccess.s) fieldSources.is_open_access = isOpenAccess.s;
  
  // 合并结果（保留已有的 OpenAlex 字段）
  const result: Partial<JournalRow> = {
    // 从已有数据获取 OpenAlex 基础信息
    ...baseData,
    
    // 从 Crossref 获取信息
    ...args.crossref,
    
    // 从 DOAJ 获取信息
    ...args.doaj,
    
    // 从 Wikidata 获取信息
    ...args.wikidata,
    
    // 从 Wikipedia 获取信息
    ...args.wikipedia,
    
    // 聚合后的核心字段
    title: title.v,
    publisher: publisher.v,
    country: country.v,
    homepage: homepage.v,
    languages: languages.length > 0 ? languages : null,
    subjects: subjects.length > 0 ? subjects : null,
    is_open_access: isOpenAccess.v,
    
    // NLM 状态
    nlm_in_catalog: args.nlm?.inNlm ?? false,
    nlm_uids: args.nlm?.uids?.length ? args.nlm.uids : null,
    
    // Wikidata 状态
    wikidata_has_entity: args.wikidata?.hasWikidata ?? false,
    
    // Wikipedia 状态
    wikipedia_has_article: args.wikipedia?.hasWikipedia ?? false,
    
    // 字段来源记录
    field_sources: Object.keys(fieldSources).length > 0 ? fieldSources : null,
  };
  
  // 删除临时字段
  delete (result as any).inDoaj;
  delete (result as any).hasWikidata;
  delete (result as any).hasWikipedia;
  
  return result;
}

/**
 * 从 OpenAlex 列表响应中提取期刊 ID 和 ISSN 信息
 */
export function extractOpenAlexListItem(item: any): {
  id: string;
  issn_l: string | null;
  issns: string[];
  display_name: string | null;
} | null {
  if (!item || !item.id) return null;
  
  const id = String(item.id).replace("https://openalex.org/", "");
  const issns = Array.isArray(item.issn) ? item.issn.filter((i: any) => typeof i === "string") : [];
  
  return {
    id,
    issn_l: item.issn_l ?? null,
    issns,
    display_name: item.display_name ?? null,
  };
}

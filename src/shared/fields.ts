/**
 * 期刊字段字典 - 用于 API 文档和导出
 * 基于 indexer.ts 中的字段提取逻辑
 */

export const fieldDict = [
  // 基础信息（ID、ISSN）
  { key: "id", label: "OpenAlex ID", desc: "OpenAlex 平台的唯一标识符（如 S4210228046）", category: "basic" },
  { key: "issn_l", label: "ISSN-L", desc: "链接 ISSN（Linking ISSN）", category: "basic" },
  { key: "issns", label: "ISSN 列表", desc: "所有关联的 ISSN（JSON 数组）", category: "basic" },

  // OpenAlex 数据（基础数据来源）
  { key: "oa_display_name", label: "期刊名称", desc: "OpenAlex 中的期刊显示名称", category: "openalex" },
  { key: "oa_type", label: "类型", desc: "期刊类型（journal/repository等）", category: "openalex" },
  { key: "oa_alternate_titles", label: "备选标题", desc: "期刊备选名称列表（JSON 数组）", category: "openalex" },
  { key: "oa_host_organization", label: "出版机构", desc: "出版商/宿主组织名称", category: "openalex" },
  { key: "oa_host_organization_id", label: "出版机构ID", desc: "出版商/宿主组织 OpenAlex ID", category: "openalex" },
  { key: "oa_host_organization_lineage", label: "组织层级", desc: "宿主组织的层级结构（JSON 数组）", category: "openalex" },
  { key: "oa_country_code", label: "国家/地区", desc: "国家/地区代码", category: "openalex" },
  { key: "oa_homepage_url", label: "主页", desc: "期刊官网 URL", category: "openalex" },
  { key: "oa_works_count", label: "作品数", desc: "OpenAlex 收录的作品总数", category: "openalex" },
  { key: "oa_cited_by_count", label: "被引数", desc: "被引用总次数", category: "openalex" },
  { key: "oa_works_api_url", label: "作品API", desc: "获取该期刊作品的 API 地址", category: "openalex" },
  { key: "oa_apc_prices", label: "APC价格列表", desc: "各币种 APC 价格（JSON 数组）", category: "openalex" },
  { key: "oa_apc_usd", label: "APC(USD)", desc: "APC 价格（美元）", category: "openalex" },
  { key: "oa_counts_by_year", label: "年度统计", desc: "各年度作品数和被引数（JSON 数组）", category: "openalex" },
  { key: "oa_first_publication_year", label: "首发年份", desc: "最早发表年份", category: "openalex" },
  { key: "oa_last_publication_year", label: "末发年份", desc: "最近发表年份", category: "openalex" },
  { key: "oa_is_core", label: "核心期刊", desc: "是否为核心期刊", category: "openalex" },
  { key: "oa_is_oa", label: "OA期刊", desc: "是否为开放获取期刊", category: "openalex" },
  { key: "oa_is_high_oa_rate", label: "高OA率", desc: "是否为高开放获取率期刊", category: "openalex" },
  { key: "oa_is_high_oa_rate_since_year", label: "高OA率起始年", desc: "开始达到高OA率的年份", category: "openalex" },
  { key: "oa_is_in_doaj", label: "DOAJ收录", desc: "是否被 DOAJ 收录", category: "openalex" },
  { key: "oa_is_in_doaj_since_year", label: "DOAJ收录年", desc: "加入 DOAJ 的年份", category: "openalex" },
  { key: "oa_is_in_scielo", label: "SciELO", desc: "是否被 SciELO 收录", category: "openalex" },
  { key: "oa_is_ojs", label: "OJS平台", desc: "是否使用 OJS 平台", category: "openalex" },
  { key: "oa_oa_flip_year", label: "OA转型年", desc: "转为开放获取的年份", category: "openalex" },
  { key: "oa_oa_works_count", label: "OA作品数", desc: "开放获取作品数量", category: "openalex" },
  { key: "oa_societies", label: "学会组织", desc: "关联的学会/学术组织（JSON 数组）", category: "openalex" },
  { key: "oa_summary_stats", label: "汇总统计", desc: "各类汇总统计数据（JSON 对象）", category: "openalex" },
  { key: "oa_topics", label: "主题", desc: "期刊主题领域（JSON 数组）", category: "openalex" },
  { key: "oa_topic_share", label: "主题分布", desc: "各主题占比（JSON 数组）", category: "openalex" },
  { key: "oa_ids", label: "外部ID", desc: "各平台标识符（ISSN、Wikidata等，JSON 对象）", category: "openalex" },
  { key: "oa_created_date", label: "OA创建日期", desc: "OpenAlex 记录创建日期", category: "openalex" },
  { key: "oa_updated_date", label: "OA更新日期", desc: "OpenAlex 记录更新日期", category: "openalex" },

  // Crossref 数据
  { key: "cr_title", label: "CR标题", desc: "Crossref 中的期刊标题", category: "crossref" },
  { key: "cr_publisher", label: "CR出版社", desc: "Crossref 中的出版社名称", category: "crossref" },
  { key: "cr_subjects", label: "CR学科", desc: "Crossref 学科分类（JSON 数组）", category: "crossref" },
  { key: "cr_issn_types", label: "ISSN类型", desc: "各 ISSN 的类型（JSON 数组）", category: "crossref" },
  { key: "cr_url", label: "CR链接", desc: "Crossref 中的期刊链接", category: "crossref" },
  { key: "cr_last_status_check_time", label: "状态检查时间", desc: "最后状态检查的 Unix 时间戳", category: "crossref" },
  { key: "cr_counts", label: "DOI统计", desc: "DOI 数量统计（JSON 对象）", category: "crossref" },
  { key: "cr_breakdowns", label: "细分统计", desc: "DOI 细分数据（JSON 对象）", category: "crossref" },
  { key: "cr_coverage", label: "覆盖率", desc: "元数据覆盖率（JSON 对象）", category: "crossref" },
  { key: "cr_coverage_type", label: "覆盖率类型", desc: "按类型划分的覆盖率（JSON 对象）", category: "crossref" },
  { key: "cr_flags", label: "标志位", desc: "Crossref 标志位（JSON 对象）", category: "crossref" },

  // DOAJ 数据
  { key: "doaj_title", label: "DOAJ标题", desc: "DOAJ 中的期刊标题", category: "doaj" },
  { key: "doaj_alternative_title", label: "DOAJ备选标题", desc: "DOAJ 备选期刊名", category: "doaj" },
  { key: "doaj_publisher", label: "DOAJ出版社", desc: "DOAJ 中的出版社名称", category: "doaj" },
  { key: "doaj_country", label: "DOAJ国家", desc: "DOAJ 中的国家/地区", category: "doaj" },
  { key: "doaj_languages", label: "DOAJ语种", desc: "DOAJ 收录的语种（JSON 数组）", category: "doaj" },
  { key: "doaj_subjects", label: "DOAJ学科", desc: "DOAJ 学科分类（JSON 数组）", category: "doaj" },
  { key: "doaj_keywords", label: "关键词", desc: "DOAJ 关键词（JSON 数组）", category: "doaj" },
  { key: "doaj_links", label: "相关链接", desc: "期刊相关链接（JSON 数组）", category: "doaj" },
  { key: "doaj_eissn", label: "电子ISSN", desc: "电子版 ISSN", category: "doaj" },
  { key: "doaj_pissn", label: "印刷ISSN", desc: "印刷版 ISSN", category: "doaj" },
  { key: "doaj_apc", label: "APC信息", desc: "文章处理费信息（JSON 对象）", category: "doaj" },
  { key: "doaj_license", label: "许可证", desc: "开放获取许可证（JSON 数组）", category: "doaj" },
  { key: "doaj_boai", label: "BOAI兼容", desc: "是否符合 BOAI 标准", category: "doaj" },
  { key: "doaj_article", label: "文章信息", desc: "文章处理相关信息（JSON 对象）", category: "doaj" },
  { key: "doaj_copyright", label: "版权信息", desc: "版权归属信息（JSON 对象）", category: "doaj" },
  { key: "doaj_deposit_policy", label: "存储政策", desc: "存储/存档政策（JSON 数组）", category: "doaj" },
  { key: "doaj_editorial", label: "编辑信息", desc: "编辑委员会信息（JSON 对象）", category: "doaj" },
  { key: "doaj_institution", label: "所属机构", desc: "关联机构信息（JSON 对象）", category: "doaj" },
  { key: "doaj_plagiarism", label: "查重政策", desc: "抄袭检测政策（JSON 对象）", category: "doaj" },
  { key: "doaj_preservation", label: "长期保存", desc: "数字保存服务（JSON 对象）", category: "doaj" },
  { key: "doaj_publication_time_weeks", label: "出版周期(周)", desc: "从投稿到发表的周数", category: "doaj" },
  { key: "doaj_discontinued_date", label: "停刊日期", desc: "期刊停刊日期", category: "doaj" },
  { key: "doaj_is_replaced_by", label: "被替代", desc: "替代此期刊的期刊（JSON 数组）", category: "doaj" },
  { key: "doaj_replaces", label: "替代", desc: "此期刊替代的期刊（JSON 数组）", category: "doaj" },
  { key: "doaj_labels", label: "标签", desc: "DOAJ 标签（JSON 数组）", category: "doaj" },
  { key: "doaj_oa_start", label: "OA起始", desc: "开始开放获取的时间（JSON 对象）", category: "doaj" },
  { key: "doaj_other_charges", label: "其他费用", desc: "其他收费项目（JSON 对象）", category: "doaj" },
  { key: "doaj_pid_scheme", label: "标识符方案", desc: "使用的持久标识符（JSON 数组）", category: "doaj" },
  { key: "doaj_ref", label: "引用政策", desc: "参考文献相关政策（JSON 对象）", category: "doaj" },
  { key: "doaj_waiver", label: "费用减免", desc: "APC 减免政策（JSON 对象）", category: "doaj" },

  // NLM 数据
  { key: "nlm_in_catalog", label: "NLM收录", desc: "是否被 NLM Catalog 收录", category: "nlm" },
  { key: "nlm_uids", label: "NLM UIDs", desc: "NLM 唯一标识符列表（JSON 数组）", category: "nlm" },

  // Wikidata 数据
  { key: "wikidata_has_entity", label: "Wikidata", desc: "是否有 Wikidata 实体", category: "wikidata" },
  { key: "wikidata_homepage", label: "WD主页", desc: "Wikidata 中的官网链接", category: "wikidata" },

  // Wikipedia 数据
  { key: "wikipedia_has_article", label: "Wikipedia", desc: "是否有 Wikipedia 条目", category: "wikipedia" },
  { key: "wikipedia_article_title", label: "Wiki标题", desc: "Wikipedia 条目标题", category: "wikipedia" },
  { key: "wikipedia_extract", label: "Wiki摘要", desc: "Wikipedia 条目摘要（TEXT）", category: "wikipedia" },
  { key: "wikipedia_description", label: "Wiki描述", desc: "Wikipedia 简短描述", category: "wikipedia" },
  { key: "wikipedia_thumbnail", label: "Wiki缩略图", desc: "Wikipedia 缩略图 URL", category: "wikipedia" },
  { key: "wikipedia_categories", label: "Wiki分类", desc: "Wikipedia 分类列表（JSON 数组）", category: "wikipedia" },
  { key: "wikipedia_infobox", label: "Wiki信息框", desc: "Wikipedia 信息框数据（JSON 对象）", category: "wikipedia" },

  // 元信息
  { key: "created_at", label: "创建时间", desc: "记录创建时间", category: "meta" },
  { key: "updated_at", label: "更新时间", desc: "记录最后更新时间", category: "meta" },
] as const;

// 获取所有字段的 key 列表
export const ALL_FIELD_KEYS = fieldDict.map(f => f.key);

// 按分类分组
export function getFieldsByCategory() {
  const result: Record<string, typeof fieldDict[number][]> = {};
  for (const field of fieldDict) {
    if (!result[field.category]) {
      result[field.category] = [];
    }
    result[field.category].push(field);
  }
  return result;
}

// 分类标签
export const CATEGORY_LABELS: Record<string, string> = {
  basic: "基础信息",
  openalex: "OpenAlex",
  crossref: "Crossref",
  doaj: "DOAJ",
  nlm: "NLM",
  wikidata: "Wikidata",
  wikipedia: "Wikipedia",
  meta: "元信息",
};

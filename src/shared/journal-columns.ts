/**
 * 期刊列表可显示的列定义
 * 基于 indexer.ts 中的字段提取逻辑，包含所有从各数据源抓取的字段
 */

export type ColumnType = "string" | "number" | "boolean" | "date" | "json" | "url" | "text";

export type ColumnCategory = 
  | "basic"      // 基础信息（聚合后的核心字段）
  | "custom"     // 用户自定义字段
  | "openalex"   // OpenAlex 数据
  | "crossref"   // Crossref 数据
  | "doaj"       // DOAJ 数据
  | "nlm"        // NLM 数据
  | "wikidata"   // Wikidata 数据
  | "wikipedia"  // Wikipedia 数据
  | "meta";      // 元信息

export interface ColumnDef {
  key: string;
  label: string;
  category: ColumnCategory;
  type: ColumnType;
  description?: string;
  sortable?: boolean;
  filterable?: boolean;
  defaultVisible?: boolean;
  width?: number;
}

// 列分类标签
export const CATEGORY_LABELS: Record<ColumnCategory, string> = {
  basic: "基础信息",
  custom: "自定义",
  openalex: "OpenAlex",
  crossref: "Crossref",
  doaj: "DOAJ",
  nlm: "NLM",
  wikidata: "Wikidata",
  wikipedia: "Wikipedia",
  meta: "元信息",
};

// 所有可用列定义（基于 indexer.ts 中的字段提取）
export const ALL_COLUMNS: ColumnDef[] = [
  // =============================================
  // 基础信息（聚合后的核心字段）
  // =============================================
  { key: "id", label: "OpenAlex ID", category: "basic", type: "string", sortable: true, defaultVisible: true, width: 140, description: "OpenAlex 平台唯一标识符" },
  { key: "issn_l", label: "ISSN-L", category: "basic", type: "string", sortable: true, defaultVisible: true, width: 100, description: "链接 ISSN" },
  { key: "issns", label: "ISSN 列表", category: "basic", type: "json", width: 150, description: "所有关联的 ISSN" },
  { key: "title", label: "标题", category: "basic", type: "string", sortable: true, defaultVisible: true, width: 250, description: "聚合后的期刊标题（DOAJ > Crossref > OpenAlex）" },
  { key: "publisher", label: "出版社", category: "basic", type: "string", sortable: true, defaultVisible: true, width: 180, description: "聚合后的出版社（Crossref > DOAJ > OpenAlex）" },
  { key: "country", label: "国家/地区", category: "basic", type: "string", sortable: true, filterable: true, defaultVisible: true, width: 80, description: "国家/地区代码" },
  { key: "languages", label: "语种", category: "basic", type: "json", width: 100, description: "期刊语种列表" },
  { key: "subjects", label: "学科", category: "basic", type: "json", width: 200, description: "学科/主题分类" },
  { key: "is_open_access", label: "开放获取", category: "basic", type: "boolean", filterable: true, defaultVisible: true, width: 80, description: "是否为开放获取" },
  { key: "homepage", label: "主页", category: "basic", type: "url", width: 200, description: "期刊官网 URL" },

  // =============================================
  // OpenAlex 数据（oa_ 前缀）
  // =============================================
  { key: "oa_display_name", label: "OA显示名称", category: "openalex", type: "string", width: 200, description: "OpenAlex 中的期刊显示名称" },
  { key: "oa_type", label: "OA类型", category: "openalex", type: "string", filterable: true, width: 100, description: "期刊类型（journal/repository等）" },
  { key: "oa_alternate_titles", label: "备选标题", category: "openalex", type: "json", width: 200, description: "期刊备选名称列表" },
  { key: "oa_host_organization", label: "宿主组织", category: "openalex", type: "string", width: 180, description: "出版商/宿主组织名称" },
  { key: "oa_host_organization_lineage", label: "组织层级", category: "openalex", type: "json", width: 200, description: "宿主组织的层级结构" },
  { key: "oa_works_count", label: "作品数", category: "openalex", type: "number", sortable: true, defaultVisible: true, width: 100, description: "OpenAlex 收录的作品总数" },
  { key: "oa_cited_by_count", label: "被引数", category: "openalex", type: "number", sortable: true, defaultVisible: true, width: 100, description: "被引用总次数" },
  { key: "oa_works_api_url", label: "作品API", category: "openalex", type: "url", width: 200, description: "获取该期刊作品的 API 地址" },
  { key: "oa_apc_prices", label: "APC价格列表", category: "openalex", type: "json", width: 150, description: "各币种 APC 价格" },
  { key: "oa_apc_usd", label: "APC(USD)", category: "openalex", type: "number", sortable: true, width: 100, description: "APC 价格（美元）" },
  { key: "oa_counts_by_year", label: "年度统计", category: "openalex", type: "json", width: 150, description: "各年度作品数和被引数" },
  { key: "oa_first_publication_year", label: "首发年份", category: "openalex", type: "number", sortable: true, width: 90, description: "最早发表年份" },
  { key: "oa_last_publication_year", label: "末发年份", category: "openalex", type: "number", sortable: true, width: 90, description: "最近发表年份" },
  { key: "oa_is_core", label: "核心期刊", category: "openalex", type: "boolean", filterable: true, width: 80, description: "是否为核心期刊" },
  { key: "oa_is_oa", label: "OA期刊", category: "openalex", type: "boolean", filterable: true, width: 80, description: "是否为开放获取期刊" },
  { key: "oa_is_high_oa_rate", label: "高OA率", category: "openalex", type: "boolean", filterable: true, width: 80, description: "是否为高开放获取率期刊" },
  { key: "oa_is_high_oa_rate_since_year", label: "高OA率起始年", category: "openalex", type: "number", width: 100, description: "开始达到高OA率的年份" },
  { key: "oa_is_in_doaj", label: "DOAJ收录", category: "openalex", type: "boolean", filterable: true, defaultVisible: true, width: 90, description: "是否被 DOAJ 收录" },
  { key: "oa_is_in_doaj_since_year", label: "DOAJ收录年", category: "openalex", type: "number", width: 100, description: "加入 DOAJ 的年份" },
  { key: "oa_is_in_scielo", label: "SciELO", category: "openalex", type: "boolean", filterable: true, width: 80, description: "是否被 SciELO 收录" },
  { key: "oa_is_ojs", label: "OJS平台", category: "openalex", type: "boolean", filterable: true, width: 80, description: "是否使用 OJS 平台" },
  { key: "oa_oa_flip_year", label: "OA转型年", category: "openalex", type: "number", width: 90, description: "转为开放获取的年份" },
  { key: "oa_oa_works_count", label: "OA作品数", category: "openalex", type: "number", sortable: true, width: 100, description: "开放获取作品数量" },
  { key: "oa_societies", label: "学会组织", category: "openalex", type: "json", width: 150, description: "关联的学会/学术组织" },
  { key: "oa_summary_stats", label: "汇总统计", category: "openalex", type: "json", width: 150, description: "各类汇总统计数据" },
  { key: "oa_topics", label: "主题", category: "openalex", type: "json", width: 200, description: "期刊主题领域" },
  { key: "oa_topic_share", label: "主题分布", category: "openalex", type: "json", width: 150, description: "各主题占比" },
  { key: "oa_ids", label: "外部ID", category: "openalex", type: "json", width: 150, description: "各平台标识符（ISSN、Wikidata等）" },
  { key: "oa_created_date", label: "OA创建日期", category: "openalex", type: "date", sortable: true, width: 110, description: "OpenAlex 记录创建日期" },
  { key: "oa_updated_date", label: "OA更新日期", category: "openalex", type: "date", sortable: true, width: 110, description: "OpenAlex 记录更新日期" },

  // =============================================
  // Crossref 数据（cr_ 前缀）
  // =============================================
  { key: "cr_title", label: "CR标题", category: "crossref", type: "string", width: 200, description: "Crossref 中的期刊标题" },
  { key: "cr_publisher", label: "CR出版社", category: "crossref", type: "string", width: 180, description: "Crossref 中的出版社名称" },
  { key: "cr_subjects", label: "CR学科", category: "crossref", type: "json", width: 200, description: "Crossref 学科分类" },
  { key: "cr_issn_types", label: "ISSN类型", category: "crossref", type: "json", width: 150, description: "各 ISSN 的类型（print/electronic）" },
  { key: "cr_url", label: "CR链接", category: "crossref", type: "url", width: 150, description: "Crossref 中的期刊链接" },
  { key: "cr_last_status_check_time", label: "状态检查时间", category: "crossref", type: "number", width: 130, description: "最后状态检查的 Unix 时间戳" },
  { key: "cr_counts", label: "DOI统计", category: "crossref", type: "json", width: 150, description: "DOI 数量统计" },
  { key: "cr_breakdowns", label: "细分统计", category: "crossref", type: "json", width: 150, description: "DOI 细分数据" },
  { key: "cr_coverage", label: "覆盖率", category: "crossref", type: "json", width: 150, description: "元数据覆盖率" },
  { key: "cr_coverage_type", label: "覆盖率类型", category: "crossref", type: "json", width: 150, description: "按类型划分的覆盖率" },
  { key: "cr_flags", label: "标志位", category: "crossref", type: "json", width: 150, description: "Crossref 标志位" },

  // =============================================
  // DOAJ 数据（doaj_ 前缀）
  // =============================================
  { key: "doaj_title", label: "DOAJ标题", category: "doaj", type: "string", width: 200, description: "DOAJ 中的期刊标题" },
  { key: "doaj_alternative_title", label: "DOAJ备选标题", category: "doaj", type: "string", width: 180, description: "DOAJ 备选期刊名" },
  { key: "doaj_publisher", label: "DOAJ出版社", category: "doaj", type: "string", width: 180, description: "DOAJ 中的出版社名称" },
  { key: "doaj_country", label: "DOAJ国家", category: "doaj", type: "string", filterable: true, width: 80, description: "DOAJ 中的国家/地区" },
  { key: "doaj_languages", label: "DOAJ语种", category: "doaj", type: "json", width: 100, description: "DOAJ 收录的语种" },
  { key: "doaj_subjects", label: "DOAJ学科", category: "doaj", type: "json", width: 200, description: "DOAJ 学科分类" },
  { key: "doaj_keywords", label: "关键词", category: "doaj", type: "json", width: 200, description: "DOAJ 关键词" },
  { key: "doaj_links", label: "相关链接", category: "doaj", type: "json", width: 150, description: "期刊相关链接（主页、投稿等）" },
  { key: "doaj_eissn", label: "电子ISSN", category: "doaj", type: "string", width: 100, description: "电子版 ISSN" },
  { key: "doaj_pissn", label: "印刷ISSN", category: "doaj", type: "string", width: 100, description: "印刷版 ISSN" },
  { key: "doaj_apc", label: "APC信息", category: "doaj", type: "json", width: 150, description: "文章处理费信息" },
  { key: "doaj_license", label: "许可证", category: "doaj", type: "json", width: 150, description: "开放获取许可证类型" },
  { key: "doaj_boai", label: "BOAI兼容", category: "doaj", type: "boolean", filterable: true, width: 90, description: "是否符合 BOAI 标准" },
  { key: "doaj_article", label: "文章信息", category: "doaj", type: "json", width: 150, description: "文章处理相关信息" },
  { key: "doaj_copyright", label: "版权信息", category: "doaj", type: "json", width: 150, description: "版权归属信息" },
  { key: "doaj_deposit_policy", label: "存储政策", category: "doaj", type: "json", width: 150, description: "存储/存档政策" },
  { key: "doaj_editorial", label: "编辑信息", category: "doaj", type: "json", width: 150, description: "编辑委员会信息" },
  { key: "doaj_institution", label: "所属机构", category: "doaj", type: "json", width: 150, description: "关联机构信息" },
  { key: "doaj_plagiarism", label: "查重政策", category: "doaj", type: "json", width: 150, description: "抄袭检测政策" },
  { key: "doaj_preservation", label: "长期保存", category: "doaj", type: "json", width: 150, description: "数字保存服务" },
  { key: "doaj_publication_time_weeks", label: "出版周期(周)", category: "doaj", type: "number", sortable: true, width: 110, description: "从投稿到发表的周数" },
  { key: "doaj_discontinued_date", label: "停刊日期", category: "doaj", type: "string", width: 100, description: "期刊停刊日期" },
  { key: "doaj_is_replaced_by", label: "被替代", category: "doaj", type: "json", width: 150, description: "替代此期刊的期刊" },
  { key: "doaj_replaces", label: "替代", category: "doaj", type: "json", width: 150, description: "此期刊替代的期刊" },
  { key: "doaj_labels", label: "标签", category: "doaj", type: "json", width: 150, description: "DOAJ 标签" },
  { key: "doaj_oa_start", label: "OA起始", category: "doaj", type: "json", width: 100, description: "开始开放获取的时间" },
  { key: "doaj_other_charges", label: "其他费用", category: "doaj", type: "json", width: 150, description: "其他收费项目" },
  { key: "doaj_pid_scheme", label: "标识符方案", category: "doaj", type: "json", width: 150, description: "使用的持久标识符（DOI等）" },
  { key: "doaj_ref", label: "引用政策", category: "doaj", type: "json", width: 150, description: "参考文献相关政策" },
  { key: "doaj_waiver", label: "费用减免", category: "doaj", type: "json", width: 150, description: "APC 减免政策" },

  // =============================================
  // NLM 数据（nlm_ 前缀）
  // =============================================
  { key: "nlm_in_catalog", label: "NLM收录", category: "nlm", type: "boolean", filterable: true, defaultVisible: true, width: 90, description: "是否被 NLM Catalog 收录" },
  { key: "nlm_uids", label: "NLM UIDs", category: "nlm", type: "json", width: 150, description: "NLM 唯一标识符列表" },

  // =============================================
  // Wikidata 数据（wikidata_ 前缀）
  // =============================================
  { key: "wikidata_has_entity", label: "Wikidata", category: "wikidata", type: "boolean", filterable: true, width: 90, description: "是否有 Wikidata 实体" },
  { key: "wikidata_homepage", label: "WD主页", category: "wikidata", type: "url", width: 200, description: "Wikidata 中的官网链接" },

  // =============================================
  // Wikipedia 数据（wikipedia_ 前缀）
  // =============================================
  { key: "wikipedia_has_article", label: "Wikipedia", category: "wikipedia", type: "boolean", filterable: true, width: 90, description: "是否有 Wikipedia 条目" },
  { key: "wikipedia_article_title", label: "Wiki标题", category: "wikipedia", type: "string", width: 200, description: "Wikipedia 条目标题" },
  { key: "wikipedia_extract", label: "Wiki摘要", category: "wikipedia", type: "text", width: 300, description: "Wikipedia 条目摘要" },
  { key: "wikipedia_description", label: "Wiki描述", category: "wikipedia", type: "string", width: 300, description: "Wikipedia 简短描述" },
  { key: "wikipedia_thumbnail", label: "Wiki缩略图", category: "wikipedia", type: "url", width: 150, description: "Wikipedia 缩略图 URL" },
  { key: "wikipedia_categories", label: "Wiki分类", category: "wikipedia", type: "json", width: 200, description: "Wikipedia 分类列表" },
  { key: "wikipedia_infobox", label: "Wiki信息框", category: "wikipedia", type: "json", width: 200, description: "Wikipedia 信息框数据" },

  // =============================================
  // 用户自定义字段（custom_ 前缀）
  // =============================================
  { key: "custom_title", label: "自定义标题", category: "custom", type: "string", width: 250, description: "用户自定义的期刊标题" },
  { key: "custom_publisher", label: "自定义出版社", category: "custom", type: "string", width: 200, description: "用户自定义的出版社" },
  { key: "custom_country", label: "自定义国家", category: "custom", type: "string", width: 80, description: "用户自定义的国家/地区" },
  { key: "custom_homepage", label: "自定义主页", category: "custom", type: "url", width: 200, description: "用户自定义的主页 URL" },
  { key: "custom_description", label: "自定义描述", category: "custom", type: "text", width: 300, description: "用户自定义的期刊描述" },
  { key: "custom_notes", label: "备注", category: "custom", type: "text", width: 300, description: "用户备注" },
  { key: "custom_updated_at", label: "自定义更新时间", category: "custom", type: "date", sortable: true, width: 160, description: "自定义字段最后更新时间" },
  { key: "cover_image_name", label: "封面文件名", category: "custom", type: "string", width: 150, description: "封面图片原始文件名" },

  // =============================================
  // 元信息
  // =============================================
  { key: "field_sources", label: "字段来源", category: "meta", type: "json", width: 200, description: "各聚合字段的数据来源" },
  { key: "created_at", label: "创建时间", category: "meta", type: "date", sortable: true, width: 160, description: "记录创建时间" },
  { key: "updated_at", label: "更新时间", category: "meta", type: "date", sortable: true, defaultVisible: true, width: 160, description: "记录最后更新时间" },
];

// 默认显示的列
export const DEFAULT_VISIBLE_COLUMNS = ALL_COLUMNS
  .filter(c => c.defaultVisible)
  .map(c => c.key);

// 可排序的列
export const SORTABLE_COLUMNS = ALL_COLUMNS
  .filter(c => c.sortable)
  .map(c => ({ key: c.key, label: c.label }));

// 可筛选的列（布尔类型）
export const FILTERABLE_COLUMNS = ALL_COLUMNS
  .filter(c => c.filterable && c.type === "boolean")
  .map(c => ({ key: c.key, label: c.label }));

// 按分类分组
export function getColumnsByCategory(): Record<ColumnCategory, ColumnDef[]> {
  const result = {} as Record<ColumnCategory, ColumnDef[]>;
  for (const col of ALL_COLUMNS) {
    if (!result[col.category]) {
      result[col.category] = [];
    }
    result[col.category].push(col);
  }
  return result;
}

// 获取列定义
export function getColumnDef(key: string): ColumnDef | undefined {
  return ALL_COLUMNS.find(c => c.key === key);
}

// 获取所有字段的 key 列表（用于 API 验证）
export const ALL_FIELD_KEYS = ALL_COLUMNS.map(c => c.key);

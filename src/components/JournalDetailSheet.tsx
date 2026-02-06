"use client";

import { useEffect, useState } from "react";
import {
  Globe,
  BookOpen,
  BarChart3,
  Database,
  FileText,
  Award,
  ExternalLink,
  Loader2,
  Building2,
  Link as LinkIcon,
  Tag,
  Pencil,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

type JournalDetail = {
  journal: Record<string, unknown>;
  aliases: Array<{ issn: string; kind: string }>;
  fetchStatus: Array<{
    source: string;
    status: string;
    http_status: number | null;
    last_fetched_at: string | null;
    error_message: string | null;
  }>;
};

interface JournalDetailSheetProps {
  journalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 国旗 emoji
function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  try {
    return String.fromCodePoint(
      ...[...code.toUpperCase()].map((c) => c.charCodeAt(0) - 65 + 0x1f1e6),
    );
  } catch {
    return "";
  }
}

function BoolBadge({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/20 shrink-0" />
        未知
      </span>
    );
  }
  if (value === 1 || value === true) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
        是
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0" />
      否
    </span>
  );
}

function formatNumber(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number") return v.toLocaleString("zh-CN");
  return String(v);
}

// 从数组项中提取可读文本
function extractLabel(item: unknown): string {
  if (typeof item === "string") return item;
  if (typeof item === "object" && item !== null) {
    const obj = item as Record<string, unknown>;
    const name = obj.display_name || obj.name || obj.title || obj.value || obj.label;
    if (name) return String(name);
    if (obj.currency && obj.price !== undefined) return `${obj.currency} ${obj.price}`;
    const keys = Object.keys(obj);
    return keys.length <= 3
      ? keys.map((k) => `${k}: ${typeof obj[k] === "string" ? obj[k] : JSON.stringify(obj[k])}`).join(", ")
      : `{${keys.length} 字段}`;
  }
  return String(item);
}

function formatValue(v: unknown): React.ReactNode {
  if (v === null || v === undefined) return <span className="text-muted-foreground/40">—</span>;
  if (typeof v === "boolean") return <BoolBadge value={v} />;
  if (typeof v === "number") return <span className="tabular-nums text-sm">{v.toLocaleString("zh-CN")}</span>;
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-muted-foreground/40">—</span>;
    return (
      <div className="flex flex-wrap gap-1 justify-end">
        {v.slice(0, 4).map((item, i) => {
          const text = extractLabel(item);
          return (
            <Badge key={i} variant="outline" className="text-[11px] font-normal max-w-[180px] truncate">
              {text.length > 36 ? text.slice(0, 34) + "…" : text}
            </Badge>
          );
        })}
        {v.length > 4 && (
          <Badge variant="secondary" className="text-[11px]">
            +{v.length - 4}
          </Badge>
        )}
      </div>
    );
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted-foreground/40">—</span>;
    if (entries.length <= 4) {
      return (
        <div className="text-xs space-y-0.5 text-right">
          {entries.map(([key, val]) => (
            <div key={key}>
              <span className="text-muted-foreground">{key}: </span>
              <span>{typeof val === "object" ? JSON.stringify(val) : String(val ?? "—")}</span>
            </div>
          ))}
        </div>
      );
    }
    return (
      <Badge variant="outline" className="text-[11px] font-normal">
        {entries.length} 项
      </Badge>
    );
  }
  const s = String(v);
  if (s.startsWith("http")) {
    try {
      const url = new URL(s);
      return (
        <a
          href={s}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline text-xs inline-flex items-center gap-1"
        >
          {url.hostname.replace(/^www\./, "")}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      );
    } catch {
      return (
        <a href={s} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs inline-flex items-center gap-1">
          链接 <ExternalLink className="h-3 w-3" />
        </a>
      );
    }
  }
  return <span className="text-sm">{s.length > 120 ? s.slice(0, 118) + "…" : s}</span>;
}

function InfoRow({ label, value, highlight, isBool }: { label: string; value: unknown; highlight?: boolean; isBool?: boolean }) {
  return (
    <div className={`flex justify-between items-start py-1.5 gap-4 ${highlight ? "bg-primary/5 -mx-2 px-2 rounded" : ""}`}>
      <span className="text-muted-foreground text-xs shrink-0 pt-0.5">{label}</span>
      <div className="text-right min-w-0 max-w-[340px]">
        {isBool ? <BoolBadge value={value} /> : formatValue(value)}
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4" />
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function JournalDetailSheet({ journalId, open, onOpenChange }: JournalDetailSheetProps) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<JournalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !journalId) {
      setDetail(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/journals/${encodeURIComponent(journalId)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setDetail(data);
        }
      })
      .catch((err) => {
        setError(err.message || "加载失败");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, journalId]);

  const j = detail?.journal;
  const aliases = detail?.aliases ?? [];

  // Check if has custom fields
  const hasCustomFields = j && (j.custom_title || j.custom_publisher || j.custom_country || j.custom_homepage || j.custom_description || j.custom_notes);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[650px] sm:max-w-[650px] p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="text-lg">期刊详情</SheetTitle>
          <SheetDescription className="line-clamp-1">
            {j?.oa_display_name ? String(j.oa_display_name) : journalId}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)]">
          <div className="px-6 py-4 space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {j && !loading && (
              <>
                {/* Journal Header: Cover + Name + Meta */}
                <div className="flex gap-4">
                  {/* 封面图 */}
                  <div className="w-[72px] h-[100px] rounded-lg overflow-hidden border bg-muted shrink-0 flex items-center justify-center">
                    {j.cover_image_name ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/journals/${j.id}/cover`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-muted-foreground/30">
                        <BookOpen className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold line-clamp-2 leading-snug">
                      {String(j.custom_title || j.oa_display_name || "未知期刊")}
                    </h2>
                    {!!j.oa_host_organization && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        <Building2 className="h-3 w-3 inline mr-1" />
                        {String(j.oa_host_organization)}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {!!j.oa_country_code && (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <span className="text-sm leading-none">{countryFlag(String(j.oa_country_code))}</span>
                          {String(j.oa_country_code)}
                        </span>
                      )}
                      {!!j.oa_type && (
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {String(j.oa_type)}
                        </Badge>
                      )}
                      {!!j.issn_l && (
                        <span className="text-xs font-mono text-muted-foreground">
                          ISSN-L: {String(j.issn_l)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-lg border p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5">
                      <BarChart3 className="h-3 w-3" />
                      作品数
                    </div>
                    <p className="text-base font-semibold tabular-nums">{formatNumber(j.oa_works_count)}</p>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5">
                      <FileText className="h-3 w-3" />
                      被引数
                    </div>
                    <p className="text-base font-semibold tabular-nums">{formatNumber(j.oa_cited_by_count)}</p>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5">
                      <Globe className="h-3 w-3" />
                      OA
                    </div>
                    <BoolBadge value={j.oa_is_oa} />
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5">
                      <BookOpen className="h-3 w-3" />
                      DOAJ
                    </div>
                    <BoolBadge value={j.oa_is_in_doaj} />
                  </div>
                </div>

                {/* Custom Fields (Highlighted if exists) */}
                {hasCustomFields && (
                  <Section title="自定义信息（优先显示）" icon={Pencil}>
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                      {j.custom_title ? <InfoRow label="自定义标题" value={j.custom_title} /> : null}
                      {j.custom_publisher ? <InfoRow label="自定义出版社" value={j.custom_publisher} /> : null}
                      {j.custom_country ? <InfoRow label="自定义国家" value={j.custom_country} /> : null}
                      {j.custom_homepage ? <InfoRow label="自定义主页" value={j.custom_homepage} /> : null}
                      {j.custom_description ? <InfoRow label="自定义描述" value={j.custom_description} /> : null}
                      {j.custom_notes ? <InfoRow label="备注" value={j.custom_notes} /> : null}
                      {j.custom_updated_at ? (
                        <p className="text-xs text-muted-foreground pt-2">
                          更新于: {String(j.custom_updated_at)}
                        </p>
                      ) : null}
                    </div>
                  </Section>
                )}

                <Separator />

                {/* Basic Info (ID & ISSN) */}
                <Section title="基本信息" icon={Database}>
                  <InfoRow label="OpenAlex ID" value={j.id} />
                  <InfoRow label="ISSN-L" value={j.issn_l} />
                  <InfoRow label="ISSNs" value={j.issns} />
                </Section>

                <Separator />

                {/* OpenAlex Data (Primary Data Source) */}
                <Section title="OpenAlex 数据（基础数据）" icon={BarChart3}>
                  <InfoRow label="期刊名称" value={j.oa_display_name} highlight />
                  <InfoRow label="类型" value={j.oa_type} />
                  <InfoRow label="别名" value={j.oa_alternate_titles} />
                  <InfoRow label="出版机构" value={j.oa_host_organization} highlight />
                  <InfoRow label="出版机构 ID" value={j.oa_host_organization_id} />
                  <InfoRow label="国家/地区" value={
                    j.oa_country_code
                      ? `${countryFlag(String(j.oa_country_code))} ${j.oa_country_code}`
                      : null
                  } highlight />
                  <InfoRow label="主页" value={j.oa_homepage_url} />
                  <InfoRow label="作品数" value={j.oa_works_count} />
                  <InfoRow label="被引数" value={j.oa_cited_by_count} />
                  <InfoRow label="OA 作品数" value={j.oa_oa_works_count} />
                  <InfoRow label="首次发表年" value={j.oa_first_publication_year} />
                  <InfoRow label="最后发表年" value={j.oa_last_publication_year} />
                  <InfoRow label="APC (USD)" value={j.oa_apc_usd} />
                  <InfoRow label="核心期刊" value={j.oa_is_core} isBool />
                  <InfoRow label="开放获取" value={j.oa_is_oa} isBool />
                  <InfoRow label="高 OA 率" value={j.oa_is_high_oa_rate} isBool />
                  <InfoRow label="在 DOAJ" value={j.oa_is_in_doaj} isBool />
                  <InfoRow label="在 SciELO" value={j.oa_is_in_scielo} isBool />
                  <InfoRow label="使用 OJS" value={j.oa_is_ojs} isBool />
                  <InfoRow label="主题分布" value={j.oa_topics} />
                  <InfoRow label="各年引用" value={j.oa_counts_by_year} />
                  <InfoRow label="外部 ID" value={j.oa_ids} />
                  <InfoRow label="创建日期" value={j.oa_created_date} />
                  <InfoRow label="更新日期" value={j.oa_updated_date} />
                </Section>

                <Separator />

                {/* Crossref Data */}
                <Section title="Crossref 数据" icon={LinkIcon}>
                  <InfoRow label="标题" value={j.cr_title} />
                  <InfoRow label="出版社" value={j.cr_publisher} />
                  <InfoRow label="学科" value={j.cr_subjects} />
                  <InfoRow label="ISSN 类型" value={j.cr_issn_types} />
                  <InfoRow label="URL" value={j.cr_url} />
                  <InfoRow label="统计数据" value={j.cr_counts} />
                  <InfoRow label="覆盖率" value={j.cr_coverage} />
                  <InfoRow label="状态检查" value={j.cr_last_status_check_time} />
                </Section>

                <Separator />

                {/* DOAJ Data */}
                <Section title="DOAJ 数据" icon={BookOpen}>
                  <InfoRow label="标题" value={j.doaj_title} />
                  <InfoRow label="出版社" value={j.doaj_publisher} />
                  <InfoRow label="国家" value={
                    j.doaj_country
                      ? `${countryFlag(String(j.doaj_country))} ${j.doaj_country}`
                      : null
                  } />
                  <InfoRow label="语言" value={j.doaj_languages} />
                  <InfoRow label="学科" value={j.doaj_subjects} />
                  <InfoRow label="链接" value={j.doaj_links} />
                  <InfoRow label="APC 信息" value={j.doaj_apc} />
                  <InfoRow label="许可证" value={j.doaj_license} />
                  <InfoRow label="BOAI 合规" value={j.doaj_boai} isBool />
                  <InfoRow label="版权政策" value={j.doaj_copyright} />
                  <InfoRow label="存档策略" value={j.doaj_preservation} />
                  <InfoRow label="出版周期 (周)" value={j.doaj_publication_time_weeks} />
                  <InfoRow label="eISSN" value={j.doaj_eissn} />
                  <InfoRow label="pISSN" value={j.doaj_pissn} />
                  <InfoRow label="OA 起始年" value={j.doaj_oa_start} />
                  <InfoRow label="停刊日期" value={j.doaj_discontinued_date} />
                </Section>

                <Separator />

                {/* NLM Data */}
                <Section title="NLM Catalog" icon={Award}>
                  <InfoRow label="已收录" value={j.nlm_in_catalog} isBool />
                  <InfoRow label="NLM UIDs" value={j.nlm_uids} />
                </Section>

                <Separator />

                {/* Wikidata & Wikipedia */}
                <Section title="Wikidata / Wikipedia" icon={Globe}>
                  <InfoRow label="Wikidata 实体" value={j.wikidata_has_entity} isBool />
                  <InfoRow label="Wikidata 主页" value={j.wikidata_homepage} />
                  <InfoRow label="Wikipedia 文章" value={j.wikipedia_has_article} isBool />
                  <InfoRow label="文章标题" value={j.wikipedia_article_title} />
                  <InfoRow label="简介" value={j.wikipedia_extract} />
                  <InfoRow label="描述" value={j.wikipedia_description} />
                  <InfoRow label="分类" value={j.wikipedia_categories} />
                </Section>

                {/* ISSN Aliases */}
                {aliases.length > 0 && (
                  <>
                    <Separator />
                    <Section title="ISSN 别名" icon={Tag}>
                      <div className="flex flex-wrap gap-2">
                        {aliases.map((alias, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            <span className="font-mono">{alias.issn}</span>
                            <span className="text-muted-foreground ml-1">({alias.kind})</span>
                          </Badge>
                        ))}
                      </div>
                    </Section>
                  </>
                )}

                {/* Metadata */}
                <Separator />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground/60">
                  <span>创建: {String(j.created_at || "—")}</span>
                  <span>更新: {String(j.updated_at || "—")}</span>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

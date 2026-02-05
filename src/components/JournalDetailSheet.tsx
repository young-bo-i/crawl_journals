"use client";

import { useEffect, useState } from "react";
import {
  Check,
  X,
  Minus,
  Globe,
  BookOpen,
  BarChart3,
  Database,
  FileText,
  Award,
  ExternalLink,
  Loader2,
  Building2,
  MapPin,
  Calendar,
  Link as LinkIcon,
  Tag,
  Languages,
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

function BoolBadge({ value, trueLabel = "是", falseLabel = "否" }: { value: unknown; trueLabel?: string; falseLabel?: string }) {
  if (value === null || value === undefined) {
    return <Badge variant="outline" className="text-xs"><Minus className="mr-1 h-3 w-3" />未知</Badge>;
  }
  if (value === 1 || value === true) {
    return <Badge variant="default" className="text-xs bg-emerald-500"><Check className="mr-1 h-3 w-3" />{trueLabel}</Badge>;
  }
  return <Badge variant="secondary" className="text-xs"><X className="mr-1 h-3 w-3" />{falseLabel}</Badge>;
}

function formatNumber(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number") return v.toLocaleString("zh-CN");
  return String(v);
}

function formatValue(v: unknown): React.ReactNode {
  if (v === null || v === undefined) return <span className="text-muted-foreground">-</span>;
  if (typeof v === "boolean") return v ? "是" : "否";
  if (typeof v === "number") return v.toLocaleString("zh-CN");
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-muted-foreground">-</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {v.slice(0, 5).map((item, i) => (
          <Badge key={i} variant="outline" className="text-xs">
            {typeof item === "object" ? JSON.stringify(item).slice(0, 30) : String(item).slice(0, 30)}
          </Badge>
        ))}
        {v.length > 5 && <Badge variant="secondary" className="text-xs">+{v.length - 5}</Badge>}
      </div>
    );
  }
  if (typeof v === "object") {
    return <Badge variant="outline" className="text-xs">{Object.keys(v).length} 项</Badge>;
  }
  const s = String(v);
  if (s.startsWith("http")) {
    return (
      <a href={s} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs inline-flex items-center gap-1">
        访问 <ExternalLink className="h-3 w-3" />
      </a>
    );
  }
  return <span className="text-sm">{s.length > 100 ? s.slice(0, 100) + "..." : s}</span>;
}

function InfoRow({ label, value, highlight }: { label: string; value: unknown; highlight?: boolean }) {
  return (
    <div className={`flex justify-between items-start py-1.5 ${highlight ? "bg-primary/5 -mx-2 px-2 rounded" : ""}`}>
      <span className="text-muted-foreground text-sm shrink-0">{label}</span>
      <div className="text-right max-w-[300px] ml-4">{formatValue(value)}</div>
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
            {j?.title ? String(j.title) : journalId}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)]">
          <div className="px-6 py-4 space-y-6">
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
                {/* Quick Stats */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <BarChart3 className="h-3 w-3" />
                      作品数
                    </div>
                    <p className="text-lg font-semibold">{formatNumber(j.oa_works_count)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <FileText className="h-3 w-3" />
                      被引数
                    </div>
                    <p className="text-lg font-semibold">{formatNumber(j.oa_cited_by_count)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <Globe className="h-3 w-3" />
                      OA
                    </div>
                    <BoolBadge value={j.is_open_access} />
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
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

                {/* Basic Info */}
                <Section title="基本信息" icon={Database}>
                  <InfoRow label="OpenAlex ID" value={j.id} />
                  <InfoRow label="ISSN-L" value={j.issn_l} />
                  <InfoRow label="ISSNs" value={j.issns} />
                  <InfoRow label="标题" value={j.title} />
                  <InfoRow label="出版社" value={j.publisher} />
                  <InfoRow label="国家/地区" value={j.country} />
                  <InfoRow label="语言" value={j.languages} />
                  <InfoRow label="主页" value={j.homepage} />
                  <InfoRow label="主题/学科" value={j.subjects} />
                </Section>

                <Separator />

                {/* OpenAlex Data */}
                <Section title="OpenAlex 数据" icon={BarChart3}>
                  <InfoRow label="显示名称" value={j.oa_display_name} />
                  <InfoRow label="类型" value={j.oa_type} />
                  <InfoRow label="别名" value={j.oa_alternate_titles} />
                  <InfoRow label="主办机构" value={j.oa_host_organization} />
                  <InfoRow label="作品数" value={j.oa_works_count} />
                  <InfoRow label="被引数" value={j.oa_cited_by_count} />
                  <InfoRow label="OA 作品数" value={j.oa_oa_works_count} />
                  <InfoRow label="首次发表年" value={j.oa_first_publication_year} />
                  <InfoRow label="最后发表年" value={j.oa_last_publication_year} />
                  <InfoRow label="APC (USD)" value={j.oa_apc_usd} />
                  <InfoRow label="核心期刊" value={j.oa_is_core} />
                  <InfoRow label="开放获取" value={j.oa_is_oa} />
                  <InfoRow label="高 OA 率" value={j.oa_is_high_oa_rate} />
                  <InfoRow label="在 DOAJ" value={j.oa_is_in_doaj} />
                  <InfoRow label="在 SciELO" value={j.oa_is_in_scielo} />
                  <InfoRow label="使用 OJS" value={j.oa_is_ojs} />
                  <InfoRow label="主题分布" value={j.oa_topics} />
                  <InfoRow label="各年引用" value={j.oa_counts_by_year} />
                  <InfoRow label="外部 ID" value={j.oa_ids} />
                  <InfoRow label="OA 创建日期" value={j.oa_created_date} />
                  <InfoRow label="OA 更新日期" value={j.oa_updated_date} />
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
                  <InfoRow label="国家" value={j.doaj_country} />
                  <InfoRow label="语言" value={j.doaj_languages} />
                  <InfoRow label="学科" value={j.doaj_subjects} />
                  <InfoRow label="链接" value={j.doaj_links} />
                  <InfoRow label="APC 信息" value={j.doaj_apc} />
                  <InfoRow label="许可证" value={j.doaj_license} />
                  <InfoRow label="BOAI 合规" value={j.doaj_boai} />
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
                  <InfoRow label="已收录" value={j.nlm_in_catalog} />
                  <InfoRow label="NLM UIDs" value={j.nlm_uids} />
                </Section>

                <Separator />

                {/* Wikidata & Wikipedia */}
                <Section title="Wikidata / Wikipedia" icon={Globe}>
                  <InfoRow label="Wikidata 实体" value={j.wikidata_has_entity} />
                  <InfoRow label="Wikidata 主页" value={j.wikidata_homepage} />
                  <InfoRow label="Wikipedia 文章" value={j.wikipedia_has_article} />
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
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>创建时间: {String(j.created_at || "-")}</p>
                  <p>更新时间: {String(j.updated_at || "-")}</p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

import Link from "next/link";
import { getJournalDetail, hasJournalCoverImage } from "@/server/db/repo";
import { getJcrByIssn, getFqbJcrByIssn, getJcrByTitle, getFqbJcrByTitle } from "@/server/db/jcr-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  ExternalLink,
  Check,
  X,
  Minus,
  Globe,
  BookOpen,
  BarChart3,
  Database,
  FileText,
  Award,
  Clock,
} from "lucide-react";
import { JournalEditor } from "@/components/JournalEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function BoolBadge({ value, trueLabel = "是", falseLabel = "否" }: { value: unknown; trueLabel?: string; falseLabel?: string }) {
  if (value === null || value === undefined) {
    return <Badge variant="outline"><Minus className="mr-1 h-3 w-3" />未知</Badge>;
  }
  if (value === 1 || value === true) {
    return <Badge variant="success"><Check className="mr-1 h-3 w-3" />{trueLabel}</Badge>;
  }
  return <Badge variant="secondary"><X className="mr-1 h-3 w-3" />{falseLabel}</Badge>;
}

function formatNumber(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number") return v.toLocaleString("zh-CN");
  return String(v);
}

function getStatusBadge(status?: string) {
  switch (status) {
    case "success":
      return <Badge variant="success">成功</Badge>;
    case "no_data":
      return <Badge variant="secondary">无数据</Badge>;
    case "failed":
      return <Badge variant="destructive">失败</Badge>;
    case "pending":
      return <Badge variant="outline">待处理</Badge>;
    default:
      return <Badge variant="outline">{status ?? "-"}</Badge>;
  }
}

type Props = {
  params: Promise<{ issn: string }>;
};

export default async function JournalDetailPage(props: Props) {
  const { issn: idOrIssn } = await props.params;
  const detail = await getJournalDetail(idOrIssn);

  if (!detail) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/journals">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回期刊列表
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <h1 className="text-2xl font-bold mb-2">期刊未找到</h1>
            <p className="text-muted-foreground">未找到 ID/ISSN 为 {idOrIssn} 的期刊</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { journal, aliases, fetchStatus } = detail;

  // 检查是否有封面图片
  const hasCoverImage = await hasJournalCoverImage(journal.id);

  // 获取 JCR 数据
  let jcrData: Record<string, unknown>[] = [];
  let fqbData: Record<string, unknown>[] = [];

  try {
    if (journal.issn_l) {
      jcrData = await getJcrByIssn(journal.issn_l);
      fqbData = await getFqbJcrByIssn(journal.issn_l);
    } else if (journal.title) {
      jcrData = await getJcrByTitle(journal.title);
      fqbData = await getFqbJcrByTitle(journal.title);
    }
  } catch {
    // JCR 数据库可能不存在
  }

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <Button variant="ghost" asChild>
        <Link href="/journals">
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回期刊列表
        </Link>
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{journal.title || "无标题"}</h1>
        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
          <span className="font-mono">{journal.id}</span>
          {journal.issn_l && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <span>ISSN-L: {journal.issn_l}</span>
            </>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">作品数</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(journal.oa_works_count)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">被引数</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(journal.oa_cited_by_count)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">开放获取</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <BoolBadge value={journal.is_open_access} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">DOAJ 收录</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <BoolBadge value={journal.oa_is_in_doaj} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              基本信息
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">OpenAlex ID</dt>
                <dd className="font-mono text-sm">{journal.id}</dd>
              </div>
              <Separator />
              <div className="flex justify-between">
                <dt className="text-muted-foreground">ISSN-L</dt>
                <dd className="font-mono">{journal.issn_l || "-"}</dd>
              </div>
              <Separator />
              <div className="flex justify-between">
                <dt className="text-muted-foreground">出版社</dt>
                <dd className="text-right max-w-[200px]">{journal.publisher || "-"}</dd>
              </div>
              <Separator />
              <div className="flex justify-between">
                <dt className="text-muted-foreground">国家/地区</dt>
                <dd>{journal.country || "-"}</dd>
              </div>
              <Separator />
              <div className="flex justify-between items-start">
                <dt className="text-muted-foreground">语种</dt>
                <dd className="flex flex-wrap gap-1 justify-end">
                  {(journal.languages || []).map((lang) => (
                    <Badge key={lang} variant="outline">{lang}</Badge>
                  ))}
                  {(!journal.languages || journal.languages.length === 0) && "-"}
                </dd>
              </div>
              <Separator />
              <div className="flex justify-between items-start">
                <dt className="text-muted-foreground">主页</dt>
                <dd>
                  {journal.homepage ? (
                    <Button variant="link" size="sm" className="h-auto p-0" asChild>
                      <a href={journal.homepage} target="_blank" rel="noopener noreferrer">
                        访问 <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  ) : "-"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Inclusion Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              收录状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div className="flex justify-between items-center">
                <dt className="text-muted-foreground">开放获取</dt>
                <dd><BoolBadge value={journal.is_open_access} /></dd>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <dt className="text-muted-foreground">DOAJ</dt>
                <dd><BoolBadge value={journal.oa_is_in_doaj} /></dd>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <dt className="text-muted-foreground">NLM Catalog</dt>
                <dd><BoolBadge value={journal.nlm_in_catalog} /></dd>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <dt className="text-muted-foreground">Wikidata</dt>
                <dd><BoolBadge value={journal.wikidata_has_entity} /></dd>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <dt className="text-muted-foreground">Wikipedia</dt>
                <dd><BoolBadge value={journal.wikipedia_has_article} /></dd>
              </div>
              <Separator />
              <div className="flex justify-between">
                <dt className="text-muted-foreground">首次发表</dt>
                <dd>{journal.oa_first_publication_year || "-"}</dd>
              </div>
              <Separator />
              <div className="flex justify-between">
                <dt className="text-muted-foreground">最后发表</dt>
                <dd>{journal.oa_last_publication_year || "-"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* ISSN Aliases */}
      {aliases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>ISSN 别名</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {aliases.map((alias, i) => (
                <Badge key={i} variant="outline" className="text-sm">
                  <span className="font-mono">{alias.issn}</span>
                  <span className="text-muted-foreground ml-2">({alias.kind})</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fetch Status */}
      <Card>
        <CardHeader>
          <CardTitle>数据源抓取状态</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>数据源</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>HTTP</TableHead>
                <TableHead>最后更新</TableHead>
                <TableHead>错误信息</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fetchStatus.map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{s.source}</TableCell>
                  <TableCell>{getStatusBadge(s.status)}</TableCell>
                  <TableCell>{s.http_status ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{s.last_fetched_at ?? "-"}</TableCell>
                  <TableCell className="text-destructive text-sm max-w-[200px] truncate">
                    {s.error_message ?? "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* JCR Impact Factor */}
      {jcrData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>JCR 影响因子</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>年份</TableHead>
                  <TableHead>期刊</TableHead>
                  <TableHead>学科</TableHead>
                  <TableHead>影响因子</TableHead>
                  <TableHead>分区</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jcrData.map((j, i) => (
                  <TableRow key={i}>
                    <TableCell>{String(j.year || 2024)}</TableCell>
                    <TableCell className="font-medium">{String(j.journal || "-")}</TableCell>
                    <TableCell>{String(j.category || "-")}</TableCell>
                    <TableCell className="font-mono">{String(j.if_2024 || "-")}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{String(j.if_quartile_2024 || "-")}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* CAS Partition */}
      {fqbData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>中科院分区</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>年份</TableHead>
                  <TableHead>期刊</TableHead>
                  <TableHead>大类</TableHead>
                  <TableHead>大类分区</TableHead>
                  <TableHead>是否顶刊</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fqbData.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell>{String(f.year || "-")}</TableCell>
                    <TableCell className="font-medium">{String(f.journal || "-")}</TableCell>
                    <TableCell>{String(f.major_category || "-")}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{String(f.major_partition || "-")}</Badge>
                    </TableCell>
                    <TableCell>{String(f.is_top || "-")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Journal Editor - 封面和自定义信息 */}
      <JournalEditor 
        journal={{
          id: journal.id,
          title: journal.title,
          publisher: journal.publisher,
          country: journal.country,
          homepage: journal.homepage,
          custom_title: journal.custom_title,
          custom_publisher: journal.custom_publisher,
          custom_country: journal.custom_country,
          custom_homepage: journal.custom_homepage,
          custom_description: journal.custom_description,
          custom_notes: journal.custom_notes,
          custom_updated_at: journal.custom_updated_at,
        }}
        hasCoverImage={hasCoverImage}
      />

      {/* Footer */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />
        最后更新: {journal.updated_at}
      </div>
    </div>
  );
}

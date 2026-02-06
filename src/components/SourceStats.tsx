"use client";

import { useState, useCallback } from "react";
import { X, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import type { SourceStat } from "./CrawlControls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SOURCE_LABELS: Record<string, string> = {
  openalex: "OpenAlex",
  crossref: "Crossref",
  doaj: "DOAJ",
  nlm: "NLM",
  wikidata: "Wikidata",
  wikipedia: "Wikipedia",
};

type FailedRecord = {
  journalId: string;
  source: string;
  httpStatus: number | null;
  errorMessage: string | null;
  retryCount: number;
  lastFetchedAt: string | null;
};

export default function SourceStats({ stats }: { stats: SourceStat[] }) {
  const [showFailed, setShowFailed] = useState<string | null>(null);
  const [failedRecords, setFailedRecords] = useState<FailedRecord[]>([]);
  const [failedTotal, setFailedTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const loadFailedRecords = useCallback(async (source: string | null) => {
    setLoading(true);
    try {
      const url = source
        ? `/api/crawl/failed?source=${encodeURIComponent(source)}&pageSize=50`
        : `/api/crawl/failed?pageSize=50`;
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (json?.rows) {
        setFailedRecords(json.rows);
        setFailedTotal(json.total ?? 0);
      }
    } catch {
      setFailedRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClickFailed = async (source: string | null) => {
    if (showFailed === source) {
      setShowFailed(null);
      return;
    }
    setShowFailed(source);
    await loadFailedRecords(source);
  };

  if (stats.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">数据源统计</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            暂无统计数据，请先运行全量抓取任务。
          </p>
        </CardContent>
      </Card>
    );
  }

  const totals = stats.reduce(
    (acc, s) => ({
      pending: acc.pending + s.pending,
      success: acc.success + s.success,
      no_data: acc.no_data + s.no_data,
      failed: acc.failed + s.failed,
    }),
    { pending: 0, success: 0, no_data: 0, failed: 0 },
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">数据源统计</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>数据源</TableHead>
                <TableHead className="text-right">成功</TableHead>
                <TableHead className="text-right">无数据</TableHead>
                <TableHead className="text-right">失败</TableHead>
                <TableHead className="text-right">待处理</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((s) => (
                <TableRow key={s.source}>
                  <TableCell className="font-medium">{SOURCE_LABELS[s.source] ?? s.source}</TableCell>
                  <TableCell className="text-right text-emerald-500">
                    {s.success.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {s.no_data.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.failed > 0 ? (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-destructive"
                        onClick={() => handleClickFailed(s.source)}
                      >
                        {s.failed.toLocaleString()}
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {s.pending.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold border-t-2">
                <TableCell>总计</TableCell>
                <TableCell className="text-right text-emerald-500">
                  {totals.success.toLocaleString()}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {totals.no_data.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {totals.failed > 0 ? (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-destructive font-semibold"
                      onClick={() => handleClickFailed(null)}
                    >
                      {totals.failed.toLocaleString()}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {totals.pending.toLocaleString()}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {showFailed !== null && (
            <div className="mt-3 border-t pt-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium">
                    失败详情 {showFailed ? `(${SOURCE_LABELS[showFailed] ?? showFailed})` : "(全部)"}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {failedTotal} 条
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFailed(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {loading ? (
                <p className="text-sm text-muted-foreground">加载中...</p>
              ) : failedRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无失败记录</p>
              ) : (
                <ScrollArea className="h-[200px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">期刊 ID</TableHead>
                        <TableHead className="text-xs">数据源</TableHead>
                        <TableHead className="text-xs">HTTP</TableHead>
                        <TableHead className="text-xs">错误信息</TableHead>
                        <TableHead className="text-xs text-right">重试</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {failedRecords.map((r, i) => (
                        <TableRow key={`${r.journalId}-${r.source}-${i}`}>
                          <TableCell className="font-mono text-xs text-primary">
                            {r.journalId}
                          </TableCell>
                          <TableCell className="text-xs">
                            {SOURCE_LABELS[r.source] ?? r.source}
                          </TableCell>
                          <TableCell className="text-xs text-destructive">
                            {r.httpStatus ?? "-"}
                          </TableCell>
                          <TableCell className="text-xs max-w-[150px] truncate" title={r.errorMessage ?? ""}>
                            {r.errorMessage ?? "-"}
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            {r.retryCount}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {failedTotal > 50 && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      仅显示前 50 条，共 {failedTotal} 条
                    </p>
                  )}
                </ScrollArea>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

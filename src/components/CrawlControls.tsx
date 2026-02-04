"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  Square,
  RotateCcw,
  Trash2,
  RefreshCw,
  Database,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import SourceStats from "./SourceStats";
import CrawlLogs from "./CrawlLogs";

type CrawlRun = {
  id: string;
  status: string;
  phase: string;
  started_at?: string;
  ended_at?: string | null;
  openalex_cursor?: string | null;
  processed?: number;
  succeeded?: number;
  failed?: number;
  total_journals?: number;
  current_journal_id?: string | null;
  last_error?: string | null;
};

type CrawlEvent =
  | { type: "hello" | "ping" | "end"; at: number; runId?: string; note?: string }
  | { type: "collect_progress"; page: number; totalJournals: number; at: number }
  | { type: "collect_log"; level: "info" | "warn" | "error"; message: string; at: number }
  | { type: "collect_done"; totalJournals: number; at: number }
  | { type: "fetch_progress"; processed: number; total: number; currentJournalId: string; at: number }
  | { type: "fetch_source"; journalId: string; source: string; status: string; httpStatus: number | null; at: number }
  | { type: "fetch_log"; level: "info" | "warn" | "error"; message: string; at: number }
  | { type: "fetch_done"; processed: number; at: number }
  | { type: "phase_change"; phase: string; at: number }
  | { type: "run_done"; at: number };

export type SourceStat = {
  source: string;
  pending: number;
  success: number;
  no_data: number;
  failed: number;
};

export type LogItem = {
  at: number;
  journalId?: string;
  source?: string;
  status?: string;
  message?: string;
};

export default function CrawlControls() {
  const [run, setRun] = useState<CrawlRun | null>(null);
  const [stats, setStats] = useState<SourceStat[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [collectProgress, setCollectProgress] = useState<{ page: number; totalJournals: number } | null>(null);
  const [fetchProgress, setFetchProgress] = useState<{ processed: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [totalJournals, setTotalJournals] = useState(0);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [canContinue, setCanContinue] = useState(false);
  const [lastStoppedRun, setLastStoppedRun] = useState<CrawlRun | null>(null);
  const [maxPages, setMaxPages] = useState<string>("");
  const esRef = useRef<EventSource | null>(null);

  const runId = run?.id ?? null;
  const running = run?.status === "running";
  const phase = run?.phase ?? null;

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/crawl/stats", { cache: "no-store" });
      const json = await res.json();
      if (json?.bySource) setStats(json.bySource);
      if (json?.totalJournals !== undefined) setTotalJournals(json.totalJournals);
      if (json?.currentVersionFormatted !== undefined) setCurrentVersion(json.currentVersionFormatted);
    } catch {
      // ignore
    }
  }, []);

  const checkCanContinue = useCallback(async () => {
    try {
      const res = await fetch("/api/crawl/status", { cache: "no-store" });
      const json = await res.json();
      setCanContinue(Boolean(json?.canContinue));
      setLastStoppedRun(json?.lastStoppedRun ?? null);
    } catch {
      setCanContinue(false);
      setLastStoppedRun(null);
    }
  }, []);

  async function refreshStatus(id: string) {
    try {
      const res = await fetch(`/api/crawl/status?runId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = await res.json();
      if (json?.run) setRun(json.run);
    } catch {
      // ignore
    }
  }

  function connectStream(id: string) {
    esRef.current?.close();
    setLogs([]);
    setCollectProgress(null);
    setFetchProgress(null);

    const es = new EventSource(`/api/crawl/stream?runId=${encodeURIComponent(id)}`);
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as CrawlEvent;

        if (ev.type === "collect_progress") {
          setCollectProgress({ page: ev.page, totalJournals: ev.totalJournals });
          return;
        }

        if (ev.type === "collect_log") {
          setLogs((prev) => [{ at: ev.at, message: ev.message }, ...prev].slice(0, 100));
          return;
        }

        if (ev.type === "collect_done") {
          setCollectProgress({ page: -1, totalJournals: ev.totalJournals });
          return;
        }

        if (ev.type === "fetch_progress") {
          setFetchProgress({ processed: ev.processed, total: ev.total });
          return;
        }

        if (ev.type === "fetch_source") {
          setLogs((prev) =>
            [{ at: ev.at, journalId: ev.journalId, source: ev.source, status: ev.status }, ...prev].slice(0, 100),
          );
          loadStats();
          return;
        }

        if (ev.type === "fetch_log") {
          setLogs((prev) => [{ at: ev.at, message: ev.message }, ...prev].slice(0, 100));
          return;
        }

        if (ev.type === "phase_change") {
          setRun((r) => (r ? { ...r, phase: ev.phase } : r));
          return;
        }

        if (ev.type === "run_done" || ev.type === "end") {
          loadStats();
          checkCanContinue();
          return;
        }
      } catch {
        // ignore parse errors
      }
    };
    es.onerror = () => {
      // 浏览器会自动重连
    };
    esRef.current = es;
  }

  useEffect(() => {
    const stored = localStorage.getItem("crawlRunId");
    if (stored) {
      setRun({ id: stored, status: "unknown", phase: "unknown" });
    }
    loadStats();
    checkCanContinue();
  }, [loadStats, checkCanContinue]);

  useEffect(() => {
    if (!runId) return;
    connectStream(runId);
    refreshStatus(runId);
    const t = setInterval(() => {
      refreshStatus(runId);
      loadStats();
    }, 3000);
    return () => {
      clearInterval(t);
      esRef.current?.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, loadStats]);

  async function startFull() {
    const hasExistingData = totalJournals > 0 || Boolean(currentVersion);
    if (hasExistingData) {
      const confirmed = confirm(
        `当前已有 ${totalJournals.toLocaleString()} 个期刊数据（版本: ${currentVersion}）。\n\n开始全量抓取将清空已有数据。\n\n是否继续？`
      );
      if (!confirmed) return;
    }

    setBusy(true);
    try {
      const maxPagesNum = maxPages ? parseInt(maxPages, 10) : null;
      const body: Record<string, unknown> = { type: "full" };
      if (maxPagesNum && maxPagesNum > 0) {
        body.maxPages = maxPagesNum;
      }

      const res = await fetch("/api/crawl/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json?.error) {
        alert(json.error);
        return;
      }
      setRun(json.run);
      if (json?.run?.id) {
        localStorage.setItem("crawlRunId", json.run.id);
      }
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed() {
    setBusy(true);
    try {
      const res = await fetch("/api/crawl/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "retry", filter: { statuses: ["failed"] } }),
      });
      const json = await res.json();
      if (json?.error) {
        alert(json.error);
        return;
      }
      setRun(json.run);
      if (json?.run?.id) {
        localStorage.setItem("crawlRunId", json.run.id);
      }
    } finally {
      setBusy(false);
    }
  }

  async function continueLastRun() {
    setBusy(true);
    try {
      const res = await fetch("/api/crawl/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "continue" }),
      });
      const json = await res.json();
      if (json?.error) {
        alert(json.error);
        return;
      }
      setRun(json.run);
      setCanContinue(false);
      setLastStoppedRun(null);
      if (json?.run?.id) {
        localStorage.setItem("crawlRunId", json.run.id);
      }
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!runId) return;
    setBusy(true);
    try {
      await fetch("/api/crawl/stop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      setRun((r) => (r ? { ...r, status: "stopped" } : r));
      await refreshStatus(runId);
      await checkCanContinue();
    } finally {
      setBusy(false);
    }
  }

  async function clearData() {
    if (!confirm("确定要清空所有期刊数据吗？此操作不可恢复。")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/crawl/clear", {
        method: "POST",
      });
      const json = await res.json();
      if (json?.error) {
        alert(json.error);
        return;
      }
      alert(json.message ?? "已清空数据");
      setStats([]);
      setTotalJournals(0);
      setCurrentVersion(null);
      setRun(null);
      setLogs([]);
      setCollectProgress(null);
      setFetchProgress(null);
      setCanContinue(false);
      setLastStoppedRun(null);
      localStorage.removeItem("crawlRunId");
      await loadStats();
    } finally {
      setBusy(false);
    }
  }

  const getProgressPercent = () => {
    if (phase === "collecting") {
      return null;
    }
    if (phase === "fetching" && fetchProgress) {
      if (fetchProgress.total === 0) return 0;
      return Math.round((fetchProgress.processed / fetchProgress.total) * 100);
    }
    return null;
  };

  const progressPercent = getProgressPercent();
  const hasData = totalJournals > 0 || Boolean(currentVersion);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30"><Loader2 className="mr-1 h-3 w-3 animate-spin" />运行中</Badge>;
      case "completed":
        return <Badge variant="success"><CheckCircle className="mr-1 h-3 w-3" />已完成</Badge>;
      case "stopped":
        return <Badge variant="warning"><Square className="mr-1 h-3 w-3" />已停止</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />失败</Badge>;
      default:
        return <Badge variant="outline"><Clock className="mr-1 h-3 w-3" />{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">控制面板</h1>
        <p className="text-muted-foreground">管理期刊数据爬取任务</p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">期刊总数</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalJournals.toLocaleString()}</div>
            {currentVersion && (
              <p className="text-xs text-muted-foreground">版本: {currentVersion}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">成功抓取</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {stats.reduce((sum, s) => sum + s.success, 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">所有数据源成功记录</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">失败记录</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {stats.reduce((sum, s) => sum + s.failed, 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">可点击重试失败</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">任务状态</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {running ? "运行中" : canContinue ? "可继续" : "空闲"}
            </div>
            <p className="text-xs text-muted-foreground">
              {running ? `阶段: ${phase === "collecting" ? "收集" : "抓取"}` : "等待任务"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle>任务控制</CardTitle>
          <CardDescription>配置并启动数据爬取任务</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">页数限制:</span>
              <Input
                type="number"
                min="1"
                placeholder="不限制"
                value={maxPages}
                onChange={(e) => setMaxPages(e.target.value)}
                disabled={running}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">每页 200 个</span>
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={startFull} disabled={busy || running}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {maxPages ? `抓取 ${maxPages} 页` : "开始全量抓取"}
            </Button>

            {canContinue && !running && (
              <Button variant="secondary" onClick={continueLastRun} disabled={busy}>
                <RefreshCw className="mr-2 h-4 w-4" />
                继续上次任务
              </Button>
            )}

            <Button variant="outline" onClick={retryFailed} disabled={busy || running || !hasData}>
              <RotateCcw className="mr-2 h-4 w-4" />
              重试失败
            </Button>

            <Button variant="outline" onClick={clearData} disabled={busy || running || !hasData} className="text-destructive hover:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              清空数据
            </Button>

            {running && (
              <Button variant="destructive" onClick={stop} disabled={busy} className="ml-auto">
                <Square className="mr-2 h-4 w-4" />
                停止
              </Button>
            )}
          </div>

          {canContinue && lastStoppedRun && !running && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
              <p className="text-sm">
                <span className="font-medium text-blue-500">可以继续上次的任务</span>
                <span className="ml-2 text-muted-foreground">
                  阶段: {lastStoppedRun.phase === "collecting" ? "收集" : "详情抓取"}
                  {lastStoppedRun.total_journals ? ` / ${lastStoppedRun.total_journals.toLocaleString()} 个期刊` : ""}
                </span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task Status */}
      {run && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>当前任务</CardTitle>
                <CardDescription className="font-mono text-xs">{runId}</CardDescription>
              </div>
              {getStatusBadge(run.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Phase Indicator */}
            <div className="grid grid-cols-2 gap-4">
              <div className={`rounded-lg border p-4 ${phase === "collecting" ? "border-primary bg-primary/5" : collectProgress?.page === -1 ? "border-emerald-500 bg-emerald-500/5" : "border-border"}`}>
                <p className="text-xs text-muted-foreground mb-1">阶段一</p>
                <p className="font-medium">收集期刊</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {collectProgress
                    ? collectProgress.page === -1
                      ? `完成 (${collectProgress.totalJournals.toLocaleString()} 个)`
                      : `第 ${collectProgress.page} 页 / ${collectProgress.totalJournals.toLocaleString()} 个`
                    : phase === "collecting"
                      ? "进行中..."
                      : "-"}
                </p>
              </div>
              <div className={`rounded-lg border p-4 ${phase === "fetching" ? "border-primary bg-primary/5" : run.status === "completed" ? "border-emerald-500 bg-emerald-500/5" : "border-border"}`}>
                <p className="text-xs text-muted-foreground mb-1">阶段二</p>
                <p className="font-medium">详情抓取</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {fetchProgress
                    ? `${fetchProgress.processed.toLocaleString()} / ${fetchProgress.total.toLocaleString()}`
                    : run.total_journals
                      ? `0 / ${run.total_journals.toLocaleString()}`
                      : "-"}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            {progressPercent !== null && (
              <div className="space-y-2">
                <Progress value={progressPercent} className="h-2" />
                <p className="text-xs text-muted-foreground text-right">{progressPercent}%</p>
              </div>
            )}

            {/* Current Journal */}
            {run.current_journal_id && (
              <p className="text-sm text-muted-foreground">
                当前: <span className="font-mono text-primary">{run.current_journal_id}</span>
              </p>
            )}

            {/* Error */}
            {run.last_error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <p className="text-sm text-destructive">{run.last_error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Source Stats & Logs */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SourceStats stats={stats} />
        <CrawlLogs logs={logs} />
      </div>
    </div>
  );
}

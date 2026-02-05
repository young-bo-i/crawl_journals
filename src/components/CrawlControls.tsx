"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Play,
  Square,
  Pause,
  RotateCcw,
  Trash2,
  RefreshCw,
  Database,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import SourceStats from "./SourceStats";
import CrawlLogs from "./CrawlLogs";
import { useWebSocket, type WsMessage } from "@/lib/useWebSocket";

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
  producer_status?: "running" | "paused" | "completed";
  consumer_status?: "running" | "waiting" | "completed";
  producer_error?: string | null;
  collected_count?: number;
};

type CrawlEvent =
  | { type: "hello" | "ping" | "end"; at: number; runId?: string; note?: string }
  | { type: "collect_progress"; page: number; totalJournals: number; at: number }
  | { type: "collect_log"; level: "info" | "warn" | "error"; message: string; at: number }
  | { type: "collect_done"; totalJournals: number; version: number; at: number }
  | { type: "collect_paused"; reason: string; cursor: string; totalJournals: number; at: number }
  | { type: "fetch_progress"; processed: number; total: number; currentJournalId: string; at: number }
  | { type: "fetch_source"; journalId: string; source: string; status: string; httpStatus: number | null; at: number }
  | { type: "fetch_log"; level: "info" | "warn" | "error"; message: string; at: number }
  | { type: "fetch_waiting"; reason: string; at: number }
  | { type: "fetch_done"; processed: number; at: number }
  | { type: "phase_change"; phase: string; at: number }
  | { type: "pipeline_status"; producerStatus: string; consumerStatus: string; at: number }
  | { type: "run_state"; run: CrawlRun; at: number }
  | { type: "stats_update"; stats: SourceStat[]; totalJournals: number; at: number }
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
  const [maxPages, setMaxPages] = useState<string>("");
  
  const [pendingCount, setPendingCount] = useState(0);
  const [canResume, setCanResume] = useState(false);
  const [producerStatus, setProducerStatus] = useState<string | null>(null);
  const [consumerStatus, setConsumerStatus] = useState<string | null>(null);
  const [producerError, setProducerError] = useState<string | null>(null);

  const runId = run?.id ?? null;
  const running = run?.status === "running";
  const phase = run?.phase ?? null;
  const currentRunStopped = run && (run.status === "stopped" || run.status === "failed");

  // 加载统计数据
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


  // 节流加载统计（用于高频事件，最多每 3 秒刷新一次）
  const statsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const statsPendingRef = useRef(false);
  const lastStatsLoadRef = useRef(0);
  
  const loadStatsThrottled = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastStatsLoadRef.current;
    
    if (elapsed >= 3000) {
      // 距离上次刷新已超过 3 秒，立即刷新
      lastStatsLoadRef.current = now;
      loadStats();
    } else {
      // 还在冷却期，标记待刷新
      statsPendingRef.current = true;
      if (!statsTimerRef.current) {
        statsTimerRef.current = setTimeout(() => {
          statsTimerRef.current = null;
          if (statsPendingRef.current) {
            statsPendingRef.current = false;
            lastStatsLoadRef.current = Date.now();
            loadStats();
          }
        }, 3000 - elapsed);
      }
    }
  }, [loadStats]);

  // 从后端获取当前状态
  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/crawl/status", { cache: "no-store" });
      const json = await res.json();
      
      console.log("[refreshStatus] API response:", {
        hasRun: Boolean(json?.run),
        runId: json?.run?.id,
        runStatus: json?.run?.status,
        canContinue: json?.canContinue,
        canResume: json?.canResume,
      });
      
      // API 现在直接返回最近的任务（包括已停止的）
      if (json?.run) {
        setRun(json.run);
        setProducerStatus(json.producerStatus ?? json.run.producer_status ?? null);
        setConsumerStatus(json.consumerStatus ?? json.run.consumer_status ?? null);
        setProducerError(json.producerError ?? json.run.producer_error ?? null);
      } else {
        console.log("[refreshStatus] No run in response, setting run to null");
        setRun(null);
        setProducerStatus(null);
        setConsumerStatus(null);
        setProducerError(null);
      }
      
      setCanContinue(Boolean(json?.canContinue));
      setCanResume(Boolean(json?.canResume));
      setPendingCount(json?.pendingCount ?? 0);
    } catch (e) {
      console.error("[refreshStatus] Error:", e);
    }
  }, []);

  // 处理 WebSocket 事件
  const handleWsMessage = useCallback((message: WsMessage) => {
    if (message.type === "crawl_event") {
      const ev = message.event as CrawlEvent;
      
      switch (ev.type) {
        case "collect_progress":
          setCollectProgress({ page: ev.page, totalJournals: ev.totalJournals });
          setProducerStatus("running");
          break;
          
        case "collect_log":
          setLogs((prev) => [{ at: ev.at, message: ev.message }, ...prev].slice(0, 100));
          break;
          
        case "collect_done":
          setCollectProgress({ page: -1, totalJournals: ev.totalJournals });
          setProducerStatus("completed");
          break;
          
        case "collect_paused":
          setProducerStatus("paused");
          setProducerError(ev.reason);
          setCollectProgress({ page: -1, totalJournals: ev.totalJournals });
          setLogs((prev) => [{ at: ev.at, message: `生产者暂停: ${ev.reason}` }, ...prev].slice(0, 100));
          refreshStatus();
          break;
          
        case "fetch_progress":
          setFetchProgress({ processed: ev.processed, total: ev.total });
          setConsumerStatus("running");
          break;
          
        case "fetch_source":
          setLogs((prev) =>
            [{ at: ev.at, journalId: ev.journalId, source: ev.source, status: ev.status }, ...prev].slice(0, 100),
          );
          // 统计数据现在通过 stats_update 事件推送，不再需要轮询
          break;
          
        case "stats_update":
          // 实时更新统计数据
          setStats(ev.stats);
          setTotalJournals(ev.totalJournals);
          break;
          
        case "fetch_log":
          setLogs((prev) => [{ at: ev.at, message: ev.message }, ...prev].slice(0, 100));
          break;
          
        case "fetch_waiting":
          setConsumerStatus("waiting");
          setLogs((prev) => [{ at: ev.at, message: `消费者等待: ${ev.reason}` }, ...prev].slice(0, 100));
          break;
          
        case "phase_change":
          setRun((r) => (r ? { ...r, phase: ev.phase } : r));
          break;
          
        case "pipeline_status":
          setProducerStatus(ev.producerStatus);
          setConsumerStatus(ev.consumerStatus);
          break;
          
        case "run_state":
          // 服务端推送的完整任务状态
          setRun(ev.run);
          if (ev.run.producer_status) setProducerStatus(ev.run.producer_status);
          if (ev.run.consumer_status) setConsumerStatus(ev.run.consumer_status);
          if (ev.run.producer_error) setProducerError(ev.run.producer_error);
          break;
          
        case "run_done":
        case "end":
          loadStats();
          refreshStatus();
          break;
      }
    }
  }, [loadStats, refreshStatus]);

  // WebSocket 连接
  const { connected, subscribe } = useWebSocket({
    onMessage: handleWsMessage,
    onOpen: () => {
      console.log("[CrawlControls] WebSocket connected, refreshing status...");
      refreshStatus();
    },
  });

  // 初始化加载
  useEffect(() => {
    loadStats();
    refreshStatus();
  }, [loadStats, refreshStatus]);

  // 当 runId 变化时，订阅该任务的事件
  useEffect(() => {
    if (connected && runId) {
      subscribe(runId);
    }
  }, [connected, runId, subscribe]);

  // 清理防抖定时器
  useEffect(() => {
    return () => {
      if (statsTimerRef.current) {
        clearTimeout(statsTimerRef.current);
      }
    };
  }, []);

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
      // 设置任务状态
      setRun(json.run);
      setProducerStatus("running");
      setConsumerStatus(null);
      setProducerError(null);
      setCollectProgress(null);
      setFetchProgress(null);
      setLogs([]);
      // 订阅该任务的事件
      if (connected) {
        subscribe(json.run.id);
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
      setLogs([]);
      if (connected) subscribe(json.run.id);
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
      setLogs([]);
      if (connected) subscribe(json.run.id);
    } finally {
      setBusy(false);
    }
  }

  async function resumePaused() {
    setBusy(true);
    try {
      const res = await fetch("/api/crawl/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "resume" }),
      });
      const json = await res.json();
      if (json?.error) {
        alert(json.error);
        return;
      }
      setRun(json.run);
      setCanResume(false);
      setProducerError(null);
      setLogs([]);
      if (connected) subscribe(json.run.id);
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
      // WebSocket 会自动推送状态更新，但也可以手动刷新
      await refreshStatus();
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
      setPendingCount(0);
      setCanResume(false);
      setProducerStatus(null);
      setConsumerStatus(null);
      setProducerError(null);
      await loadStats();
    } finally {
      setBusy(false);
    }
  }

  const getProgressPercent = () => {
    if (phase === "collecting") return null;
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
        return <Badge variant="warning"><Pause className="mr-1 h-3 w-3" />已暂停</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />失败</Badge>;
      default:
        return <Badge variant="outline"><Clock className="mr-1 h-3 w-3" />{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with WebSocket status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">控制面板</h1>
          <p className="text-muted-foreground">管理期刊数据爬取任务</p>
        </div>
        <Badge variant={connected ? "success" : "destructive"} className="text-xs">
          {connected ? <Wifi className="mr-1 h-3 w-3" /> : <WifiOff className="mr-1 h-3 w-3" />}
          {connected ? "已连接" : "未连接"}
        </Badge>
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
              {running ? "运行中" : (canContinue || currentRunStopped || canResume) ? "已暂停" : "空闲"}
            </div>
            <p className="text-xs text-muted-foreground">
              {running 
                ? `生产者: ${producerStatus === "running" ? "收集中" : producerStatus === "completed" ? "完成" : producerStatus ?? "-"} / 消费者: ${consumerStatus === "running" ? "抓取中" : consumerStatus === "waiting" ? "等待" : consumerStatus ?? "-"}`
                : (canContinue || currentRunStopped || canResume)
                  ? "点击继续按钮恢复任务"
                  : "等待任务"}
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

            {canResume && !running && (
              <Button variant="default" onClick={resumePaused} disabled={busy} className="bg-amber-500 hover:bg-amber-600">
                <Play className="mr-2 h-4 w-4" />
                恢复暂停任务
              </Button>
            )}

            {(canContinue || currentRunStopped) && !canResume && !running && (
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
              <Button variant="outline" onClick={stop} disabled={busy} className="ml-auto border-amber-500 text-amber-500 hover:bg-amber-500/10">
                <Pause className="mr-2 h-4 w-4" />
                暂停
              </Button>
            )}
          </div>

          {/* Resumable task info - 生产者暂停 */}
          {canResume && run && !running && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm">
                <span className="font-medium text-amber-600 dark:text-amber-400">生产者已暂停，可以恢复</span>
                <span className="ml-2 text-muted-foreground">
                  已收集: {run.collected_count?.toLocaleString() ?? run.total_journals?.toLocaleString() ?? "?"} 个期刊
                  {run.producer_error && ` / 原因: ${run.producer_error}`}
                </span>
              </p>
            </div>
          )}

          {/* Continuable task info - 任务已停止 */}
          {(canContinue || currentRunStopped) && !canResume && !running && run && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
              <p className="text-sm">
                <span className="font-medium text-blue-500">可以继续上次的任务</span>
                <span className="ml-2 text-muted-foreground">
                  阶段: {run.phase === "collecting" ? "收集" : "详情抓取"}
                  {run.total_journals ? ` / ${run.total_journals.toLocaleString()} 个期刊` : ""}
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
              <div className="flex items-center gap-2">
                {getStatusBadge(run.status)}
                {/* 任务控制按钮 */}
                {running ? (
                  <Button size="sm" variant="outline" onClick={stop} disabled={busy} className="border-amber-500 text-amber-500 hover:bg-amber-500/10">
                    <Pause className="mr-1 h-3 w-3" />
                    暂停
                  </Button>
                ) : (run.status === "stopped" || run.status === "failed") && (
                  <Button size="sm" variant="default" onClick={continueLastRun} disabled={busy} className="bg-primary">
                    <Play className="mr-1 h-3 w-3" />
                    继续
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pipeline Status */}
            <div className="grid grid-cols-2 gap-4">
              {/* Producer */}
              <div className={`rounded-lg border p-4 ${
                producerStatus === "running" ? "border-primary bg-primary/5" : 
                producerStatus === "paused" ? "border-amber-500 bg-amber-500/5" :
                producerStatus === "completed" ? "border-emerald-500 bg-emerald-500/5" : 
                "border-border"
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">生产者 (OpenAlex)</p>
                  {producerStatus === "running" && (
                    <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-xs">
                      <Loader2 className="mr-1 h-2 w-2 animate-spin" />运行中
                    </Badge>
                  )}
                  {producerStatus === "paused" && (
                    <Badge variant="warning" className="text-xs">
                      <Clock className="mr-1 h-2 w-2" />已暂停
                    </Badge>
                  )}
                  {producerStatus === "completed" && (
                    <Badge variant="success" className="text-xs">
                      <CheckCircle className="mr-1 h-2 w-2" />完成
                    </Badge>
                  )}
                </div>
                <p className="font-medium">收集期刊</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {collectProgress
                    ? collectProgress.page === -1
                      ? `已收集 ${collectProgress.totalJournals.toLocaleString()} 个`
                      : `第 ${collectProgress.page} 页 / ${collectProgress.totalJournals.toLocaleString()} 个`
                    : run.collected_count
                      ? `已收集 ${run.collected_count.toLocaleString()} 个`
                      : producerStatus === "running"
                        ? "收集中..."
                        : "-"}
                </p>
              </div>
              
              {/* Consumer */}
              <div className={`rounded-lg border p-4 ${
                consumerStatus === "running" ? "border-primary bg-primary/5" : 
                consumerStatus === "waiting" ? "border-amber-500 bg-amber-500/5" :
                consumerStatus === "completed" ? "border-emerald-500 bg-emerald-500/5" : 
                "border-border"
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">消费者 (详情抓取)</p>
                  {consumerStatus === "running" && (
                    <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-xs">
                      <Loader2 className="mr-1 h-2 w-2 animate-spin" />运行中
                    </Badge>
                  )}
                  {consumerStatus === "waiting" && (
                    <Badge variant="warning" className="text-xs">
                      <Clock className="mr-1 h-2 w-2" />等待中
                    </Badge>
                  )}
                  {consumerStatus === "completed" && (
                    <Badge variant="success" className="text-xs">
                      <CheckCircle className="mr-1 h-2 w-2" />完成
                    </Badge>
                  )}
                </div>
                <p className="font-medium">详情抓取</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {fetchProgress
                    ? `${fetchProgress.processed.toLocaleString()} / ${fetchProgress.total.toLocaleString()}`
                    : run.total_journals
                      ? `0 / ${run.total_journals.toLocaleString()}`
                      : "-"}
                </p>
                {pendingCount > 0 && (
                  <p className="text-xs text-amber-500 mt-1">
                    待处理: {pendingCount.toLocaleString()} 个
                  </p>
                )}
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

            {/* Producer Error */}
            {producerError && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  <span className="font-medium">生产者暂停原因:</span> {producerError}
                </p>
              </div>
            )}

            {/* Error */}
            {run.last_error && !producerError && (
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

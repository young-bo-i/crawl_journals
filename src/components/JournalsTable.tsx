"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  ExternalLink,
  Loader2,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  Pencil,
  ImageIcon,
  ChevronDown,
  PlayCircle,
  StopCircle,
  LayoutGrid,
  LayoutList,
  CloudDownload,
} from "lucide-react";
import { useWebSocket } from "@/lib/useWebSocket";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useColumnResize, type ColumnWidthDef } from "@/lib/useColumnResize";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ColumnSelector } from "./ColumnSelector";
import { JournalFilters, DEFAULT_FILTERS, type JournalFiltersState } from "./JournalFilters";
import {
  DEFAULT_VISIBLE_COLUMNS,
  getColumnDef,
  type ColumnDef,
} from "@/shared/journal-columns";
import { JournalDetailSheet } from "./JournalDetailSheet";
import { JournalEditSheet } from "./JournalEditSheet";
import { ImageSearchPanel } from "./ImageSearchPanel";

// 国旗 emoji（根据 ISO 3166-1 alpha-2 国家代码）
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

// 从 JSON 数组项中提取可读文本
function extractItemLabel(item: unknown): string {
  if (typeof item === "string") return item;
  if (typeof item === "object" && item !== null) {
    const obj = item as Record<string, unknown>;
    const name = obj.display_name || obj.name || obj.title || obj.value || obj.label;
    if (name) return String(name);
    if (obj.currency && obj.price !== undefined) return `${obj.currency} ${obj.price}`;
    // 简洁的 JSON 预览
    const keys = Object.keys(obj);
    return keys.length <= 2
      ? keys.map((k) => `${k}: ${obj[k]}`).join(", ")
      : `{${keys.length} 字段}`;
  }
  return String(item);
}

// 格式化函数
function formatValue(value: unknown, type: ColumnDef["type"]): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/40">—</span>;
  }

  switch (type) {
    case "boolean":
      return value ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-xs text-emerald-600 dark:text-emerald-400">是</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0" />
          <span className="text-xs text-muted-foreground">否</span>
        </span>
      );

    case "number":
      return typeof value === "number" ? (
        <span className="tabular-nums text-xs">{value.toLocaleString()}</span>
      ) : (
        <span className="text-xs">{String(value)}</span>
      );

    case "date": {
      const d = String(value);
      const short = d.includes("T") ? d.split("T")[0] : d.includes(" ") ? d.split(" ")[0] : d;
      return <span className="text-xs text-muted-foreground tabular-nums">{short}</span>;
    }

    case "url":
      return value ? (
        <a
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-accent text-primary transition-colors"
          title={String(value)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <span className="text-muted-foreground/40">—</span>
      );

    case "text": {
      const text = String(value);
      return (
        <span className="line-clamp-1 text-xs" title={text}>
          {text}
        </span>
      );
    }

    case "json":
      if (Array.isArray(value)) {
        if (value.length === 0)
          return <span className="text-muted-foreground/40">—</span>;
        const label = extractItemLabel(value[0]);
        const display = label.length > 32 ? label.slice(0, 30) + "…" : label;
        return (
          <span
            className="text-xs"
            title={value.map((v) => extractItemLabel(v)).join("\n")}
          >
            {display}
            {value.length > 1 && (
              <span className="text-muted-foreground/60 ml-1">
                +{value.length - 1}
              </span>
            )}
          </span>
        );
      }
      if (typeof value === "object") {
        const keys = Object.keys(value as object);
        return (
          <span className="text-xs text-muted-foreground">
            {keys.length} 项
          </span>
        );
      }
      return <span className="text-xs">{String(value)}</span>;

    default: {
      const s = String(value);
      return (
        <span className="text-xs" title={s.length > 50 ? s : undefined}>
          {s.length > 50 ? s.slice(0, 48) + "…" : s}
        </span>
      );
    }
  }
}

export default function JournalsTable() {
  const [filters, setFilters] = useState<JournalFiltersState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<JournalFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE_COLUMNS);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Sheet states
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);

  // 封面搜索展开行
  const [expandedCoverRowId, setExpandedCoverRowId] = useState<string | null>(null);
  // 封面缓存版本号，用于强制刷新封面图片
  const [coverVersion, setCoverVersion] = useState(0);

  // 批量抓取封面（当前页，前端驱动）
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
    successCount: number;
    failCount: number;
  } | null>(null);
  const batchStopRef = useRef(false);

  // 后台异步批量抓取封面（全量，后端驱动 + WebSocket 推送）
  const [asyncBatchProgress, setAsyncBatchProgress] = useState<{
    taskId: string;
    status: "running" | "completed" | "stopped" | "error";
    total: number;
    current: number;
    successCount: number;
    failCount: number;
    skipCount: number;
    currentName: string;
    error?: string;
  } | null>(null);
  const [asyncBatchStarting, setAsyncBatchStarting] = useState(false);

  // 视图模式
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // 从 localStorage 恢复列设置和视图模式
  useEffect(() => {
    const saved = localStorage.getItem("journal-visible-columns");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setVisibleColumns(parsed);
        }
      } catch {
        // ignore
      }
    }
    const savedViewMode = localStorage.getItem("journal-view-mode");
    if (savedViewMode === "table" || savedViewMode === "grid") {
      setViewMode(savedViewMode);
    }
  }, []);

  // 保存列设置到 localStorage
  useEffect(() => {
    localStorage.setItem("journal-visible-columns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // 保存视图模式到 localStorage
  useEffect(() => {
    localStorage.setItem("journal-view-mode", viewMode);
  }, [viewMode]);

  // 构建查询参数
  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    
    if (appliedFilters.q) params.set("q", appliedFilters.q);
    if (appliedFilters.sortBy) params.set("sortBy", appliedFilters.sortBy);
    if (appliedFilters.sortOrder) params.set("sortOrder", appliedFilters.sortOrder);
    
    // 布尔筛选
    const boolMap: Record<string, string> = {
      inDoaj: "inDoaj",
      inNlm: "inNlm",
      hasWikidata: "hasWikidata",
      hasWikipedia: "hasWikipedia",
      isOpenAccess: "isOpenAccess",
      isCore: "isCore",
      isOa: "isOa",
      inScielo: "inScielo",
      isOjs: "isOjs",
      doajBoai: "doajBoai",
      inScimago: "inScimago",
      hasCover: "hasCover",
    };
    
    for (const [key, param] of Object.entries(boolMap)) {
      const value = appliedFilters[key as keyof JournalFiltersState];
      if (value === "yes") params.set(param, "true");
      else if (value === "no") params.set(param, "false");
    }
    
    // 字符串筛选
    if (appliedFilters.country) params.set("country", appliedFilters.country);
    if (appliedFilters.oaType && appliedFilters.oaType !== "all") params.set("oaType", appliedFilters.oaType);
    
    // 数值范围
    if (appliedFilters.minWorksCount) params.set("minWorksCount", appliedFilters.minWorksCount);
    if (appliedFilters.maxWorksCount) params.set("maxWorksCount", appliedFilters.maxWorksCount);
    if (appliedFilters.minCitedByCount) params.set("minCitedByCount", appliedFilters.minCitedByCount);
    if (appliedFilters.maxCitedByCount) params.set("maxCitedByCount", appliedFilters.maxCitedByCount);
    if (appliedFilters.minFirstYear) params.set("minFirstYear", appliedFilters.minFirstYear);
    if (appliedFilters.maxFirstYear) params.set("maxFirstYear", appliedFilters.maxFirstYear);
    
    // 按需选列：只请求当前视图需要的字段，减少数据库 I/O
    // 后端会自动补 id、cover_image_name、排序字段
    const neededFields = new Set<string>(visibleColumns);
    // 网格视图需要的备选标题字段（用于显示名称 fallback）
    if (viewMode === "grid") {
      neededFields.add("oa_display_name");
      neededFields.add("cr_title");
      neededFields.add("doaj_title");
      neededFields.add("oa_host_organization");
      neededFields.add("oa_country_code");
    }
    params.set("fields", Array.from(neededFields).join(","));
    
    return params.toString();
  }, [page, pageSize, appliedFilters, visibleColumns, viewMode]);

  // 加载数据
  useEffect(() => {
    let canceled = false;
    const controller = new AbortController();
    
    setLoading(true);
    
    fetch(`/api/journals?${buildQueryParams()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((j) => {
        if (canceled) return;
        setRows(j.rows ?? []);
        setTotal(j.total ?? 0);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Failed to fetch journals:", err);
        }
      })
      .finally(() => {
        if (canceled) return;
        setLoading(false);
      });

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [buildQueryParams]);

  // 搜索处理
  const handleSearch = () => {
    setAppliedFilters(filters);
    setPage(1);
  };

  // 排序处理
  const handleSort = (field: string) => {
    const newFilters = { ...filters };
    if (filters.sortBy === field) {
      newFilters.sortOrder = filters.sortOrder === "asc" ? "desc" : "asc";
    } else {
      newFilters.sortBy = field;
      newFilters.sortOrder = "desc";
    }
    setFilters(newFilters);
    setAppliedFilters(newFilters);
    setPage(1);
  };

  // 批量抓取封面（并发 5）
  const handleBatchCover = useCallback(async () => {
    const CONCURRENCY = 5;
    const noCoverRows = rows.filter((r) => !r.cover_image_name);
    if (noCoverRows.length === 0) return;

    batchStopRef.current = false;
    setBatchRunning(true);
    setBatchProgress({
      current: 0,
      total: noCoverRows.length,
      currentName: "",
      successCount: 0,
      failCount: 0,
    });

    let completed = 0;
    let successCount = 0;
    let failCount = 0;

    let skippedCount = 0;

    // 处理单个期刊封面
    const processSingle = async (row: Record<string, unknown>) => {
      if (batchStopRef.current) return;

      const rowId = row.id as string;
      const name = String(row.oa_display_name || row.cr_title || row.doaj_title || "");

      try {
        // 0. 先检查是否已有封面（防止多用户重复操作）
        const checkRes = await fetch(`/api/journals/${rowId}/cover`, { method: "HEAD" });
        if (checkRes.ok) {
          // 已有封面，跳过
          skippedCount++;
          completed++;
          setBatchProgress({
            current: completed,
            total: noCoverRows.length,
            currentName: `${name}（已有封面，跳过）`,
            successCount,
            failCount,
          });
          return;
        }

        // 1. 搜索图片
        const searchRes = await fetch(
          `/api/image-search?q=${encodeURIComponent(name + " journal cover")}`
        );
        if (!searchRes.ok) throw new Error("搜索失败");
        const searchData = await searchRes.json();
        const results: { url: string; width: number; height: number }[] =
          searchData.results ?? [];

        if (results.length === 0) {
          failCount++;
        } else if (!batchStopRef.current) {
          // 2. 从前 3 张中选尺寸最大的一张上传
          const candidates = results.slice(0, 3);
          const best = candidates.reduce((a, b) =>
            (a.width || 0) * (a.height || 0) >= (b.width || 0) * (b.height || 0)
              ? a
              : b
          );

          const uploadRes = await fetch(`/api/journals/${rowId}/cover`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl: best.url }),
          });

          if (!uploadRes.ok) throw new Error("上传失败");
          successCount++;
        }
      } catch (err) {
        console.error(`Batch cover error for ${rowId}:`, err);
        failCount++;
      }

      completed++;
      setBatchProgress({
        current: completed,
        total: noCoverRows.length,
        currentName: name,
        successCount,
        failCount,
      });
    };

    // 并发池：维持最多 CONCURRENCY 个并行任务
    const queue = [...noCoverRows];
    const running: Promise<void>[] = [];

    while (queue.length > 0 || running.length > 0) {
      if (batchStopRef.current) break;

      // 填满并发池
      while (running.length < CONCURRENCY && queue.length > 0) {
        const row = queue.shift()!;
        const task = processSingle(row).then(() => {
          running.splice(running.indexOf(task), 1);
        });
        running.push(task);
      }

      // 等待任一任务完成
      if (running.length > 0) {
        await Promise.race(running);
      }
    }

    // 等待剩余任务完成
    await Promise.all(running);

    // 完成后刷新列表
    setCoverVersion((v) => v + 1);
    setAppliedFilters((prev) => ({ ...prev }));
    setBatchRunning(false);
  }, [rows]);

  // ===== 后台异步批量封面抓取 =====

  // WebSocket 监听后台进度
  useWebSocket({
    onMessage: useCallback((msg: { type: string; [key: string]: any }) => {
      if (msg.type === "batch_cover_event" && msg.event) {
        setAsyncBatchProgress(msg.event);
        // 任务完成后刷新列表
        if (msg.event.status === "completed" || msg.event.status === "stopped") {
          setCoverVersion((v) => v + 1);
          setAppliedFilters((prev) => ({ ...prev }));
        }
      }
    }, []),
  });

  // 页面加载时查询后台任务状态
  useEffect(() => {
    fetch("/api/batch-cover", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok && data.status) {
          setAsyncBatchProgress(data.status);
        }
      })
      .catch(() => {});
  }, []);

  // 启动后台异步批量抓取
  const handleAsyncBatchCover = useCallback(async () => {
    setAsyncBatchStarting(true);
    try {
      // 构建当前筛选条件
      const filterMap: Record<string, string> = {};
      if (appliedFilters.q) filterMap.q = appliedFilters.q;

      const boolMap: Record<string, string> = {
        inDoaj: "inDoaj", inNlm: "inNlm", hasWikidata: "hasWikidata",
        hasWikipedia: "hasWikipedia", isOpenAccess: "isOpenAccess",
        isCore: "isCore", isOa: "isOa", inScielo: "inScielo",
        isOjs: "isOjs", doajBoai: "doajBoai", inScimago: "inScimago",
        hasCover: "hasCover",
      };
      for (const [key, param] of Object.entries(boolMap)) {
        const value = appliedFilters[key as keyof JournalFiltersState];
        if (value === "yes") filterMap[param] = "true";
        else if (value === "no") filterMap[param] = "false";
      }
      if (appliedFilters.country) filterMap.country = appliedFilters.country;
      if (appliedFilters.oaType && appliedFilters.oaType !== "all") filterMap.oaType = appliedFilters.oaType;
      if (appliedFilters.minWorksCount) filterMap.minWorksCount = appliedFilters.minWorksCount;
      if (appliedFilters.maxWorksCount) filterMap.maxWorksCount = appliedFilters.maxWorksCount;
      if (appliedFilters.minCitedByCount) filterMap.minCitedByCount = appliedFilters.minCitedByCount;
      if (appliedFilters.maxCitedByCount) filterMap.maxCitedByCount = appliedFilters.maxCitedByCount;
      if (appliedFilters.minFirstYear) filterMap.minFirstYear = appliedFilters.minFirstYear;
      if (appliedFilters.maxFirstYear) filterMap.maxFirstYear = appliedFilters.maxFirstYear;

      const res = await fetch("/api/batch-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: filterMap }),
      });
      const data = await res.json();

      if (!data.ok) {
        alert(data.error || "启动失败");
      }
    } catch (err: any) {
      alert(err?.message || "请求失败");
    } finally {
      setAsyncBatchStarting(false);
    }
  }, [appliedFilters]);

  // 停止后台异步批量抓取
  const handleStopAsyncBatch = useCallback(async () => {
    try {
      await fetch("/api/batch-cover", { method: "DELETE" });
    } catch {
      // ignore
    }
  }, []);

  // 导出 URL
  const exportUrl = useMemo(() => {
    return `/api/journals/export.xlsx?${buildQueryParams()}`;
  }, [buildQueryParams]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  // 获取可见列的定义
  const visibleColumnDefs = useMemo(() => {
    return visibleColumns
      .map((key) => getColumnDef(key))
      .filter((def): def is ColumnDef => def !== undefined);
  }, [visibleColumns]);

  // ===== Sticky 表格布局相关 =====
  const FIRST_COL_W = 60;
  const LAST_COL_W = 80;

  // 列宽定义数组
  const columnWidthDefs = useMemo<ColumnWidthDef[]>(
    () =>
      visibleColumnDefs.map((col) => ({
        key: col.key,
        defaultWidth: col.width || 150,
      })),
    [visibleColumnDefs],
  );

  const { totalBaseWidth, getComputedWidths, onResizeStart } = useColumnResize(
    columnWidthDefs,
    { storageKey: "journal-col-widths", minWidth: 60 },
  );

  // 监听容器宽度
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 中间列可用宽度 & 计算后的列宽
  const middleAvailable = Math.max(0, containerWidth - FIRST_COL_W - LAST_COL_W);
  const computedWidths = useMemo(
    () => getComputedWidths(middleAvailable),
    [getComputedWidths, middleAvailable],
  );
  const middleTotalWidth = Object.values(computedWidths).reduce((a, b) => a + b, 0);
  const tableMinWidth = FIRST_COL_W + middleTotalWidth + LAST_COL_W;

  // 渲染排序图标
  const renderSortIcon = (field: string) => {
    if (appliedFilters.sortBy !== field) {
      return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    }
    return appliedFilters.sortOrder === "asc" ? (
      <ArrowUp className="h-4 w-4" />
    ) : (
      <ArrowDown className="h-4 w-4" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">期刊列表</h1>
          <p className="text-xs text-muted-foreground">
            浏览和搜索已抓取的期刊数据
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ColumnSelector
            visibleColumns={visibleColumns}
            onChange={setVisibleColumns}
          />
          <Button variant="outline" asChild>
            <a href={exportUrl}>
              <Download className="mr-2 h-4 w-4" />
              导出 Excel
            </a>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <JournalFilters
        filters={filters}
        onChange={setFilters}
        onSearch={handleSearch}
        loading={loading}
      />

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {/* Stats */}
          <div className="flex items-center justify-between border-b px-3 py-2 gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {loading ? "加载中..." : `共 ${total.toLocaleString()} 条结果`}
              </p>
              {/* 批量抓取封面按钮（当前页） */}
              {!batchRunning ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBatchCover}
                  disabled={loading || rows.filter((r) => !r.cover_image_name).length === 0}
                  className="gap-1"
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                  当前页抓取
                  {rows.filter((r) => !r.cover_image_name).length > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {rows.filter((r) => !r.cover_image_name).length}
                    </Badge>
                  )}
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    batchStopRef.current = true;
                  }}
                  className="gap-1"
                >
                  <StopCircle className="h-3.5 w-3.5" />
                  停止
                </Button>
              )}

              {/* 后台全量抓取封面按钮 */}
              {asyncBatchProgress?.status !== "running" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAsyncBatchCover}
                  disabled={loading || asyncBatchStarting}
                  className="gap-1"
                >
                  {asyncBatchStarting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CloudDownload className="h-3.5 w-3.5" />
                  )}
                  后台全量抓取
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleStopAsyncBatch}
                  className="gap-1"
                >
                  <StopCircle className="h-3.5 w-3.5" />
                  停止后台任务
                </Button>
              )}
            </div>

            {/* 批量进度 */}
            {batchProgress && batchRunning && (
              <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span className="truncate max-w-[200px]">
                      {batchProgress.currentName || "准备中..."}
                    </span>
                    <span>
                      {batchProgress.current}/{batchProgress.total}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{
                        width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex gap-3 text-xs mt-1">
                    <span className="text-emerald-600">
                      成功 {batchProgress.successCount}
                    </span>
                    <span className="text-red-500">
                      失败 {batchProgress.failCount}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 批量完成结果（非运行时显示最后结果） */}
            {batchProgress && !batchRunning && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  当前页完成：成功 {batchProgress.successCount}，失败{" "}
                  {batchProgress.failCount}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => setBatchProgress(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            {/* 后台异步批量进度 */}
            {asyncBatchProgress && asyncBatchProgress.status === "running" && (
              <div className="flex items-center gap-3 flex-1 min-w-[260px]">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span className="flex items-center gap-1">
                      <CloudDownload className="h-3 w-3" />
                      <span className="truncate max-w-[180px]">
                        {asyncBatchProgress.currentName || "准备中..."}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {asyncBatchProgress.current}/{asyncBatchProgress.total}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${asyncBatchProgress.total > 0
                          ? (asyncBatchProgress.current / asyncBatchProgress.total) * 100
                          : 0}%`,
                      }}
                    />
                  </div>
                  <div className="flex gap-3 text-xs mt-1">
                    <span className="text-emerald-600">
                      成功 {asyncBatchProgress.successCount}
                    </span>
                    <span className="text-red-500">
                      失败 {asyncBatchProgress.failCount}
                    </span>
                    {asyncBatchProgress.skipCount > 0 && (
                      <span className="text-muted-foreground">
                        跳过 {asyncBatchProgress.skipCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 后台异步批量完成/停止/错误结果 */}
            {asyncBatchProgress && asyncBatchProgress.status !== "running" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CloudDownload className="h-3 w-3" />
                <span>
                  {asyncBatchProgress.status === "completed"
                    ? "后台完成"
                    : asyncBatchProgress.status === "stopped"
                      ? "后台已停止"
                      : "后台出错"}
                  ：成功 {asyncBatchProgress.successCount}，失败{" "}
                  {asyncBatchProgress.failCount}
                  {asyncBatchProgress.skipCount > 0 &&
                    `，跳过 ${asyncBatchProgress.skipCount}`}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => setAsyncBatchProgress(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2">
              {/* 视图切换 */}
              <div className="flex items-center border rounded-md">
                <Button
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 px-2 rounded-r-none"
                  onClick={() => setViewMode("table")}
                  title="表格视图"
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 px-2 rounded-l-none"
                  onClick={() => setViewMode("grid")}
                  title="封面大图视图"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                显示 {visibleColumnDefs.length} 列
              </p>
            </div>
          </div>

          {/* 表格视图 */}
          {viewMode === "table" && (
            <div ref={tableContainerRef} className="w-full overflow-hidden">
              <div className="overflow-x-auto">
                <Table
                  style={{
                    tableLayout: "fixed",
                    minWidth: tableMinWidth,
                    width: containerWidth > tableMinWidth ? containerWidth : tableMinWidth,
                  }}
                >
                  <colgroup>
                    <col style={{ width: FIRST_COL_W }} />
                    {visibleColumnDefs.map((col) => (
                      <col
                        key={col.key}
                        style={{ width: computedWidths[col.key] || col.width || 150 }}
                      />
                    ))}
                    <col style={{ width: LAST_COL_W }} />
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      {/* 封面 - sticky left */}
                      <TableHead
                        className="sticky left-0 z-20 bg-background text-center sticky-left-shadow"
                        style={{ width: FIRST_COL_W }}
                      >
                        封面
                      </TableHead>
                      {/* 中间列 */}
                      {visibleColumnDefs.map((col) => (
                        <TableHead
                          key={col.key}
                          className="whitespace-nowrap relative group"
                        >
                          <div className="flex items-center gap-1 pr-2">
                            {col.sortable ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-0 font-medium hover:bg-transparent gap-1"
                                onClick={() => handleSort(col.key)}
                              >
                                {col.label}
                                {renderSortIcon(col.key)}
                              </Button>
                            ) : (
                              col.label
                            )}
                          </div>
                          {/* 拖拽把手 */}
                          <div
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity"
                            onMouseDown={(e) => onResizeStart(col.key, e)}
                          />
                        </TableHead>
                      ))}
                      {/* 操作 - sticky right */}
                      <TableHead
                        className="sticky right-0 z-20 bg-background sticky-right-shadow"
                        style={{ width: LAST_COL_W }}
                      >
                        操作
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const rowId = row.id as string;
                      const hasCover = !!row.cover_image_name;
                      const isExpanded = expandedCoverRowId === rowId;

                      return (
                        <React.Fragment key={rowId}>
                          <TableRow>
                            {/* 封面列 - sticky left */}
                            <TableCell className="sticky left-0 z-10 bg-background text-center p-1 sticky-left-shadow">
                              {hasCover ? (
                                <button
                                  className="relative group mx-auto block w-10 h-10 rounded overflow-hidden border hover:ring-2 hover:ring-primary transition-all"
                                  onClick={() =>
                                    setExpandedCoverRowId(isExpanded ? null : rowId)
                                  }
                                  title="点击搜索/更换封面"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={`/api/journals/${rowId}/cover?v=${coverVersion}`}
                                    alt="封面"
                                    className="w-full h-full object-cover"
                                  />
                                  {isExpanded && (
                                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                      <ChevronDown className="h-4 w-4 text-primary" />
                                    </div>
                                  )}
                                </button>
                              ) : (
                                <button
                                  className={`mx-auto flex items-center justify-center w-10 h-10 rounded border-2 border-dashed transition-colors ${
                                    isExpanded
                                      ? "border-primary bg-primary/5 text-primary"
                                      : "border-muted-foreground/30 text-muted-foreground/50 hover:border-primary hover:text-primary hover:bg-primary/5"
                                  }`}
                                  onClick={() =>
                                    setExpandedCoverRowId(isExpanded ? null : rowId)
                                  }
                                  title="点击搜索封面图片"
                                >
                                  <ImageIcon className="h-4 w-4" />
                                </button>
                              )}
                            </TableCell>
                            {/* 中间列 */}
                            {visibleColumnDefs.map((col) => (
                              <TableCell key={col.key} className="whitespace-nowrap overflow-hidden text-ellipsis">
                                {/* OpenAlex ID — 可点击，monospace */}
                                {col.key === "id" ? (
                                  <button
                                    onClick={() => {
                                      setSelectedJournalId(rowId);
                                      setDetailSheetOpen(true);
                                    }}
                                    className="text-primary hover:underline font-mono text-xs"
                                    title={rowId}
                                  >
                                    {rowId}
                                  </button>
                                ) : /* ISSN-L — monospace */
                                col.key === "issn_l" ? (
                                  <span className="font-mono text-xs">
                                    {String(row.issn_l || "—")}
                                  </span>
                                ) : /* 期刊名称 — 加粗, 单行截断 */
                                col.key === "oa_display_name" ? (
                                  <span
                                    className="line-clamp-1 font-medium text-[13px]"
                                    title={String(row.oa_display_name || "")}
                                  >
                                    {String(row.oa_display_name || "—")}
                                  </span>
                                ) : /* ISSN 列表 — 紧凑 monospace，逗号分隔 */
                                col.key === "issns" ? (
                                  (() => {
                                    const issns = row.issns;
                                    if (!Array.isArray(issns) || issns.length === 0)
                                      return <span className="text-muted-foreground/40">—</span>;
                                    return (
                                      <span
                                        className="font-mono text-xs"
                                        title={issns.join(", ")}
                                      >
                                        {String(issns[0])}
                                        {issns.length > 1 && (
                                          <span className="text-muted-foreground/60 ml-1">
                                            +{issns.length - 1}
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })()
                                ) : /* 类型 — 彩色小标签 */
                                col.key === "oa_type" ? (
                                  row.oa_type ? (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] font-normal px-1.5 py-0"
                                    >
                                      {String(row.oa_type)}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground/40">—</span>
                                  )
                                ) : /* 出版机构 — 单行截断 */
                                col.key === "oa_host_organization" ? (
                                  <span
                                    className="line-clamp-1 text-xs"
                                    title={String(row.oa_host_organization || "")}
                                  >
                                    {String(row.oa_host_organization || "—")}
                                  </span>
                                ) : /* 出版机构 ID — 紧凑 monospace */
                                col.key === "oa_host_organization_id" ? (
                                  row.oa_host_organization_id ? (
                                    <span
                                      className="font-mono text-xs text-muted-foreground"
                                      title={String(row.oa_host_organization_id)}
                                    >
                                      {String(row.oa_host_organization_id).length > 14
                                        ? String(row.oa_host_organization_id).slice(0, 12) + "…"
                                        : String(row.oa_host_organization_id)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/40">—</span>
                                  )
                                ) : /* 国家/地区 — 国旗 + 代码 */
                                col.key === "oa_country_code" || col.key === "doaj_country" ? (
                                  (() => {
                                    const code = String(row[col.key] || "");
                                    if (!code) return <span className="text-muted-foreground/40">—</span>;
                                    const flag = countryFlag(code);
                                    return (
                                      <span className="inline-flex items-center gap-1.5 text-xs">
                                        {flag && <span className="text-base leading-none">{flag}</span>}
                                        <span>{code}</span>
                                      </span>
                                    );
                                  })()
                                ) : /* CR/DOAJ 标题 — 单行截断 */
                                col.key === "cr_title" || col.key === "doaj_title" || col.key === "doaj_alternative_title" || col.key === "wikipedia_article_title" || col.key === "wikipedia_description" ? (
                                  <span
                                    className="line-clamp-1 text-xs"
                                    title={String(row[col.key] || "")}
                                  >
                                    {String(row[col.key] || "—")}
                                  </span>
                                ) : /* CR/DOAJ 出版社 — 单行截断 */
                                col.key === "cr_publisher" || col.key === "doaj_publisher" ? (
                                  <span
                                    className="line-clamp-1 text-xs"
                                    title={String(row[col.key] || "")}
                                  >
                                    {String(row[col.key] || "—")}
                                  </span>
                                ) : /* 自定义标题/出版社 — 单行 + 高亮标记 */
                                col.key === "custom_title" || col.key === "custom_publisher" || col.key === "custom_description" || col.key === "custom_notes" ? (
                                  row[col.key] ? (
                                    <span
                                      className="line-clamp-1 text-xs text-primary"
                                      title={String(row[col.key])}
                                    >
                                      {String(row[col.key])}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/40">—</span>
                                  )
                                ) : /* DOAJ eISSN / pISSN — monospace */
                                col.key === "doaj_eissn" || col.key === "doaj_pissn" ? (
                                  <span className="font-mono text-xs">
                                    {String(row[col.key] || "—")}
                                  </span>
                                ) : /* 默认渲染 */
                                (
                                  formatValue(row[col.key], col.type)
                                )}
                              </TableCell>
                            ))}
                            {/* 操作列 - sticky right */}
                            <TableCell className="sticky right-0 z-10 bg-background sticky-right-shadow px-2">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setSelectedJournalId(rowId);
                                    setDetailSheetOpen(true);
                                  }}
                                  title="查看详情"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setSelectedJournalId(rowId);
                                    setEditSheetOpen(true);
                                  }}
                                  title="修改"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {/* 展开的封面搜索面板 */}
                          {isExpanded && (
                            <TableRow>
                              <TableCell
                                colSpan={visibleColumnDefs.length + 2}
                                className="p-0"
                              >
                                <div
                                  className="sticky left-0"
                                  style={{ width: containerWidth || "100%" }}
                                >
                                  <ImageSearchPanel
                                    journalId={rowId}
                                    journalName={String(row.oa_display_name || row.cr_title || row.doaj_title || "")}
                                    onUploaded={() => {
                                      setCoverVersion((v) => v + 1);
                                      setExpandedCoverRowId(null);
                                      setAppliedFilters({ ...appliedFilters });
                                    }}
                                    onClose={() => setExpandedCoverRowId(null)}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {rows.length === 0 && !loading && (
                      <TableRow>
                        <TableCell
                          colSpan={visibleColumnDefs.length + 2}
                          className="h-24 text-center text-muted-foreground"
                        >
                          暂无数据（请先在控制面板运行抓取任务）
                        </TableCell>
                      </TableRow>
                    )}
                    {loading && (
                      <TableRow>
                        <TableCell
                          colSpan={visibleColumnDefs.length + 2}
                          className="h-24 text-center"
                        >
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* 封面大图网格视图 */}
          {viewMode === "grid" && (
            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : rows.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  暂无数据（请先在控制面板运行抓取任务）
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {rows.map((row) => {
                    const rowId = row.id as string;
                    const hasCover = !!row.cover_image_name;
                    const name = String(row.oa_display_name || row.cr_title || row.doaj_title || "-");
                    const publisher = String(row.oa_host_organization || "-");
                    const country = String(row.oa_country_code || "");

                    return (
                      <div
                        key={rowId}
                        className="group border rounded-lg overflow-hidden bg-card hover:shadow-md transition-shadow"
                      >
                        {/* 封面区域 */}
                        <button
                          className="relative w-full aspect-[3/4] bg-muted flex items-center justify-center overflow-hidden cursor-pointer"
                          onClick={() =>
                            setExpandedCoverRowId(
                              expandedCoverRowId === rowId ? null : rowId
                            )
                          }
                          title={hasCover ? "点击搜索/更换封面" : "点击搜索封面图片"}
                        >
                          {hasCover ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/journals/${rowId}/cover?v=${coverVersion}`}
                                alt="封面"
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                              <ImageIcon className="h-10 w-10" />
                              <span className="text-xs">无封面</span>
                            </div>
                          )}
                        </button>

                        {/* 信息区域 */}
                        <div className="p-3 space-y-1">
                          <h3
                            className="text-sm font-medium line-clamp-2 leading-tight cursor-pointer hover:text-primary"
                            title={name}
                            onClick={() => {
                              setSelectedJournalId(rowId);
                              setDetailSheetOpen(true);
                            }}
                          >
                            {name}
                          </h3>
                          <p className="text-xs text-muted-foreground line-clamp-1" title={publisher}>
                            {publisher}
                          </p>
                          <div className="flex items-center justify-between pt-1">
                            {country && (
                              <Badge variant="outline" className="text-[10px]">
                                {country}
                              </Badge>
                            )}
                            <div className="flex items-center gap-1 ml-auto">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setSelectedJournalId(rowId);
                                  setDetailSheetOpen(true);
                                }}
                                title="查看详情"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setSelectedJournalId(rowId);
                                  setEditSheetOpen(true);
                                }}
                                title="编辑"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 网格视图的封面搜索 Dialog */}
          {viewMode === "grid" && expandedCoverRowId && (
            <Dialog
              open={true}
              onOpenChange={(open) => {
                if (!open) setExpandedCoverRowId(null);
              }}
            >
              <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    搜索封面 -{" "}
                    {String(
                      rows.find((r) => r.id === expandedCoverRowId)?.oa_display_name ||
                        rows.find((r) => r.id === expandedCoverRowId)?.cr_title ||
                        ""
                    )}
                  </DialogTitle>
                </DialogHeader>
                <ImageSearchPanel
                  journalId={expandedCoverRowId}
                  journalName={String(
                    rows.find((r) => r.id === expandedCoverRowId)?.oa_display_name ||
                      rows.find((r) => r.id === expandedCoverRowId)?.cr_title ||
                      rows.find((r) => r.id === expandedCoverRowId)?.doaj_title ||
                      ""
                  )}
                  onUploaded={() => {
                    setCoverVersion((v) => v + 1);
                    setExpandedCoverRowId(null);
                    setAppliedFilters({ ...appliedFilters });
                  }}
                  onClose={() => setExpandedCoverRowId(null)}
                />
              </DialogContent>
            </Dialog>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between border-t px-3 py-2">
            <p className="text-sm text-muted-foreground">
              第 {page} 页，共 {pages} 页
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[20, 50, 100, 200, 500, 1000, 5000, 10000].map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s} 条/页
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage(pages)}
                  disabled={page >= pages}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <JournalDetailSheet
        journalId={selectedJournalId}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
      />

      {/* Edit Sheet */}
      <JournalEditSheet
        journalId={selectedJournalId}
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        onSaved={() => {
          // Refresh the list after saving
          setAppliedFilters({ ...appliedFilters });
        }}
      />
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  ExternalLink,
  Loader2,
  Check,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  Pencil,
  ImageIcon,
  ChevronDown,
} from "lucide-react";
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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

// 格式化函数
function formatValue(value: unknown, type: ColumnDef["type"]): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">-</span>;
  }

  switch (type) {
    case "boolean":
      return value ? (
        <Check className="h-4 w-4 text-emerald-500" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground" />
      );
    
    case "number":
      return typeof value === "number" ? (
        <span className="tabular-nums">{value.toLocaleString()}</span>
      ) : String(value);
    
    case "date":
      return <span className="text-muted-foreground text-xs">{String(value)}</span>;
    
    case "url":
      return value ? (
        <a
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-1"
        >
          链接 <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    
    case "text":
      const text = String(value);
      if (text.length > 100) {
        return (
          <span className="line-clamp-2 text-xs" title={text}>
            {text.substring(0, 100)}...
          </span>
        );
      }
      return <span className="text-xs">{text}</span>;
    
    case "json":
      if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-muted-foreground">-</span>;
        // 显示前几个元素
        const items = value.slice(0, 3).map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
        return (
          <div className="flex flex-wrap gap-1">
            {items.map((item, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                {String(item).substring(0, 20)}
              </Badge>
            ))}
            {value.length > 3 && (
              <Badge variant="secondary" className="text-[10px]">
                +{value.length - 3}
              </Badge>
            )}
          </div>
        );
      }
      if (typeof value === "object") {
        return (
          <Badge variant="outline" className="text-[10px]">
            {Object.keys(value as object).length} 项
          </Badge>
        );
      }
      return String(value);
    
    default:
      return String(value);
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

  // 从 localStorage 恢复列设置
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
  }, []);

  // 保存列设置到 localStorage
  useEffect(() => {
    localStorage.setItem("journal-visible-columns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

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
    
    return params.toString();
  }, [page, pageSize, appliedFilters]);

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
          <h1 className="text-2xl font-bold tracking-tight">期刊列表</h1>
          <p className="text-muted-foreground">
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
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {loading ? "加载中..." : `共 ${total.toLocaleString()} 条结果`}
            </p>
            <p className="text-sm text-muted-foreground">
              显示 {visibleColumnDefs.length} 列
            </p>
          </div>

          {/* Table with horizontal scroll */}
          <ScrollArea className="w-full">
            <div className="min-w-max">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ width: 60 }} className="text-center">
                      封面
                    </TableHead>
                    {visibleColumnDefs.map((col) => (
                      <TableHead
                        key={col.key}
                        style={{ minWidth: col.width || 100 }}
                        className="whitespace-nowrap"
                      >
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
                      </TableHead>
                    ))}
                    <TableHead className="w-32">操作</TableHead>
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
                          {/* 封面列 */}
                          <TableCell className="text-center p-1">
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
                          {visibleColumnDefs.map((col) => (
                            <TableCell key={col.key} className="whitespace-nowrap">
                              {col.key === "id" ? (
                                <button
                                  onClick={() => {
                                    setSelectedJournalId(rowId);
                                    setDetailSheetOpen(true);
                                  }}
                                  className="text-primary hover:underline font-mono text-xs"
                                >
                                  {rowId}
                                </button>
                              ) : col.key === "oa_display_name" ? (
                                <span className="line-clamp-1 max-w-[200px]" title={String(row.oa_display_name || "")}>
                                  {String(row.oa_display_name || "-")}
                                </span>
                              ) : col.key === "oa_host_organization" ? (
                                <span className="line-clamp-1 max-w-[150px]" title={String(row.oa_host_organization || "")}>
                                  {String(row.oa_host_organization || "-")}
                                </span>
                              ) : (
                                formatValue(row[col.key], col.type)
                              )}
                            </TableCell>
                          ))}
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedJournalId(rowId);
                                  setDetailSheetOpen(true);
                                }}
                              >
                                <Eye className="mr-1 h-3 w-3" />
                                详情
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedJournalId(rowId);
                                  setEditSheetOpen(true);
                                }}
                              >
                                <Pencil className="mr-1 h-3 w-3" />
                                修改
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {/* 展开的封面搜索面板 */}
                        {isExpanded && (
                          <TableRow>
                            <TableCell
                              colSpan={visibleColumnDefs.length + 2}
                              className="p-0 sticky left-0"
                              style={{ maxWidth: "calc(100vw - 4rem)" }}
                            >
                              <ImageSearchPanel
                                journalId={rowId}
                                journalName={String(row.oa_display_name || row.cr_title || row.doaj_title || "")}
                                onUploaded={() => {
                                  // 刷新封面版本号，强制重新加载图片
                                  setCoverVersion((v) => v + 1);
                                  setExpandedCoverRowId(null);
                                  // 刷新列表数据（更新 cover_image_name 字段）
                                  setAppliedFilters({ ...appliedFilters });
                                }}
                                onClose={() => setExpandedCoverRowId(null)}
                              />
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
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t px-4 py-3">
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
                  {[10, 20, 50, 100].map((s) => (
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

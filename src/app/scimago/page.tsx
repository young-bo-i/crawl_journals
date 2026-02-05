"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Upload,
  FolderOpen,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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

type ScimagoYearStat = {
  year: number;
  count: number;
};

type ScimagoListItem = {
  sourceid: number;
  year: number;
  rank: number | null;
  title: string;
  type: string;
  issns: string[];
  publisher: string;
  is_open_access: boolean;
  sjr: number | null;
  sjr_quartile: string | null;
  h_index: number | null;
  country: string;
  categories: string;
};

type ImportResult = {
  filename: string;
  year: number;
  totalRows: number;
  inserted: number;
  updated: number;
  errors: number;
  errorMessages?: string[];
};

export default function ScimagoPage() {
  // 导入相关状态
  const [scimagoStats, setScimagoStats] = useState<ScimagoYearStat[]>([]);
  const [scimagoTotal, setScimagoTotal] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    filename: string;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState<Record<number, boolean>>({});
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 列表相关状态
  const [data, setData] = useState<ScimagoListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // 筛选条件
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [quartileFilter, setQuartileFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 加载统计数据
  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/scimago/stats", { cache: "no-store" });
      const json = await res.json();
      if (json?.years) setScimagoStats(json.years);
      if (json?.totalCount !== undefined) setScimagoTotal(json.totalCount);
    } catch {
      // ignore
    }
  }, []);

  // 加载列表数据
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (yearFilter !== "all") params.set("year", yearFilter);
      if (quartileFilter !== "all") params.set("quartile", quartileFilter);
      if (debouncedSearch) params.set("q", debouncedSearch);

      const res = await fetch(`/api/scimago/list?${params}`, { cache: "no-store" });
      const json = await res.json();

      if (json.success) {
        setData(json.data);
        setTotal(json.total);
        setTotalPages(json.totalPages);
      }
    } catch (e) {
      console.error("加载列表失败:", e);
    } finally {
      setLoading(false);
    }
  }, [page, limit, yearFilter, quartileFilter, debouncedSearch]);

  // 初始化加载
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // 筛选条件变化时重新加载
  useEffect(() => {
    if (scimagoTotal > 0) {
      loadList();
    }
  }, [loadList, scimagoTotal]);

  // 删除所有数据
  const handleDelete = useCallback(async () => {
    if (!confirm("确定要删除所有 SCImago 数据吗？此操作不可恢复。")) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch("/api/scimago/delete", { method: "DELETE" });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "删除失败");
      }

      // 刷新统计和列表
      await loadStats();
      setData([]);
      setTotal(0);
      setTotalPages(0);
      setImportResults([]);
    } catch (e: any) {
      setImportError(e.message || "删除失败");
    } finally {
      setDeleting(false);
    }
  }, [loadStats]);

  // 处理文件上传
  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setImporting(true);
    setImportError(null);
    setImportResults([]);

    try {
      const formData = new FormData();
      const validFiles: File[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.toLowerCase().startsWith("scimagojr") && file.name.toLowerCase().endsWith(".csv")) {
          formData.append("files", file);
          validFiles.push(file);
        }
      }

      if (validFiles.length === 0) {
        setImportError("没有找到有效的 SCImago CSV 文件（文件名需以 'scimagojr' 开头）");
        setImporting(false);
        return;
      }

      setImportProgress({ current: 0, total: validFiles.length, filename: "准备导入..." });

      const res = await fetch("/api/scimago/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "导入失败");
      }

      // 显示导入结果
      if (json.results) {
        setImportResults(json.results);
      }

      // 刷新统计和列表
      await loadStats();
      setPage(1);
    } catch (e: any) {
      setImportError(e.message || "导入失败");
    } finally {
      setImporting(false);
      setImportProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [loadStats]);

  // 获取分区颜色
  const getQuartileColor = (q: string | null) => {
    switch (q) {
      case "Q1": return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
      case "Q2": return "bg-blue-500/15 text-blue-500 border-blue-500/30";
      case "Q3": return "bg-amber-500/15 text-amber-500 border-amber-500/30";
      case "Q4": return "bg-red-500/15 text-red-500 border-red-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold">SCImago 期刊排名数据</h1>
        <p className="text-muted-foreground">导入和管理 SCImago Journal Rank (SJR) 数据</p>
      </div>

      {/* 数据导入卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            数据导入
          </CardTitle>
          <CardDescription>
            从 SCImago 网站下载的 CSV 文件导入到数据库
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 已导入统计 */}
          {scimagoStats.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">已导入:</span>
                  <span className="font-medium">{scimagoTotal.toLocaleString()} 条记录</span>
                  <span className="text-muted-foreground">|</span>
                  <span className="font-medium">{scimagoStats.length} 个年份</span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting || importing}
                >
                  {deleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  删除所有数据
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {scimagoStats.map((s) => (
                  <Badge key={s.year} variant="secondary" className="text-xs">
                    {s.year}: {(s.count / 1000).toFixed(1)}k
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">尚未导入任何 SCImago 数据</p>
          )}

          {/* 文件选择 */}
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              multiple
              /* @ts-expect-error webkitdirectory is not in types */
              webkitdirectory=""
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              选择文件夹
            </Button>
            <p className="text-xs text-muted-foreground">
              选择包含 scimagojr YYYY.csv 文件的文件夹
            </p>
          </div>

          {/* 导入进度 */}
          {importing && importProgress && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">正在导入... {importProgress.filename}</span>
              </div>
              <Progress
                value={(importProgress.current / importProgress.total) * 100}
                className="h-2"
              />
            </div>
          )}

          {/* 导入结果 */}
          {importResults.length > 0 && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <p className="text-sm font-medium">导入完成</p>
              
              {/* 汇总统计 */}
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-emerald-600">
                  新增: {importResults.reduce((sum, r) => sum + r.inserted, 0).toLocaleString()}
                </span>
                <span className="text-blue-600">
                  更新: {importResults.reduce((sum, r) => sum + r.updated, 0).toLocaleString()}
                </span>
                {importResults.reduce((sum, r) => sum + r.errors, 0) > 0 && (
                  <span className="text-destructive">
                    错误: {importResults.reduce((sum, r) => sum + r.errors, 0).toLocaleString()}
                  </span>
                )}
              </div>

              {/* 各文件详情 */}
              <div className="space-y-2">
                {importResults.map((r, idx) => (
                  <div key={r.filename} className="text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant={r.errors > 0 ? "destructive" : "secondary"} className="text-xs">
                        {r.year}
                      </Badge>
                      <span className="text-muted-foreground">
                        总行数 {r.totalRows.toLocaleString()} |
                        新增 {r.inserted.toLocaleString()} |
                        更新 {r.updated.toLocaleString()}
                        {r.errors > 0 && ` | 错误 ${r.errors}`}
                      </span>
                      {r.errors > 0 && r.errorMessages && r.errorMessages.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => setShowErrorDetails(prev => ({ ...prev, [idx]: !prev[idx] }))}
                        >
                          {showErrorDetails[idx] ? (
                            <ChevronUp className="h-3 w-3 mr-1" />
                          ) : (
                            <ChevronDown className="h-3 w-3 mr-1" />
                          )}
                          查看错误
                        </Button>
                      )}
                    </div>
                    
                    {/* 错误详情 */}
                    {showErrorDetails[idx] && r.errorMessages && r.errorMessages.length > 0 && (
                      <div className="mt-2 ml-4 p-2 rounded bg-destructive/10 border border-destructive/20">
                        <div className="flex items-center gap-1 text-destructive mb-1">
                          <AlertTriangle className="h-3 w-3" />
                          <span className="font-medium">错误详情 (最多显示 10 条):</span>
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-destructive/80">
                          {r.errorMessages.map((msg, i) => (
                            <li key={i}>{msg}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {importError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{importError}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 数据列表卡片 */}
      <Card>
        <CardHeader>
          <CardTitle>数据列表</CardTitle>
          <CardDescription>
            共 {total.toLocaleString()} 条记录
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 筛选工具栏 */}
          <div className="flex flex-wrap items-center gap-4">
            <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="年份" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部年份</SelectItem>
                {scimagoStats.map((s) => (
                  <SelectItem key={s.year} value={String(s.year)}>{s.year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={quartileFilter} onValueChange={(v) => { setQuartileFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="分区" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分区</SelectItem>
                <SelectItem value="Q1">Q1</SelectItem>
                <SelectItem value="Q2">Q2</SelectItem>
                <SelectItem value="Q3">Q3</SelectItem>
                <SelectItem value="Q4">Q4</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索期刊名称..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* 数据表格 */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">排名</TableHead>
                  <TableHead>期刊名称</TableHead>
                  <TableHead className="w-[80px]">年份</TableHead>
                  <TableHead className="w-[80px]">SJR</TableHead>
                  <TableHead className="w-[60px]">分区</TableHead>
                  <TableHead className="w-[80px]">H指数</TableHead>
                  <TableHead className="w-[100px]">国家</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      {scimagoTotal === 0 ? "请先导入 SCImago 数据" : "没有找到匹配的数据"}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((item) => (
                    <TableRow key={`${item.sourceid}-${item.year}`}>
                      <TableCell className="font-medium">{item.rank ?? "-"}</TableCell>
                      <TableCell>
                        <div className="max-w-[300px]">
                          <p className="font-medium truncate" title={item.title}>{item.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.publisher}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{item.year}</TableCell>
                      <TableCell>{item.sjr?.toFixed(3) ?? "-"}</TableCell>
                      <TableCell>
                        {item.sjr_quartile && (
                          <Badge variant="outline" className={getQuartileColor(item.sjr_quartile)}>
                            {item.sjr_quartile}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{item.h_index ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{item.country || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                显示 {((page - 1) * limit) + 1}-{Math.min(page * limit, total)} / 共 {total.toLocaleString()} 条
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || loading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

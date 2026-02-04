"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type JcrRecord = {
  journal: string;
  issn: string | null;
  eissn: string | null;
  category: string | null;
  if_2024: number | string | null;
  if_quartile_2024: string | null;
  if_rank_2024: string | null;
};

function getQuartileBadge(quartile: string | null) {
  if (!quartile) return null;
  const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    Q1: "default",
    Q2: "secondary",
    Q3: "outline",
    Q4: "destructive",
  };
  const colors: Record<string, string> = {
    Q1: "bg-emerald-500 hover:bg-emerald-500",
    Q2: "bg-blue-500 hover:bg-blue-500",
    Q3: "bg-amber-500 hover:bg-amber-500",
    Q4: "bg-red-500 hover:bg-red-500",
  };
  return (
    <Badge className={`${colors[quartile] || ""} text-white`}>
      {quartile}
    </Badge>
  );
}

export default function JcrListPage() {
  const [data, setData] = useState<JcrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [quartile, setQuartile] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"journal" | "if_2024">("if_2024");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    loadData();
  }, [page, search, quartile, sortBy, sortOrder]);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortOrder,
      });

      if (search) params.append("q", search);
      if (quartile && quartile !== "all") params.append("quartile", quartile);

      const res = await fetch(`/api/jcr?${params}`, { cache: "no-store" });
      const json = await res.json();

      if (json.ok) {
        setData(json.rows);
        setTotal(json.total);
      }
    } catch (err) {
      console.error("Failed to load JCR data:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    setSearch(searchInput);
    setPage(1);
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleSearch();
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">JCR 影响因子数据库</h1>
          <p className="text-muted-foreground">
            共 {total.toLocaleString()} 个期刊 · 数据来源：JCR 2024
          </p>
        </div>
        <Database className="h-8 w-8 text-muted-foreground" />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">搜索和筛选</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {/* Search */}
            <div className="lg:col-span-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜索期刊名称或 ISSN..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="pl-9"
                  />
                </div>
                <Button onClick={handleSearch} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "搜索"}
                </Button>
              </div>
            </div>

            {/* Quartile Filter */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">分区</label>
              <Select value={quartile} onValueChange={(v) => { setQuartile(v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部分区</SelectItem>
                  <SelectItem value="Q1">Q1</SelectItem>
                  <SelectItem value="Q2">Q2</SelectItem>
                  <SelectItem value="Q3">Q3</SelectItem>
                  <SelectItem value="Q4">Q4</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort By */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">排序</label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as "journal" | "if_2024")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="if_2024">影响因子</SelectItem>
                  <SelectItem value="journal">期刊名称</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort Order */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">顺序</label>
              <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "asc" | "desc")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">降序</SelectItem>
                  <SelectItem value="asc">升序</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              没有找到匹配的期刊
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[250px]">期刊名称</TableHead>
                      <TableHead className="w-[100px]">ISSN</TableHead>
                      <TableHead className="w-[100px]">eISSN</TableHead>
                      <TableHead className="text-center w-[100px]">IF 2024</TableHead>
                      <TableHead className="text-center w-[80px]">分区</TableHead>
                      <TableHead className="text-center w-[100px]">排名</TableHead>
                      <TableHead>学科分类</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {row.issn ? (
                            <Link
                              href={`/journals/${row.issn}`}
                              className="text-primary hover:underline"
                            >
                              {row.journal}
                            </Link>
                          ) : (
                            row.journal
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.issn || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.eissn || "-"}
                        </TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">
                          {row.if_2024 !== null
                            ? typeof row.if_2024 === "number"
                              ? row.if_2024.toFixed(1)
                              : String(row.if_2024)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {getQuartileBadge(row.if_quartile_2024)}
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {row.if_rank_2024 || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {row.category || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t px-6 py-4">
                <p className="text-sm text-muted-foreground">
                  第 {page} 页，共 {totalPages} 页
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages || loading}
                  >
                    下一页
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

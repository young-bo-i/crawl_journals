"use client";

import { useState } from "react";
import { Filter, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

export interface JournalFiltersState {
  q: string;
  // 布尔筛选
  inDoaj: string;
  inNlm: string;
  hasWikidata: string;
  hasWikipedia: string;
  isOpenAccess: string;
  isCore: string;
  isOa: string;
  inScielo: string;
  isOjs: string;
  doajBoai: string;
  // 字符串筛选
  country: string;
  oaType: string;
  // 数值范围
  minWorksCount: string;
  maxWorksCount: string;
  minCitedByCount: string;
  maxCitedByCount: string;
  minFirstYear: string;
  maxFirstYear: string;
  // 排序
  sortBy: string;
  sortOrder: string;
}

export const DEFAULT_FILTERS: JournalFiltersState = {
  q: "",
  inDoaj: "all",
  inNlm: "all",
  hasWikidata: "all",
  hasWikipedia: "all",
  isOpenAccess: "all",
  isCore: "all",
  isOa: "all",
  inScielo: "all",
  isOjs: "all",
  doajBoai: "all",
  country: "",
  oaType: "",
  minWorksCount: "",
  maxWorksCount: "",
  minCitedByCount: "",
  maxCitedByCount: "",
  minFirstYear: "",
  maxFirstYear: "",
  sortBy: "updated_at",
  sortOrder: "desc",
};

interface JournalFiltersProps {
  filters: JournalFiltersState;
  onChange: (filters: JournalFiltersState) => void;
  onSearch: () => void;
  loading?: boolean;
}

const BOOL_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "yes", label: "是" },
  { value: "no", label: "否" },
];

const OA_TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "journal", label: "期刊" },
  { value: "repository", label: "仓库" },
  { value: "ebook platform", label: "电子书平台" },
];

const SORT_OPTIONS = [
  { value: "updated_at", label: "更新时间" },
  { value: "created_at", label: "创建时间" },
  { value: "title", label: "标题" },
  { value: "publisher", label: "出版社" },
  { value: "oa_works_count", label: "作品数" },
  { value: "oa_cited_by_count", label: "被引数" },
  { value: "oa_apc_usd", label: "APC费用" },
  { value: "oa_first_publication_year", label: "首发年份" },
  { value: "doaj_publication_time_weeks", label: "出版周期" },
];

export function JournalFilters({ filters, onChange, onSearch, loading }: JournalFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  const updateFilter = <K extends keyof JournalFiltersState>(
    key: K,
    value: JournalFiltersState[K]
  ) => {
    onChange({ ...filters, [key]: value });
  };

  const resetFilters = () => {
    onChange(DEFAULT_FILTERS);
  };

  // 计算活跃筛选数量
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === "q" || key === "sortBy" || key === "sortOrder") return false;
    if (typeof value === "string" && (value === "all" || value === "")) return false;
    return true;
  }).length;

  return (
    <Card>
      <CardContent className="pt-4">
        {/* 基础搜索行 */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[280px]">
            <label className="text-sm text-muted-foreground mb-1.5 block">关键词搜索</label>
            <div className="flex gap-2">
              <Input
                placeholder="搜索 ID、ISSN、标题、出版社..."
                value={filters.q}
                onChange={(e) => updateFilter("q", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
                className="flex-1"
              />
              <Button onClick={onSearch} disabled={loading}>
                {loading ? "搜索中..." : "搜索"}
              </Button>
            </div>
          </div>

          <div className="w-[140px]">
            <label className="text-sm text-muted-foreground mb-1.5 block">排序</label>
            <Select value={filters.sortBy} onValueChange={(v) => updateFilter("sortBy", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[100px]">
            <label className="text-sm text-muted-foreground mb-1.5 block">顺序</label>
            <Select value={filters.sortOrder} onValueChange={(v) => updateFilter("sortOrder", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">降序</SelectItem>
                <SelectItem value="asc">升序</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            onClick={() => setExpanded(!expanded)}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            高级筛选
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeFilterCount}
              </Badge>
            )}
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-4 w-4 mr-1" />
              重置
            </Button>
          )}
        </div>

        {/* 高级筛选面板 */}
        {expanded && (
          <div className="mt-4 pt-4 border-t">
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {/* 收录状态筛选 */}
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">DOAJ收录</label>
                <Select value={filters.inDoaj} onValueChange={(v) => updateFilter("inDoaj", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOOL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">NLM收录</label>
                <Select value={filters.inNlm} onValueChange={(v) => updateFilter("inNlm", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOOL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">开放获取</label>
                <Select value={filters.isOpenAccess} onValueChange={(v) => updateFilter("isOpenAccess", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOOL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">核心期刊</label>
                <Select value={filters.isCore} onValueChange={(v) => updateFilter("isCore", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOOL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">SciELO</label>
                <Select value={filters.inScielo} onValueChange={(v) => updateFilter("inScielo", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOOL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">OJS平台</label>
                <Select value={filters.isOjs} onValueChange={(v) => updateFilter("isOjs", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOOL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Wikidata</label>
                <Select value={filters.hasWikidata} onValueChange={(v) => updateFilter("hasWikidata", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOOL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Wikipedia</label>
                <Select value={filters.hasWikipedia} onValueChange={(v) => updateFilter("hasWikipedia", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOOL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">期刊类型</label>
                <Select value={filters.oaType} onValueChange={(v) => updateFilter("oaType", v)}>
                  <SelectTrigger><SelectValue placeholder="全部类型" /></SelectTrigger>
                  <SelectContent>
                    {OA_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">国家/地区</label>
                <Input
                  placeholder="如: US, CN"
                  value={filters.country}
                  onChange={(e) => updateFilter("country", e.target.value.toUpperCase())}
                />
              </div>

              {/* 数值范围筛选 */}
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">最小作品数</label>
                <Input
                  type="number"
                  placeholder="不限"
                  value={filters.minWorksCount}
                  onChange={(e) => updateFilter("minWorksCount", e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">最大作品数</label>
                <Input
                  type="number"
                  placeholder="不限"
                  value={filters.maxWorksCount}
                  onChange={(e) => updateFilter("maxWorksCount", e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">最小被引数</label>
                <Input
                  type="number"
                  placeholder="不限"
                  value={filters.minCitedByCount}
                  onChange={(e) => updateFilter("minCitedByCount", e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">最大被引数</label>
                <Input
                  type="number"
                  placeholder="不限"
                  value={filters.maxCitedByCount}
                  onChange={(e) => updateFilter("maxCitedByCount", e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">首发年份(起)</label>
                <Input
                  type="number"
                  placeholder="如: 1900"
                  value={filters.minFirstYear}
                  onChange={(e) => updateFilter("minFirstYear", e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">首发年份(止)</label>
                <Input
                  type="number"
                  placeholder="如: 2024"
                  value={filters.maxFirstYear}
                  onChange={(e) => updateFilter("maxFirstYear", e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

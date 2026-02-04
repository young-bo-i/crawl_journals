"use client";

import { useState } from "react";
import { Settings2, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ALL_COLUMNS,
  CATEGORY_LABELS,
  getColumnsByCategory,
  DEFAULT_VISIBLE_COLUMNS,
  type ColumnCategory,
} from "@/shared/journal-columns";

interface ColumnSelectorProps {
  visibleColumns: string[];
  onChange: (columns: string[]) => void;
}

export function ColumnSelector({ visibleColumns, onChange }: ColumnSelectorProps) {
  const [open, setOpen] = useState(false);
  const columnsByCategory = getColumnsByCategory();
  const categories = Object.keys(columnsByCategory) as ColumnCategory[];

  const toggleColumn = (key: string) => {
    if (visibleColumns.includes(key)) {
      onChange(visibleColumns.filter((k) => k !== key));
    } else {
      onChange([...visibleColumns, key]);
    }
  };

  const toggleCategory = (category: ColumnCategory) => {
    const categoryColumns = columnsByCategory[category].map((c) => c.key);
    const allSelected = categoryColumns.every((k) => visibleColumns.includes(k));
    
    if (allSelected) {
      // 取消选中该分类的所有列
      onChange(visibleColumns.filter((k) => !categoryColumns.includes(k)));
    } else {
      // 选中该分类的所有列
      const newColumns = new Set([...visibleColumns, ...categoryColumns]);
      onChange(Array.from(newColumns));
    }
  };

  const selectAll = () => {
    onChange(ALL_COLUMNS.map((c) => c.key));
  };

  const selectNone = () => {
    // 保留至少 ID 和 title
    onChange(["id", "title"]);
  };

  const resetToDefault = () => {
    onChange(DEFAULT_VISIBLE_COLUMNS);
  };

  const isCategoryFullySelected = (category: ColumnCategory) => {
    return columnsByCategory[category].every((c) => visibleColumns.includes(c.key));
  };

  const isCategoryPartiallySelected = (category: ColumnCategory) => {
    const cols = columnsByCategory[category];
    const selected = cols.filter((c) => visibleColumns.includes(c.key)).length;
    return selected > 0 && selected < cols.length;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Settings2 className="mr-2 h-4 w-4" />
          显示列
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">选择显示的列</span>
            <span className="text-xs text-muted-foreground">
              {visibleColumns.length} / {ALL_COLUMNS.length}
            </span>
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={selectAll}>
              全选
            </Button>
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={selectNone}>
              清空
            </Button>
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={resetToDefault}>
              重置
            </Button>
          </div>
        </div>
        <ScrollArea className="h-[400px]">
          <div className="p-2">
            {categories.map((category) => (
              <div key={category} className="mb-3">
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                  onClick={() => toggleCategory(category)}
                >
                  <Checkbox
                    checked={isCategoryFullySelected(category)}
                    className={isCategoryPartiallySelected(category) ? "opacity-50" : ""}
                  />
                  <span className="text-sm font-medium">{CATEGORY_LABELS[category]}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {columnsByCategory[category].filter((c) => visibleColumns.includes(c.key)).length}/
                    {columnsByCategory[category].length}
                  </span>
                </div>
                <div className="ml-4 mt-1 space-y-0.5">
                  {columnsByCategory[category].map((col) => (
                    <div
                      key={col.key}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm"
                      onClick={() => toggleColumn(col.key)}
                    >
                      <Checkbox checked={visibleColumns.includes(col.key)} />
                      <span className="truncate">{col.label}</span>
                      {col.sortable && (
                        <span className="text-[10px] text-muted-foreground ml-auto">可排序</span>
                      )}
                    </div>
                  ))}
                </div>
                {category !== categories[categories.length - 1] && (
                  <Separator className="mt-2" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

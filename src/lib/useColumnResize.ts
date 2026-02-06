"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ColumnWidthDef = {
  key: string;
  defaultWidth: number;
};

/**
 * 列宽拖拽 Hook
 *
 * - 管理每列的像素宽度
 * - 提供拖拽把手事件处理（mousedown → mousemove → mouseup）
 * - 可选持久化到 localStorage
 * - 提供 resetWidths() 恢复默认
 * - 提供 computedWidths() 在容器较宽时按比例放大
 */
export function useColumnResize(
  columns: ColumnWidthDef[],
  options?: {
    storageKey?: string;
    minWidth?: number;
  },
) {
  const minWidth = options?.minWidth ?? 60;
  const storageKey = options?.storageKey;

  // 用户手动调节过的宽度（null = 使用默认值）
  const [customWidths, setCustomWidths] = useState<Record<string, number>>({});

  // 从 localStorage 恢复
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === "object" && parsed !== null) {
          setCustomWidths(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  // 持久化到 localStorage
  useEffect(() => {
    if (!storageKey) return;
    if (Object.keys(customWidths).length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(customWidths));
    }
  }, [customWidths, storageKey]);

  // 基础宽度：自定义值 > 默认值
  const getBaseWidth = useCallback(
    (key: string) => {
      if (customWidths[key] !== undefined) return customWidths[key];
      const col = columns.find((c) => c.key === key);
      return col?.defaultWidth ?? 150;
    },
    [columns, customWidths],
  );

  // 所有中间列的基础总宽
  const totalBaseWidth = columns.reduce((sum, col) => sum + getBaseWidth(col.key), 0);

  /**
   * 计算实际列宽：如果容器更宽则按比例放大
   * @param containerWidth 可用于中间列的容器宽度（总宽 - 首列 - 尾列）
   */
  const getComputedWidths = useCallback(
    (containerWidth: number): Record<string, number> => {
      const result: Record<string, number> = {};
      const ratio = containerWidth > totalBaseWidth ? containerWidth / totalBaseWidth : 1;
      for (const col of columns) {
        result[col.key] = Math.floor(getBaseWidth(col.key) * ratio);
      }
      return result;
    },
    [columns, totalBaseWidth, getBaseWidth],
  );

  // 拖拽状态（用 ref 避免闭包过期问题）
  const dragRef = useRef<{
    key: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const onResizeStart = useCallback(
    (key: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startWidth = getBaseWidth(key);
      dragRef.current = { key, startX: e.clientX, startWidth };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        const newWidth = Math.max(minWidth, dragRef.current.startWidth + delta);
        setCustomWidths((prev) => ({ ...prev, [dragRef.current!.key]: newWidth }));
      };

      const onMouseUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [getBaseWidth, minWidth],
  );

  const resetWidths = useCallback(() => {
    setCustomWidths({});
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  return {
    /** 基础列宽（不含自适应放大） */
    totalBaseWidth,
    /** 获取按比例放大后的列宽 */
    getComputedWidths,
    /** mousedown handler，放在 resize 把手上 */
    onResizeStart,
    /** 恢复默认列宽 */
    resetWidths,
  };
}

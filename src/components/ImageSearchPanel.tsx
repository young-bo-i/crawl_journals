"use client";

import { useState, useCallback, useRef } from "react";
import {
  Search,
  Loader2,
  Upload,
  X,
  ZoomIn,
  AlertCircle,
  Check,
  ExternalLink,
  FileUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type ImageResult = {
  url: string;
  thumbnail: string;
  title: string;
  width: number;
  height: number;
  contextUrl: string;
};

type ImageSearchPanelProps = {
  journalId: string;
  journalName: string;
  onUploaded: () => void;
  onClose: () => void;
};

export function ImageSearchPanel({
  journalId,
  journalName,
  onUploaded,
  onClose,
}: ImageSearchPanelProps) {
  const [query, setQuery] = useState(journalName);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // 是否被限流（提示用户可配置 API Key）
  const [rateLimited, setRateLimited] = useState(false);

  // 预览弹窗状态
  const [previewImage, setPreviewImage] = useState<ImageResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // 手动上传文件
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileUploading, setFileUploading] = useState(false);

  // 搜索图片
  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;

    setSearching(true);
    setSearchError(null);
    setRateLimited(false);
    setResults([]);

    try {
      const res = await fetch(
        `/api/image-search?q=${encodeURIComponent(q)}`
      );
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "rate_limited") {
          setRateLimited(true);
          return;
        }
        setSearchError(data.message || "搜索失败");
        return;
      }

      setResults(data.results ?? []);
      if ((data.results ?? []).length === 0) {
        setSearchError("没有找到相关图片，请尝试修改关键词");
      }
    } catch (err) {
      console.error("Image search error:", err);
      setSearchError("网络错误，请稍后重试");
    } finally {
      setSearching(false);
    }
  }, [query]);

  // 上传选中的图片
  const handleUpload = useCallback(
    async (imageUrl: string) => {
      setUploading(true);
      setUploadSuccess(false);

      try {
        const res = await fetch(`/api/journals/${journalId}/cover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "上传失败");
        }

        setUploadSuccess(true);
        // 延迟关闭，让用户看到成功提示
        setTimeout(() => {
          setPreviewImage(null);
          onUploaded();
        }, 800);
      } catch (err: any) {
        alert(`上传失败: ${err.message}`);
      } finally {
        setUploading(false);
      }
    },
    [journalId, onUploaded]
  );

  // 手动选择文件上传
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // 重置 input 以便再次选择同一文件
      e.target.value = "";

      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        alert("不支持的文件格式，请上传 JPG、PNG、GIF 或 WebP 图片");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert("文件过大，最大支持 5MB");
        return;
      }

      setFileUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`/api/journals/${journalId}/cover`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "上传失败");
        }

        onUploaded();
      } catch (err: any) {
        alert(`上传失败: ${err.message}`);
      } finally {
        setFileUploading(false);
      }
    },
    [journalId, onUploaded]
  );

  return (
    <div className="border-t bg-muted/30 p-4 space-y-3">
      {/* 头部：搜索栏 + 关闭按钮 */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入关键词搜索期刊封面图片..."
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
          <Button
            size="sm"
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="shrink-0"
          >
            {searching ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Search className="h-3 w-3 mr-1" />
            )}
            搜索
          </Button>
        </div>
        {/* 本地上传按钮 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleFileUpload}
        />
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1"
          onClick={() => fileInputRef.current?.click()}
          disabled={fileUploading}
        >
          {fileUploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <FileUp className="h-3 w-3" />
          )}
          本地上传
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 被限流提示 */}
      {rateLimited && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <p className="font-medium text-amber-800">
                搜索请求被限流
              </p>
              <p className="text-amber-700">
                Google 暂时限制了请求，请稍后再试。如需更稳定的搜索体验，可前往{" "}
                <a href="/settings" className="underline font-medium">
                  系统设置
                </a>{" "}
                配置 Google Custom Search API Key。
              </p>
              <p className="text-amber-700">
                你也可以{" "}
                <a
                  href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(journalName + " journal cover")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline inline-flex items-center gap-1"
                >
                  在 Google 图片搜索中查看
                  <ExternalLink className="h-3 w-3" />
                </a>
                ，然后手动上传封面图片。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 搜索错误 */}
      {searchError && !rateLimited && (
        <div className="text-sm text-muted-foreground text-center py-4">
          {searchError}
        </div>
      )}

      {/* 搜索中 */}
      {searching && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            搜索中...
          </span>
        </div>
      )}

      {/* 搜索结果网格 —— 固定尺寸缩略图 */}
      {results.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {results.map((img, idx) => (
            <button
              key={idx}
              className="group relative w-24 h-24 shrink-0 rounded-md overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition-all cursor-pointer"
              onClick={() => {
                setPreviewImage(img);
                setUploadSuccess(false);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.thumbnail}
                alt={img.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  // 缩略图加载失败，尝试原图
                  const target = e.target as HTMLImageElement;
                  if (target.src !== img.url) {
                    target.src = img.url;
                  }
                }}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 图片预览 + 上传弹窗 */}
      <Dialog
        open={!!previewImage}
        onOpenChange={(open) => {
          if (!open) setPreviewImage(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>图片预览</DialogTitle>
            <DialogDescription className="line-clamp-1">
              {previewImage?.title || "选中的图片"}
            </DialogDescription>
          </DialogHeader>
          {previewImage && (
            <div className="space-y-4">
              <div
                className="relative w-full flex items-center justify-center rounded-lg overflow-hidden"
                style={{
                  maxHeight: "60vh",
                  backgroundImage:
                    "linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%), " +
                    "linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%), " +
                    "linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%), " +
                    "linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)",
                  backgroundSize: "20px 20px",
                  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                  backgroundColor: "hsl(var(--muted) / 0.3)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewImage.url}
                  alt={previewImage.title}
                  className="max-w-full max-h-[60vh] object-contain"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {previewImage.width && previewImage.height
                    ? `${previewImage.width} x ${previewImage.height}`
                    : "尺寸未知"}
                </span>
                <a
                  href={previewImage.contextUrl || previewImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  查看来源 <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreviewImage(null)}
              disabled={uploading}
            >
              取消
            </Button>
            <Button
              onClick={() => previewImage && handleUpload(previewImage.url)}
              disabled={uploading || uploadSuccess}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  上传中...
                </>
              ) : uploadSuccess ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  上传成功
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1" />
                  使用此图片作为封面
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

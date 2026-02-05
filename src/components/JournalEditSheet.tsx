"use client";

import { useEffect, useState, useRef } from "react";
import {
  Pencil,
  Save,
  X,
  Upload,
  Trash2,
  Image as ImageIcon,
  Loader2,
  Check,
  Info,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface JournalData {
  id: string;
  title: string | null;
  publisher: string | null;
  country: string | null;
  homepage: string | null;
  custom_title: string | null;
  custom_publisher: string | null;
  custom_country: string | null;
  custom_homepage: string | null;
  custom_description: string | null;
  custom_notes: string | null;
  custom_updated_at: string | null;
  cover_image_name: string | null;
}

interface JournalEditSheetProps {
  journalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function JournalEditSheet({
  journalId,
  open,
  onOpenChange,
  onSaved,
}: JournalEditSheetProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [journal, setJournal] = useState<JournalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [hasCoverImage, setHasCoverImage] = useState(false);
  const [coverImageKey, setCoverImageKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    custom_title: "",
    custom_publisher: "",
    custom_country: "",
    custom_homepage: "",
    custom_description: "",
    custom_notes: "",
  });

  // Load journal data when sheet opens
  useEffect(() => {
    if (!open || !journalId) {
      setJournal(null);
      setError(null);
      setMessage(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/journals/${encodeURIComponent(journalId)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          const j = data.journal as JournalData;
          setJournal(j);
          setHasCoverImage(!!j.cover_image_name);
          // Pre-populate form with existing custom data
          setFormData({
            custom_title: j.custom_title || "",
            custom_publisher: j.custom_publisher || "",
            custom_country: j.custom_country || "",
            custom_homepage: j.custom_homepage || "",
            custom_description: j.custom_description || "",
            custom_notes: j.custom_notes || "",
          });
        }
      })
      .catch((err) => {
        setError(err.message || "加载失败");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, journalId]);

  const handleSave = async () => {
    if (!journal) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/journals/${journal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: "success", text: "保存成功" });
        onSaved?.();
        // Close sheet after short delay
        setTimeout(() => {
          onOpenChange(false);
        }, 800);
      } else {
        setMessage({ type: "error", text: data.error || "保存失败" });
      }
    } catch {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setSaving(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !journal) return;

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/journals/${journal.id}/cover`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: "success", text: "封面上传成功" });
        setHasCoverImage(true);
        setCoverImageKey((k) => k + 1);
        onSaved?.();
      } else {
        setMessage({ type: "error", text: data.error || "上传失败" });
      }
    } catch {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteCover = async () => {
    if (!journal || !confirm("确定要删除封面图片吗？")) return;

    setUploading(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/journals/${journal.id}/cover`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: "success", text: "封面已删除" });
        setHasCoverImage(false);
        onSaved?.();
      } else {
        setMessage({ type: "error", text: data.error || "删除失败" });
      }
    } catch {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setUploading(false);
    }
  };

  // Helper to show current value indicator
  const CurrentValue = ({ value, label }: { value: string | null; label: string }) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-1 text-xs text-muted-foreground mt-1">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span>当前{label}: {value}</span>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[500px] sm:max-w-[500px] p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="text-lg">编辑期刊</SheetTitle>
          <SheetDescription className="line-clamp-1">
            {journal?.title || journalId}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)]">
          <div className="px-6 py-4 space-y-6">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {journal && !loading && (
              <>
                {/* Message */}
                {message && (
                  <div
                    className={`p-3 rounded-lg flex items-center gap-2 ${
                      message.type === "success"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {message.type === "success" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    {message.text}
                  </div>
                )}

                {/* Current Data Summary */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    当前爬取数据
                  </h4>
                  <div className="text-xs space-y-1 text-muted-foreground">
                    <p><span className="font-medium">标题:</span> {journal.title || "-"}</p>
                    <p><span className="font-medium">出版社:</span> {journal.publisher || "-"}</p>
                    <p><span className="font-medium">国家:</span> {journal.country || "-"}</p>
                    <p><span className="font-medium">主页:</span> {journal.homepage ? (
                      <a href={journal.homepage} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {journal.homepage.slice(0, 50)}{journal.homepage.length > 50 ? "..." : ""}
                      </a>
                    ) : "-"}</p>
                  </div>
                </div>

                {/* Cover Image */}
                <div className="space-y-3">
                  <h3 className="font-medium flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    期刊封面
                  </h3>
                  <div className="flex items-start gap-4">
                    <div className="w-32 h-44 border rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                      {hasCoverImage ? (
                        <img
                          key={coverImageKey}
                          src={`/api/journals/${journal.id}/cover?t=${coverImageKey}`}
                          alt="期刊封面"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center text-muted-foreground">
                          <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-50" />
                          <p className="text-xs">暂无封面</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleUploadClick}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        {hasCoverImage ? "更换封面" : "上传封面"}
                      </Button>
                      {hasCoverImage && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleDeleteCover}
                          disabled={uploading}
                          className="block"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除
                        </Button>
                      )}
                      <p className="text-xs text-muted-foreground">
                        JPG、PNG、GIF、WebP，最大 5MB
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Custom Info Form */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium flex items-center gap-2">
                      <Pencil className="h-4 w-4" />
                      自定义信息
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    自定义信息会覆盖抓取的原始数据进行显示。留空则使用原始数据。
                  </p>

                  {/* Custom Title */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">自定义标题</label>
                      {formData.custom_title && (
                        <Badge variant="secondary" className="text-xs">
                          已自定义
                        </Badge>
                      )}
                    </div>
                    <Input
                      value={formData.custom_title}
                      onChange={(e) =>
                        setFormData({ ...formData, custom_title: e.target.value })
                      }
                      placeholder={journal.title || "输入自定义标题..."}
                    />
                    <CurrentValue value={journal.title} label="原始标题" />
                  </div>

                  {/* Custom Publisher */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">自定义出版社</label>
                      {formData.custom_publisher && (
                        <Badge variant="secondary" className="text-xs">
                          已自定义
                        </Badge>
                      )}
                    </div>
                    <Input
                      value={formData.custom_publisher}
                      onChange={(e) =>
                        setFormData({ ...formData, custom_publisher: e.target.value })
                      }
                      placeholder={journal.publisher || "输入自定义出版社..."}
                    />
                    <CurrentValue value={journal.publisher} label="原始出版社" />
                  </div>

                  {/* Custom Country */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">自定义国家/地区</label>
                      {formData.custom_country && (
                        <Badge variant="secondary" className="text-xs">
                          已自定义
                        </Badge>
                      )}
                    </div>
                    <Input
                      value={formData.custom_country}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          custom_country: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder={journal.country || "如: US, CN, GB..."}
                      maxLength={10}
                    />
                    <CurrentValue value={journal.country} label="原始国家" />
                  </div>

                  {/* Custom Homepage */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">自定义主页 URL</label>
                      {formData.custom_homepage && (
                        <Badge variant="secondary" className="text-xs">
                          已自定义
                        </Badge>
                      )}
                    </div>
                    <Input
                      type="url"
                      value={formData.custom_homepage}
                      onChange={(e) =>
                        setFormData({ ...formData, custom_homepage: e.target.value })
                      }
                      placeholder={journal.homepage || "https://..."}
                    />
                    <CurrentValue value={journal.homepage} label="原始主页" />
                  </div>

                  {/* Custom Description */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">自定义描述</label>
                      {formData.custom_description && (
                        <Badge variant="secondary" className="text-xs">
                          已自定义
                        </Badge>
                      )}
                    </div>
                    <Textarea
                      value={formData.custom_description}
                      onChange={(e) =>
                        setFormData({ ...formData, custom_description: e.target.value })
                      }
                      placeholder="输入期刊描述..."
                      rows={3}
                    />
                  </div>

                  {/* Custom Notes */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">备注</label>
                      {formData.custom_notes && (
                        <Badge variant="secondary" className="text-xs">
                          已填写
                        </Badge>
                      )}
                    </div>
                    <Textarea
                      value={formData.custom_notes}
                      onChange={(e) =>
                        setFormData({ ...formData, custom_notes: e.target.value })
                      }
                      placeholder="输入备注信息..."
                      rows={3}
                    />
                  </div>

                  {journal.custom_updated_at && (
                    <p className="text-xs text-muted-foreground">
                      自定义信息最后更新: {journal.custom_updated_at}
                    </p>
                  )}
                </div>

                {/* Save Button */}
                <div className="pt-4 border-t">
                  <Button onClick={handleSave} disabled={saving} className="w-full">
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    保存修改
                  </Button>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

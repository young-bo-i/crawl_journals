"use client";

import { useState, useRef } from "react";
import { 
  Pencil, 
  Save, 
  X, 
  Upload, 
  Trash2, 
  Image as ImageIcon,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

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
}

interface JournalEditorProps {
  journal: JournalData;
  hasCoverImage: boolean;
}

export function JournalEditor({ journal, hasCoverImage: initialHasCover }: JournalEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [hasCoverImage, setHasCoverImage] = useState(initialHasCover);
  const [coverImageKey, setCoverImageKey] = useState(0); // 用于强制刷新图片
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 表单状态
  const [formData, setFormData] = useState({
    custom_title: journal.custom_title || "",
    custom_publisher: journal.custom_publisher || "",
    custom_country: journal.custom_country || "",
    custom_homepage: journal.custom_homepage || "",
    custom_description: journal.custom_description || "",
    custom_notes: journal.custom_notes || "",
  });

  const handleSave = async () => {
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
        setIsEditing(false);
        // 刷新页面以显示更新后的数据
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setMessage({ type: "error", text: data.error || "保存失败" });
      }
    } catch (err) {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      custom_title: journal.custom_title || "",
      custom_publisher: journal.custom_publisher || "",
      custom_country: journal.custom_country || "",
      custom_homepage: journal.custom_homepage || "",
      custom_description: journal.custom_description || "",
      custom_notes: journal.custom_notes || "",
    });
    setIsEditing(false);
    setMessage(null);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        setCoverImageKey((k) => k + 1); // 强制刷新图片
      } else {
        setMessage({ type: "error", text: data.error || "上传失败" });
      }
    } catch (err) {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteCover = async () => {
    if (!confirm("确定要删除封面图片吗？")) return;

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
      } else {
        setMessage({ type: "error", text: data.error || "删除失败" });
      }
    } catch (err) {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setUploading(false);
    }
  };

  // 获取显示值（自定义值优先）
  const getDisplayValue = (field: "title" | "publisher" | "country" | "homepage") => {
    const customKey = `custom_${field}` as keyof typeof formData;
    const customValue = formData[customKey];
    const originalValue = journal[field];
    
    if (customValue) {
      return { value: customValue, isCustom: true };
    }
    return { value: originalValue || "", isCustom: false };
  };

  return (
    <div className="space-y-6">
      {/* 封面图片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            期刊封面
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-6">
            {/* 封面预览 */}
            <div className="w-48 h-64 border rounded-lg overflow-hidden bg-muted flex items-center justify-center">
              {hasCoverImage ? (
                <img
                  key={coverImageKey}
                  src={`/api/journals/${journal.id}/cover?t=${coverImageKey}`}
                  alt="期刊封面"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">暂无封面</p>
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button 
                variant="outline" 
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
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除封面
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                支持 JPG、PNG、GIF、WebP 格式，最大 5MB
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 自定义信息编辑 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              自定义信息
            </CardTitle>
            {!isEditing ? (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                编辑
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
                  <X className="mr-2 h-4 w-4" />
                  取消
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  保存
                </Button>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            自定义信息会覆盖抓取的原始数据进行显示
          </p>
        </CardHeader>
        <CardContent>
          {/* 消息提示 */}
          {message && (
            <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
              message.type === "success" 
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                : "bg-destructive/10 text-destructive"
            }`}>
              {message.type === "success" ? (
                <Check className="h-4 w-4" />
              ) : (
                <X className="h-4 w-4" />
              )}
              {message.text}
            </div>
          )}

          <div className="space-y-4">
            {/* 自定义标题 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">标题</label>
                {getDisplayValue("title").isCustom && (
                  <Badge variant="secondary" className="text-xs">自定义</Badge>
                )}
              </div>
              {isEditing ? (
                <Input
                  value={formData.custom_title}
                  onChange={(e) => setFormData({ ...formData, custom_title: e.target.value })}
                  placeholder={journal.title || "输入自定义标题..."}
                />
              ) : (
                <p className="text-sm">
                  {getDisplayValue("title").value || <span className="text-muted-foreground">-</span>}
                </p>
              )}
              {!isEditing && journal.title && formData.custom_title && (
                <p className="text-xs text-muted-foreground">原始值: {journal.title}</p>
              )}
            </div>

            <Separator />

            {/* 自定义出版社 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">出版社</label>
                {getDisplayValue("publisher").isCustom && (
                  <Badge variant="secondary" className="text-xs">自定义</Badge>
                )}
              </div>
              {isEditing ? (
                <Input
                  value={formData.custom_publisher}
                  onChange={(e) => setFormData({ ...formData, custom_publisher: e.target.value })}
                  placeholder={journal.publisher || "输入自定义出版社..."}
                />
              ) : (
                <p className="text-sm">
                  {getDisplayValue("publisher").value || <span className="text-muted-foreground">-</span>}
                </p>
              )}
            </div>

            <Separator />

            {/* 自定义国家 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">国家/地区</label>
                {getDisplayValue("country").isCustom && (
                  <Badge variant="secondary" className="text-xs">自定义</Badge>
                )}
              </div>
              {isEditing ? (
                <Input
                  value={formData.custom_country}
                  onChange={(e) => setFormData({ ...formData, custom_country: e.target.value.toUpperCase() })}
                  placeholder={journal.country || "如: US, CN, GB..."}
                  maxLength={10}
                />
              ) : (
                <p className="text-sm">
                  {getDisplayValue("country").value || <span className="text-muted-foreground">-</span>}
                </p>
              )}
            </div>

            <Separator />

            {/* 自定义主页 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">主页 URL</label>
                {getDisplayValue("homepage").isCustom && (
                  <Badge variant="secondary" className="text-xs">自定义</Badge>
                )}
              </div>
              {isEditing ? (
                <Input
                  type="url"
                  value={formData.custom_homepage}
                  onChange={(e) => setFormData({ ...formData, custom_homepage: e.target.value })}
                  placeholder={journal.homepage || "https://..."}
                />
              ) : (
                <p className="text-sm">
                  {getDisplayValue("homepage").value ? (
                    <a 
                      href={getDisplayValue("homepage").value} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {getDisplayValue("homepage").value}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </p>
              )}
            </div>

            <Separator />

            {/* 自定义描述 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">描述</label>
              {isEditing ? (
                <Textarea
                  value={formData.custom_description}
                  onChange={(e) => setFormData({ ...formData, custom_description: e.target.value })}
                  placeholder="输入期刊描述..."
                  rows={3}
                />
              ) : (
                <p className="text-sm whitespace-pre-wrap">
                  {formData.custom_description || <span className="text-muted-foreground">-</span>}
                </p>
              )}
            </div>

            <Separator />

            {/* 备注 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">备注</label>
              {isEditing ? (
                <Textarea
                  value={formData.custom_notes}
                  onChange={(e) => setFormData({ ...formData, custom_notes: e.target.value })}
                  placeholder="输入备注信息..."
                  rows={3}
                />
              ) : (
                <p className="text-sm whitespace-pre-wrap">
                  {formData.custom_notes || <span className="text-muted-foreground">-</span>}
                </p>
              )}
            </div>

            {journal.custom_updated_at && (
              <>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  自定义信息最后更新: {journal.custom_updated_at}
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

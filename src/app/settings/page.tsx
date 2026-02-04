"use client";

import { useEffect, useState } from "react";
import {
  Key,
  Plus,
  Trash2,
  Save,
  Loader2,
  ExternalLink,
  Info,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const [keys, setKeys] = useState<string[]>([""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/openalex-keys", { cache: "no-store" });
      const json = await res.json();
      if (json?.ok && json?.config?.keys) {
        setKeys(json.config.keys.length > 0 ? json.config.keys : [""]);
      }
    } catch (err) {
      console.error("加载配置失败:", err);
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/openalex-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keys }),
      });
      const json = await res.json();

      if (json?.ok) {
        setMessage({ type: "success", text: "保存成功！" });
        if (json?.config?.keys) {
          setKeys(json.config.keys.length > 0 ? json.config.keys : [""]);
        }
      } else {
        setMessage({ type: "error", text: json?.error ?? "保存失败" });
      }
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  function addKey() {
    setKeys([...keys, ""]);
  }

  function removeKey(index: number) {
    if (keys.length === 1) {
      setKeys([""]);
    } else {
      setKeys(keys.filter((_, i) => i !== index));
    }
  }

  function updateKey(index: number, value: string) {
    const newKeys = [...keys];
    newKeys[index] = value;
    setKeys(newKeys);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">系统设置</h1>
        <p className="text-muted-foreground">配置爬虫系统的相关参数</p>
      </div>

      {/* OpenAlex API Keys */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            <CardTitle>OpenAlex API Keys</CardTitle>
          </div>
          <CardDescription>
            配置 API 密钥以获得更高的请求限额
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Info */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-muted-foreground">
                配置 OpenAlex API 密钥以获得更高的请求限额（100,000 次/天）。如果不配置，将使用默认限额（10 次/秒）。
              </p>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-muted-foreground">
                可以配置多个密钥，系统会按顺序使用。当遇到限流（429 错误）时，会自动切换到下一个密钥。
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">获取密钥：</span>
              <a
                href="https://openalex.org/account"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                https://openalex.org/account
              </a>
            </div>
          </div>

          <Separator />

          {/* Keys List */}
          <div className="space-y-3">
            {keys.map((key, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-16 shrink-0">
                  密钥 {index + 1}
                </span>
                <Input
                  type="text"
                  value={key}
                  onChange={(e) => updateKey(index, e.target.value)}
                  placeholder="输入 API Key (留空则不使用)"
                  className="font-mono flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => removeKey(index)}
                  disabled={keys.length === 1}
                  className="shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Add Key */}
          <Button variant="outline" onClick={addKey}>
            <Plus className="mr-2 h-4 w-4" />
            添加密钥
          </Button>

          <Separator />

          {/* Message */}
          {message && (
            <div
              className={`rounded-lg border p-4 flex items-center gap-3 ${
                message.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              <span className="text-sm">{message.text}</span>
            </div>
          )}

          {/* Save Button */}
          <Button onClick={saveConfig} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saving ? "保存中..." : "保存配置"}
          </Button>
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">使用说明</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
            <li>默认情况下（不配置密钥），OpenAlex API 限制为每秒 10 次请求</li>
            <li>配置密钥后，可以获得每天 100,000 次请求的限额</li>
            <li>配置多个密钥可以进一步提高限额和可用性</li>
            <li>当某个密钥遇到限流时，系统会自动切换到下一个可用密钥</li>
            <li>密钥按照配置的顺序依次使用</li>
            <li>修改配置后立即生效，无需重启服务</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

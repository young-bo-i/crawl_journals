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
  ImageIcon,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ===== 消息提示组件 =====
function StatusMessage({ message }: { message: { type: "success" | "error"; text: string } | null }) {
  if (!message) return null;
  return (
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
  );
}

export default function SettingsPage() {
  // ===== OpenAlex 配置 =====
  const [keys, setKeys] = useState<string[]>([""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ===== NLM (NCBI) API Key 配置 =====
  const [nlmKeys, setNlmKeys] = useState<Array<{ apiKey: string; email: string }>>([]);
  const [nlmLoading, setNlmLoading] = useState(true);
  const [nlmSaving, setNlmSaving] = useState(false);
  const [nlmMessage, setNlmMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ===== Google 图片搜索配置 =====
  const [googleApiKeys, setGoogleApiKeys] = useState<Array<{ apiKey: string; cx: string }>>([]);
  const [googleProxies, setGoogleProxies] = useState<string[]>([]);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleSaving, setGoogleSaving] = useState(false);
  const [googleMessage, setGoogleMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
    loadNlmConfig();
    loadGoogleConfig();
  }, []);

  // ===== OpenAlex 相关方法 =====
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

  // ===== NLM (NCBI) 相关方法 =====
  async function loadNlmConfig() {
    setNlmLoading(true);
    try {
      const res = await fetch("/api/settings/nlm-keys", { cache: "no-store" });
      const json = await res.json();
      if (json?.ok && json?.config) {
        setNlmKeys(json.config.keys?.length > 0 ? json.config.keys : []);
      }
    } catch (err) {
      console.error("加载 NLM 配置失败:", err);
    } finally {
      setNlmLoading(false);
    }
  }

  async function saveNlmConfig() {
    setNlmSaving(true);
    setNlmMessage(null);
    try {
      const res = await fetch("/api/settings/nlm-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keys: nlmKeys }),
      });
      const json = await res.json();

      if (json?.ok) {
        setNlmMessage({ type: "success", text: "保存成功！" });
        if (json?.config) {
          setNlmKeys(json.config.keys ?? []);
        }
      } else {
        setNlmMessage({ type: "error", text: json?.error ?? "保存失败" });
      }
    } catch (err: unknown) {
      setNlmMessage({ type: "error", text: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setNlmSaving(false);
    }
  }

  function addNlmKey() {
    setNlmKeys([...nlmKeys, { apiKey: "", email: "" }]);
  }
  function removeNlmKey(index: number) {
    setNlmKeys(nlmKeys.filter((_, i) => i !== index));
  }
  function updateNlmKey(index: number, field: "apiKey" | "email", value: string) {
    const updated = [...nlmKeys];
    updated[index] = { ...updated[index], [field]: value };
    setNlmKeys(updated);
  }

  // ===== Google 图片搜索相关方法 =====
  async function loadGoogleConfig() {
    setGoogleLoading(true);
    try {
      const res = await fetch("/api/settings/google-search", { cache: "no-store" });
      const json = await res.json();
      if (json?.ok && json?.config) {
        setGoogleApiKeys(
          json.config.apiKeys?.length > 0
            ? json.config.apiKeys
            : []
        );
        setGoogleProxies(
          json.config.proxies?.length > 0
            ? json.config.proxies
            : []
        );
      }
    } catch (err) {
      console.error("加载 Google 配置失败:", err);
    } finally {
      setGoogleLoading(false);
    }
  }

  async function saveGoogleConfig() {
    setGoogleSaving(true);
    setGoogleMessage(null);
    try {
      const res = await fetch("/api/settings/google-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKeys: googleApiKeys, proxies: googleProxies }),
      });
      const json = await res.json();

      if (json?.ok) {
        setGoogleMessage({ type: "success", text: "保存成功！" });
        if (json?.config) {
          setGoogleApiKeys(json.config.apiKeys ?? []);
          setGoogleProxies(json.config.proxies ?? []);
        }
      } else {
        setGoogleMessage({ type: "error", text: json?.error ?? "保存失败" });
      }
    } catch (err: unknown) {
      setGoogleMessage({ type: "error", text: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setGoogleSaving(false);
    }
  }

  // Google API Key 组操作
  function addGoogleApiKey() {
    setGoogleApiKeys([...googleApiKeys, { apiKey: "", cx: "" }]);
  }
  function removeGoogleApiKey(index: number) {
    setGoogleApiKeys(googleApiKeys.filter((_, i) => i !== index));
  }
  function updateGoogleApiKey(index: number, field: "apiKey" | "cx", value: string) {
    const updated = [...googleApiKeys];
    updated[index] = { ...updated[index], [field]: value };
    setGoogleApiKeys(updated);
  }

  // SOCKS5 代理操作
  function addProxy() {
    setGoogleProxies([...googleProxies, ""]);
  }
  function removeProxy(index: number) {
    setGoogleProxies(googleProxies.filter((_, i) => i !== index));
  }
  function updateProxy(index: number, value: string) {
    const updated = [...googleProxies];
    updated[index] = value;
    setGoogleProxies(updated);
  }

  if (loading || nlmLoading || googleLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">系统设置</h1>
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

          <StatusMessage message={message} />

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

      {/* NLM (NCBI) API Keys */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>NLM (NCBI) API Keys</CardTitle>
          </div>
          <CardDescription>
            配置 NCBI E-utilities API 密钥，用于 NLM 数据源的期刊查询
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Info */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-muted-foreground">
                配置 NCBI API Key 可将请求限额从 <strong>5 次/秒</strong> 提升到 <strong>10 次/秒</strong>。不配置也可使用，但频繁请求时可能被限流。
              </p>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-muted-foreground">
                可以配置多个 Key，系统会轮询使用以分散请求压力。每个 Key 建议关联一个 Email。
              </p>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="text-muted-foreground space-y-1">
                <p>API Key 获取步骤：</p>
                <ol className="list-decimal list-inside ml-1 space-y-0.5">
                  <li>
                    登录{" "}
                    <a href="https://www.ncbi.nlm.nih.gov/account/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      NCBI 账户
                    </a>
                  </li>
                  <li>进入 Account Settings，滚动到底部「API Key Management」</li>
                  <li>点击「Create API Key」生成密钥</li>
                </ol>
              </div>
            </div>
          </div>

          <Separator />

          {/* NLM Keys 列表 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">API Key 列表（轮询使用）</label>
              <Button variant="outline" size="sm" onClick={addNlmKey}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                添加
              </Button>
            </div>
            {nlmKeys.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">
                未配置 API Key，NLM 数据源将使用默认限额（5 次/秒）
              </p>
            )}
            {nlmKeys.map((item, index) => (
              <div key={index} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/20">
                <span className="text-xs text-muted-foreground mt-2 w-6 shrink-0 text-center">
                  {index + 1}
                </span>
                <div className="flex-1 space-y-2">
                  <Input
                    type="password"
                    value={item.apiKey}
                    onChange={(e) => updateNlmKey(index, "apiKey", e.target.value)}
                    placeholder="API Key"
                    className="font-mono h-8 text-sm"
                  />
                  <Input
                    type="email"
                    value={item.email}
                    onChange={(e) => updateNlmKey(index, "email", e.target.value)}
                    placeholder="关联邮箱（可选）"
                    className="h-8 text-sm"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0 mt-0.5"
                  onClick={() => removeNlmKey(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          <StatusMessage message={nlmMessage} />

          {/* Save Button */}
          <Button onClick={saveNlmConfig} disabled={nlmSaving}>
            {nlmSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {nlmSaving ? "保存中..." : "保存配置"}
          </Button>
        </CardContent>
      </Card>

      {/* Google 图片搜索配置 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            <CardTitle>Google 图片搜索</CardTitle>
          </div>
          <CardDescription>
            配置 Google Custom Search API，用于搜索期刊封面图片（可选）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Info */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-muted-foreground">
                <strong>不配置也可使用</strong> —— 系统默认通过爬虫方式抓取 Google 图片搜索结果，无需任何密钥。但爬虫方式在频繁使用时可能被 Google 限流。
              </p>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-muted-foreground">
                如需更稳定的搜索体验，可配置 Google Custom Search API Key（免费额度：每天 100 次搜索）。配置后系统将优先使用官方 API。
              </p>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="text-muted-foreground space-y-1">
                <p>API Key 获取步骤：</p>
                <ol className="list-decimal list-inside ml-1 space-y-0.5">
                  <li>
                    访问{" "}
                    <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Google Cloud Console
                    </a>
                    {" "}创建项目，启用 Custom Search JSON API，创建 API Key
                  </li>
                  <li>
                    访问{" "}
                    <a href="https://cse.google.com/cse/all" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Google Programmable Search Engine
                    </a>
                    {" "}创建搜索引擎，开启「搜索整个网络」和「图片搜索」，获取搜索引擎 ID
                  </li>
                </ol>
              </div>
            </div>
          </div>

          <Separator />

          {/* API Keys 列表 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">API Key 组（轮询使用）</label>
              <Button variant="outline" size="sm" onClick={addGoogleApiKey}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                添加
              </Button>
            </div>
            {googleApiKeys.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">
                未配置 API Key，系统将使用爬虫模式搜索图片
              </p>
            )}
            {googleApiKeys.map((item, index) => (
              <div key={index} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/20">
                <span className="text-xs text-muted-foreground mt-2 w-6 shrink-0 text-center">
                  {index + 1}
                </span>
                <div className="flex-1 space-y-2">
                  <Input
                    type="password"
                    value={item.apiKey}
                    onChange={(e) => updateGoogleApiKey(index, "apiKey", e.target.value)}
                    placeholder="API Key"
                    className="font-mono h-8 text-sm"
                  />
                  <Input
                    type="text"
                    value={item.cx}
                    onChange={(e) => updateGoogleApiKey(index, "cx", e.target.value)}
                    placeholder="搜索引擎 ID (CX)"
                    className="font-mono h-8 text-sm"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0 mt-0.5"
                  onClick={() => removeGoogleApiKey(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          {/* SOCKS5 代理列表 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">SOCKS5 代理（爬虫模式轮询使用）</label>
              <Button variant="outline" size="sm" onClick={addProxy}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                添加
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              配置 SOCKS5 代理可以帮助绕过 Google 的请求限制。多个代理会轮询使用。格式：<code className="bg-muted px-1 rounded">socks5://host:port</code> 或 <code className="bg-muted px-1 rounded">socks5://user:pass@host:port</code>
            </p>
            {googleProxies.map((proxy, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-6 shrink-0 text-center">
                  {index + 1}
                </span>
                <Input
                  type="text"
                  value={proxy}
                  onChange={(e) => updateProxy(index, e.target.value)}
                  placeholder="socks5://127.0.0.1:1080"
                  className="font-mono flex-1 h-8 text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeProxy(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          <StatusMessage message={googleMessage} />

          {/* Save Button */}
          <Button onClick={saveGoogleConfig} disabled={googleSaving}>
            {googleSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {googleSaving ? "保存中..." : "保存配置"}
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

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
  Globe,
  Shield,
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
  type ImageSearchMethod = "scraper_proxy" | "google_api" | "scraper_api" | "serper_api" | "mirror_scraper";
  const [googleMethod, setGoogleMethod] = useState<ImageSearchMethod>("scraper_proxy");
  const [googleApiKeys, setGoogleApiKeys] = useState<Array<{ apiKey: string; cx: string }>>([]);
  const [googleProxies, setGoogleProxies] = useState<string[]>([]);
  const [scraperApiKeys, setScraperApiKeys] = useState<string[]>([]);
  const [serperApiKeys, setSerperApiKeys] = useState<string[]>([]);
  const [mirrorUrl, setMirrorUrl] = useState<string>("");
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleSaving, setGoogleSaving] = useState(false);
  const [googleMessage, setGoogleMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ===== Wikidata 代理配置 =====
  const [wdProxyEnabled, setWdProxyEnabled] = useState(false);
  const [wdProxies, setWdProxies] = useState<string[]>([]);
  const [wdLoading, setWdLoading] = useState(true);
  const [wdSaving, setWdSaving] = useState(false);
  const [wdMessage, setWdMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
    loadNlmConfig();
    loadGoogleConfig();
    loadWdProxyConfig();
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
        setGoogleMethod(json.config.method || "scraper_proxy");
        setGoogleApiKeys(json.config.apiKeys?.length > 0 ? json.config.apiKeys : []);
        setGoogleProxies(json.config.proxies?.length > 0 ? json.config.proxies : []);
        setScraperApiKeys(json.config.scraperApiKeys?.length > 0 ? json.config.scraperApiKeys : []);
        setSerperApiKeys(json.config.serperApiKeys?.length > 0 ? json.config.serperApiKeys : []);
        setMirrorUrl(json.config.mirrorUrl || "");
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
        body: JSON.stringify({
          method: googleMethod,
          apiKeys: googleApiKeys,
          proxies: googleProxies,
          scraperApiKeys,
          serperApiKeys,
          mirrorUrl,
        }),
      });
      const json = await res.json();

      if (json?.ok) {
        setGoogleMessage({ type: "success", text: "保存成功！" });
        if (json?.config) {
          setGoogleMethod(json.config.method || "scraper_proxy");
          setGoogleApiKeys(json.config.apiKeys ?? []);
          setGoogleProxies(json.config.proxies ?? []);
          setScraperApiKeys(json.config.scraperApiKeys ?? []);
          setSerperApiKeys(json.config.serperApiKeys ?? []);
          setMirrorUrl(json.config.mirrorUrl ?? "");
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

  // ScraperAPI Key 操作
  function addScraperApiKey() {
    setScraperApiKeys([...scraperApiKeys, ""]);
  }
  function removeScraperApiKey(index: number) {
    setScraperApiKeys(scraperApiKeys.filter((_, i) => i !== index));
  }
  function updateScraperApiKey(index: number, value: string) {
    const updated = [...scraperApiKeys];
    updated[index] = value;
    setScraperApiKeys(updated);
  }

  // Serper API Key 操作
  function addSerperApiKey() {
    setSerperApiKeys([...serperApiKeys, ""]);
  }
  function removeSerperApiKey(index: number) {
    setSerperApiKeys(serperApiKeys.filter((_, i) => i !== index));
  }
  function updateSerperApiKey(index: number, value: string) {
    const updated = [...serperApiKeys];
    updated[index] = value;
    setSerperApiKeys(updated);
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

  // ===== Wikidata 代理相关方法 =====
  async function loadWdProxyConfig() {
    setWdLoading(true);
    try {
      const res = await fetch("/api/settings/wikidata-proxy", { cache: "no-store" });
      const json = await res.json();
      if (json?.ok && json?.config) {
        setWdProxyEnabled(!!json.config.enabled);
        setWdProxies(json.config.proxies?.length > 0 ? json.config.proxies : []);
      }
    } catch (err) {
      console.error("加载 Wikidata 代理配置失败:", err);
    } finally {
      setWdLoading(false);
    }
  }

  async function saveWdProxyConfig() {
    setWdSaving(true);
    setWdMessage(null);
    try {
      const res = await fetch("/api/settings/wikidata-proxy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: wdProxyEnabled, proxies: wdProxies }),
      });
      const json = await res.json();

      if (json?.ok) {
        setWdMessage({ type: "success", text: "保存成功！" });
        if (json?.config) {
          setWdProxyEnabled(!!json.config.enabled);
          setWdProxies(json.config.proxies ?? []);
        }
      } else {
        setWdMessage({ type: "error", text: json?.error ?? "保存失败" });
      }
    } catch (err: unknown) {
      setWdMessage({ type: "error", text: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setWdSaving(false);
    }
  }

  function addWdProxy() {
    setWdProxies([...wdProxies, ""]);
  }
  function removeWdProxy(index: number) {
    setWdProxies(wdProxies.filter((_, i) => i !== index));
  }
  function updateWdProxy(index: number, value: string) {
    const updated = [...wdProxies];
    updated[index] = value;
    setWdProxies(updated);
  }

  if (loading || nlmLoading || googleLoading || wdLoading) {
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
            <CardTitle>图片搜索</CardTitle>
          </div>
          <CardDescription>
            配置期刊封面图片的搜索方式和相关密钥
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 搜索方式选择 */}
          <div className="space-y-3">
            <label className="text-sm font-medium">搜索方式</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {([
                {
                  value: "serper_api" as ImageSearchMethod,
                  label: "Serper.dev",
                  desc: "结构化 JSON 返回，速度快（1-2s），推荐使用",
                  tag: "推荐",
                },
                {
                  value: "scraper_proxy" as ImageSearchMethod,
                  label: "直接爬虫",
                  desc: "直接请求 Google Images，支持 SOCKS5 代理轮询",
                  tag: "免费",
                },
                {
                  value: "google_api" as ImageSearchMethod,
                  label: "Google API",
                  desc: "Google Custom Search 官方 API，稳定可靠",
                  tag: "100次/天/Key",
                },
                {
                  value: "mirror_scraper" as ImageSearchMethod,
                  label: "自定义镜像站",
                  desc: "通过 Google 镜像站搜索，无需代理和 API Key",
                  tag: "免费",
                },
                {
                  value: "scraper_api" as ImageSearchMethod,
                  label: "ScraperAPI",
                  desc: "第三方代理服务，自动处理反爬和 IP 轮换",
                  tag: "5 credits/次",
                },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`relative rounded-lg border-2 p-3 text-left transition-colors ${
                    googleMethod === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/30"
                  }`}
                  onClick={() => setGoogleMethod(opt.value)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      googleMethod === opt.value
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {opt.tag}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* ===== 直接爬虫配置 ===== */}
          {googleMethod === "scraper_proxy" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-muted-foreground">
                    直接爬取 Google 图片搜索页面。不配置代理可直接使用，但频繁请求会被 Google 限流。
                    建议配置 SOCKS5 代理以提高稳定性。
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">SOCKS5 代理（轮询使用）</label>
                  <Button variant="outline" size="sm" onClick={addProxy}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    添加
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  格式：<code className="bg-muted px-1 rounded">socks5://host:port</code> 或 <code className="bg-muted px-1 rounded">socks5://user:pass@host:port</code>
                </p>
                {googleProxies.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">
                    未配置代理，将直接连接 Google（容易被限流）
                  </p>
                )}
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
            </div>
          )}

          {/* ===== 自定义镜像站配置 ===== */}
          {googleMethod === "mirror_scraper" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-muted-foreground">
                    通过自建的 Google 镜像站搜索图片。镜像站返回与 Google Images 相同的 HTML 页面，
                    无需代理、无需 API Key。请确保镜像站可正常访问。
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-sm font-medium">镜像站地址</label>
                <p className="text-xs text-muted-foreground">
                  填写 Google 图片搜索镜像站的基础 URL，例如 <code className="bg-muted px-1 rounded">http://example.com:8080</code>
                </p>
                <Input
                  value={mirrorUrl}
                  onChange={(e) => setMirrorUrl(e.target.value)}
                  placeholder="http://younghome.fun:22978"
                  className="font-mono h-9 text-sm"
                />
              </div>
            </div>
          )}

          {/* ===== Google Custom Search API 配置 ===== */}
          {googleMethod === "google_api" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-muted-foreground">
                    使用 Google Custom Search 官方 API，每个 Key 免费 100 次/天。可配置多个 Key 轮询使用。
                  </p>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="text-muted-foreground space-y-1">
                    <p>获取步骤：</p>
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
                          Programmable Search Engine
                        </a>
                        {" "}创建搜索引擎，开启「搜索整个网络」和「图片搜索」，获取 CX ID
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
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
                    请添加至少一个 API Key + CX 组合
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
            </div>
          )}

          {/* ===== Serper.dev 配置 ===== */}
          {googleMethod === "serper_api" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-muted-foreground">
                    <a href="https://serper.dev" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                      Serper.dev
                    </a>
                    {" "}是最快、最便宜的 Google 搜索 API。直接返回结构化 JSON 数据，无需解析 HTML，响应速度 1-2 秒。
                  </p>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-muted-foreground">
                    免费 <strong>2,500 次/月</strong>，无需信用卡。之后 $0.30/千次。
                    可配置多个 Key 轮询以分散用量。
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">注册获取 API Key：</span>
                  <a
                    href="https://serper.dev/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    serper.dev/dashboard
                  </a>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">API Key 列表（轮询使用）</label>
                  <Button variant="outline" size="sm" onClick={addSerperApiKey}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    添加
                  </Button>
                </div>
                {serperApiKeys.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">
                    请添加至少一个 Serper API Key
                  </p>
                )}
                {serperApiKeys.map((key, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6 shrink-0 text-center">
                      {index + 1}
                    </span>
                    <Input
                      type="password"
                      value={key}
                      onChange={(e) => updateSerperApiKey(index, e.target.value)}
                      placeholder="Serper API Key"
                      className="font-mono flex-1 h-8 text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeSerperApiKey(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== ScraperAPI 配置 ===== */}
          {googleMethod === "scraper_api" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-muted-foreground">
                    通过{" "}
                    <a href="https://www.scraperapi.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      ScraperAPI
                    </a>
                    {" "}代理请求 Google 图片搜索。ScraperAPI 会自动处理 IP 轮换、CAPTCHA 验证等反爬措施，99.99% 成功率。
                  </p>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-muted-foreground">
                    免费试用 <strong>5,000 次</strong>请求（7 天），无需信用卡。
                    可配置多个 Key 轮询以分散用量。
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">注册获取 API Key：</span>
                  <a
                    href="https://dashboard.scraperapi.com/signup"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    dashboard.scraperapi.com
                  </a>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">API Key 列表（轮询使用）</label>
                  <Button variant="outline" size="sm" onClick={addScraperApiKey}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    添加
                  </Button>
                </div>
                {scraperApiKeys.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">
                    请添加至少一个 ScraperAPI Key
                  </p>
                )}
                {scraperApiKeys.map((key, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6 shrink-0 text-center">
                      {index + 1}
                    </span>
                    <Input
                      type="password"
                      value={key}
                      onChange={(e) => updateScraperApiKey(index, e.target.value)}
                      placeholder="ScraperAPI Key"
                      className="font-mono flex-1 h-8 text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeScraperApiKey(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

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

      {/* Wikidata SOCKS5 代理 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            <CardTitle>Wikidata 代理</CardTitle>
          </div>
          <CardDescription>
            配置 SOCKS5 代理，用于请求 Wikidata SPARQL 接口（可选）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Info */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-muted-foreground">
                Wikidata SPARQL 接口（query.wikidata.org）在某些网络环境下可能无法直接访问。配置 SOCKS5 代理可以解决连接问题。
              </p>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-muted-foreground">
                配置多个代理时，系统会轮询使用。格式：<code className="bg-muted px-1 rounded">socks5://host:port</code> 或 <code className="bg-muted px-1 rounded">socks5://user:pass@host:port</code>
              </p>
            </div>
          </div>

          <Separator />

          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <label className="text-sm font-medium">启用 SOCKS5 代理</label>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={wdProxyEnabled}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                wdProxyEnabled ? "bg-primary" : "bg-muted"
              }`}
              onClick={() => setWdProxyEnabled(!wdProxyEnabled)}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  wdProxyEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* 代理列表 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">SOCKS5 代理列表（轮询使用）</label>
              <Button variant="outline" size="sm" onClick={addWdProxy}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                添加
              </Button>
            </div>
            {wdProxies.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">
                {wdProxyEnabled
                  ? "已启用代理但未添加地址，请添加至少一个 SOCKS5 代理"
                  : "未配置代理，Wikidata 请求将直接连接"}
              </p>
            )}
            {wdProxies.map((proxy, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-6 shrink-0 text-center">
                  {index + 1}
                </span>
                <Input
                  type="text"
                  value={proxy}
                  onChange={(e) => updateWdProxy(index, e.target.value)}
                  placeholder="socks5://127.0.0.1:1080"
                  className="font-mono flex-1 h-8 text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeWdProxy(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          <StatusMessage message={wdMessage} />

          {/* Save Button */}
          <Button onClick={saveWdProxyConfig} disabled={wdSaving}>
            {wdSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {wdSaving ? "保存中..." : "保存配置"}
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

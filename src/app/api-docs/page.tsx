import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileJson, Code, Server, AlertCircle } from "lucide-react";

export default function ApiDocsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API 文档</h1>
        <p className="text-muted-foreground">
          期刊综合数据 API - 包括期刊索引、JCR 影响因子（2020-2024）和中科院分区（2021-2025）
        </p>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            <CardTitle>基本信息</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">接口地址</dt>
              <dd><code className="rounded bg-muted px-2 py-1 font-mono text-xs">GET /api/public/journals</code></dd>
            </div>
            <Separator />
            <div className="flex justify-between">
              <dt className="text-muted-foreground">数据内容</dt>
              <dd>期刊索引 + JCR 影响因子（5年）+ 中科院分区（4年）</dd>
            </div>
            <Separator />
            <div className="flex justify-between">
              <dt className="text-muted-foreground">JCR 数据</dt>
              <dd>2020-2024年（100,097条记录）</dd>
            </div>
            <Separator />
            <div className="flex justify-between">
              <dt className="text-muted-foreground">中科院分区</dt>
              <dd>2021-2025年（60,365条记录）</dd>
            </div>
            <Separator />
            <div className="flex justify-between">
              <dt className="text-muted-foreground">返回格式</dt>
              <dd><Badge variant="outline">JSON</Badge></dd>
            </div>
            <Separator />
            <div className="flex justify-between">
              <dt className="text-muted-foreground">认证方式</dt>
              <dd><Badge variant="success">无需认证（公开接口）</Badge></dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Request Parameters */}
      <Card>
        <CardHeader>
          <CardTitle>请求参数</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>参数名</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>必填</TableHead>
                <TableHead>默认值</TableHead>
                <TableHead>说明</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell><code className="text-xs">page</code></TableCell>
                <TableCell>number</TableCell>
                <TableCell><Badge variant="secondary">否</Badge></TableCell>
                <TableCell>1</TableCell>
                <TableCell>页码（从 1 开始）</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code className="text-xs">pageSize</code></TableCell>
                <TableCell>number</TableCell>
                <TableCell><Badge variant="secondary">否</Badge></TableCell>
                <TableCell>20</TableCell>
                <TableCell>每页数量（1-200）</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code className="text-xs">q</code></TableCell>
                <TableCell>string</TableCell>
                <TableCell><Badge variant="secondary">否</Badge></TableCell>
                <TableCell>-</TableCell>
                <TableCell>搜索关键词（匹配 ISSN、标题、出版商）</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code className="text-xs">inDoaj</code></TableCell>
                <TableCell>boolean</TableCell>
                <TableCell><Badge variant="secondary">否</Badge></TableCell>
                <TableCell>-</TableCell>
                <TableCell>是否在 DOAJ 中</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code className="text-xs">inNlm</code></TableCell>
                <TableCell>boolean</TableCell>
                <TableCell><Badge variant="secondary">否</Badge></TableCell>
                <TableCell>-</TableCell>
                <TableCell>是否在 NLM 中</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code className="text-xs">hasWikidata</code></TableCell>
                <TableCell>boolean</TableCell>
                <TableCell><Badge variant="secondary">否</Badge></TableCell>
                <TableCell>-</TableCell>
                <TableCell>是否有 Wikidata 记录</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code className="text-xs">isOpenAccess</code></TableCell>
                <TableCell>boolean</TableCell>
                <TableCell><Badge variant="secondary">否</Badge></TableCell>
                <TableCell>-</TableCell>
                <TableCell>是否为开放获取</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code className="text-xs">sortBy</code></TableCell>
                <TableCell>string</TableCell>
                <TableCell><Badge variant="secondary">否</Badge></TableCell>
                <TableCell>-</TableCell>
                <TableCell>排序字段</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code className="text-xs">sortOrder</code></TableCell>
                <TableCell>string</TableCell>
                <TableCell><Badge variant="secondary">否</Badge></TableCell>
                <TableCell>desc</TableCell>
                <TableCell>排序顺序（asc/desc）</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="mt-6 rounded-lg bg-muted/50 p-4">
            <p className="text-sm font-medium mb-2">sortBy 可选值：</p>
            <div className="flex flex-wrap gap-2">
              {["primary_issn", "title", "publisher", "country", "works_count", "cited_by_count", "updated_at"].map((v) => (
                <code key={v} className="rounded bg-background px-2 py-1 text-xs">{v}</code>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Response Format */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            <CardTitle>返回格式</CardTitle>
          </div>
          <CardDescription>完整示例</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded-lg bg-muted p-4 overflow-auto text-xs leading-relaxed max-h-[500px]">
{`{
  "ok": true,
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 70519,
    "totalPages": 3526
  },
  "filters": {
    "q": null,
    "inDoaj": true,
    "inNlm": null,
    "hasWikidata": null,
    "isOpenAccess": null,
    "sortBy": "updated_at",
    "sortOrder": "desc"
  },
  "data": [
    {
      "primary_issn": "0007-9235",
      "unified_index": {
        "title": "CA-A CANCER JOURNAL FOR CLINICIANS",
        "publisher": "Wiley",
        "country": "US",
        "languages": ["en"],
        "subjects": ["Oncology", "Medicine"],
        "is_open_access": 0,
        "in_doaj": 0,
        "in_nlm": 1,
        "has_wikidata": 1,
        "works_count": 15000,
        "cited_by_count": 500000,
        "updated_at": "2026-01-19 12:00:00"
      },
      "jcr": {
        "total_years": 5,
        "data": [
          {
            "year": 2024,
            "journal": "CA-A CANCER JOURNAL FOR CLINICIANS",
            "issn": "0007-9235",
            "eissn": "1542-4863",
            "category": "ONCOLOGY(SCIE)",
            "impact_factor": 232.4,
            "quartile": "Q1",
            "rank": "1/326"
          }
        ]
      },
      "cas_partition": {
        "total_years": 4,
        "data": [
          {
            "year": 2025,
            "journal": "CA-A CANCER JOURNAL FOR CLINICIANS",
            "issn": "0007-9235/1542-4863",
            "major_category": "医学",
            "major_partition": "1",
            "is_top_journal": true,
            "minor_categories": [
              {
                "category": "ONCOLOGY 肿瘤学",
                "partition": "1 [1/326]"
              }
            ]
          }
        ]
      }
    }
  ]
}`}
          </pre>
        </CardContent>
      </Card>

      {/* Request Examples */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            <CardTitle>请求示例</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { title: "获取第一页数据（默认 20 条）", code: "GET /api/public/journals" },
            { title: "获取第 2 页，每页 50 条", code: "GET /api/public/journals?page=2&pageSize=50" },
            { title: "搜索标题包含 \"science\" 的期刊", code: "GET /api/public/journals?q=science" },
            { title: "筛选 DOAJ 中的开放获取期刊", code: "GET /api/public/journals?inDoaj=true&isOpenAccess=true" },
            { title: "按引用次数降序排序", code: "GET /api/public/journals?sortBy=cited_by_count&sortOrder=desc" },
            { title: "组合查询示例", code: "GET /api/public/journals?page=1&pageSize=100&inDoaj=true&sortBy=works_count&sortOrder=desc" },
          ].map((example, i) => (
            <div key={i}>
              <p className="text-sm mb-2">{i + 1}. {example.title}</p>
              <pre className="rounded-lg bg-muted p-3 text-xs font-mono">{example.code}</pre>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Error Codes */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <CardTitle>错误代码</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>HTTP 状态码</TableHead>
                <TableHead>说明</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell><Badge variant="success">200</Badge></TableCell>
                <TableCell>请求成功</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge variant="warning">400</Badge></TableCell>
                <TableCell>请求参数错误</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge variant="destructive">500</Badge></TableCell>
                <TableCell>服务器内部错误</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="mt-4">
            <p className="text-sm text-muted-foreground mb-2">错误响应格式：</p>
            <pre className="rounded-lg bg-muted p-3 text-xs font-mono">
{`{
  "ok": false,
  "error": "Invalid parameters",
  "details": [ ... ]
}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

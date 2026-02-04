# crawl_journals

一体化 Web 工具：从 OpenAlex 获取期刊 ISSN 列表，按 ISSN 聚合抓取 OpenAlex/Crossref/DOAJ/NLM Catalog/Wikidata 的原始字段并入库（SQLite），提供列表展示与 Excel 导出。

## Docker 运行（推荐）

1. 启动：`docker compose up --build`
2. 打开：`http://localhost:3000`

数据文件默认持久化到 `./data/app.db`。

建议在 `.env` 中填写（`docker compose` 会自动读取同目录 `.env`）：
- `CROSSREF_MAILTO`（Crossref 建议带邮箱）
- `NCBI_EMAIL` / `NCBI_API_KEY`（NLM eutils 配额与礼貌策略）
- `DOAJ_API_KEY`（如你的 DOAJ 需要）

## 页面

- `/`：抓取任务（SSE 实时进度）
- `/journals`：期刊列表（筛选 + 导出 Excel）
- `/journals/{ISSN}`：期刊详情（聚合字段 + 各来源 raw）

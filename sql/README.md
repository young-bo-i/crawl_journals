# 数据库 SQL 脚本

本目录包含 MySQL 数据库的迁移脚本。

## 文件命名规范

```
{版本号}_{描述}.sql
```

- **版本号**: 3位数字，如 `001`, `002`, `003`
- **描述**: 简短的英文描述，单词间用下划线连接

示例:
- `001_init_tables.sql` - 初始化所有数据表
- `002_add_impact_factor.sql` - 添加影响因子字段

## 当前迁移

| 版本 | 文件 | 说明 |
|------|------|------|
| 001 | `001_init_tables.sql` | 初始化所有数据表 |

## 迁移机制

### 自动执行

当应用首次访问数据库时，`src/server/db/mysql.ts` 的 `runMigrations()` 会自动:

1. 创建 `schema_migrations` 表（如果不存在）
2. 读取 `src/server/db/migrations/index.ts` 中定义的迁移
3. 检查哪些迁移尚未执行
4. 按版本号顺序执行新迁移
5. 记录到 `schema_migrations` 表

### 幂等性要求

**所有 SQL 脚本必须是幂等的**，即使用 `CREATE TABLE IF NOT EXISTS`：

```sql
-- ✅ 正确
CREATE TABLE IF NOT EXISTS users (...);

-- ❌ 错误
CREATE TABLE users (...);
```

## 添加新迁移

1. 创建新的 SQL 文件：
   ```bash
   touch sql/002_add_new_feature.sql
   ```

2. 编写 SQL：
   ```sql
   -- 002_add_new_feature.sql
   ALTER TABLE journals ADD COLUMN IF NOT EXISTS new_field VARCHAR(100);
   ```

3. 在 `src/server/db/migrations/index.ts` 中注册：
   ```typescript
   export const migrations: Migration[] = [
     { version: 1, name: "init_tables", sql: "..." },
     { version: 2, name: "add_new_feature", sql: loadMigrationFromFile("002_add_new_feature.sql") },
   ];
   ```

4. 重启应用，迁移会自动执行。

## 数据库重置

```bash
# 停止并删除容器和数据卷
docker-compose down -v

# 重新启动（会自动重新初始化）
docker-compose up -d
```

## 本地开发

```bash
# 启动 MySQL
docker-compose up -d mysql

# 启动应用（迁移自动执行）
npm run dev
```

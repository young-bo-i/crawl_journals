#!/usr/bin/env python3
"""
重建 JCR 数据库脚本
从 jcr_mate 文件夹中的 CSV 文件重建数据库，并创建适当的索引
"""

import sqlite3
import csv
import os
from pathlib import Path

# 数据库路径
DB_PATH = Path(__file__).parent.parent / "data" / "jcr.db"
CSV_DIR = Path(__file__).parent.parent / "jcr_mate"

def create_tables(conn):
    """创建数据库表结构"""
    cursor = conn.cursor()
    
    # JCR 2020 表结构（注意：IF 后面有空格）
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS JCR2020 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            Journal TEXT NOT NULL,
            "IF (2020)" REAL,
            UNIQUE(Journal)
        )
    """)
    
    # JCR 2021 表结构（IF 后面没有空格）
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS JCR2021 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            Journal TEXT NOT NULL,
            "IF(2021)" REAL,
            UNIQUE(Journal)
        )
    """)
    
    # JCR 2022 表结构（Journal, IF, Quartile）
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS JCR2022 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            Journal TEXT NOT NULL,
            "IF(2022)" REAL,
            "IF Quartile(2022)" TEXT,
            UNIQUE(Journal)
        )
    """)
    
    # JCR 2023 表结构（包含更多字段）
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS JCR2023 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            Journal TEXT NOT NULL,
            Country TEXT,
            ISSN TEXT,
            EISSN TEXT,
            "Web of Science" TEXT,
            "IF(2023)" REAL,
            Category TEXT,
            "IF Quartile(2023)" TEXT,
            "Category Rank(2023)" TEXT,
            UNIQUE(Journal)
        )
    """)
    
    # JCR 2024 表结构（包含 ISSN, eISSN, Category, Rank）
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS JCR2024 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            Journal TEXT NOT NULL,
            ISSN TEXT,
            eISSN TEXT,
            Category TEXT,
            "IF(2024)" REAL,
            "IF Quartile(2024)" TEXT,
            "IF Rank(2024)" TEXT,
            UNIQUE(Journal)
        )
    """)
    
    # 中科院分区 2021-2023 表结构
    for year in [2021, 2022, 2023]:
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS FQBJCR{year} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                Journal TEXT NOT NULL,
                "年份" INTEGER,
                ISSN TEXT,
                Review TEXT,
                "Open Access" TEXT,
                "Web of Science" TEXT,
                "大类" TEXT,
                "大类分区" TEXT,
                Top TEXT,
                "小类1" TEXT,
                "小类1分区" TEXT,
                "小类2" TEXT,
                "小类2分区" TEXT,
                "小类3" TEXT,
                "小类3分区" TEXT,
                "小类4" TEXT,
                "小类4分区" TEXT,
                "小类5" TEXT,
                "小类5分区" TEXT,
                "小类6" TEXT,
                "小类6分区" TEXT,
                UNIQUE(Journal, ISSN)
            )
        """)
    
    # 中科院分区 2025 表结构（多了 OA Journal Index 和标注字段）
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS FQBJCR2025 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            Journal TEXT NOT NULL,
            "年份" INTEGER,
            "ISSN/EISSN" TEXT,
            Review TEXT,
            "OA Journal Index（OAJ）" TEXT,
            "Open Access" TEXT,
            "Web of Science" TEXT,
            "标注" TEXT,
            "大类" TEXT,
            "大类分区" TEXT,
            Top TEXT,
            "小类1" TEXT,
            "小类1分区" TEXT,
            "小类2" TEXT,
            "小类2分区" TEXT,
            "小类3" TEXT,
            "小类3分区" TEXT,
            "小类4" TEXT,
            "小类4分区" TEXT,
            "小类5" TEXT,
            "小类5分区" TEXT,
            "小类6" TEXT,
            "小类6分区" TEXT,
            UNIQUE(Journal, "ISSN/EISSN")
        )
    """)
    
    # CCF 2019 表（有"刊物简称"和"合并/更名为"字段）
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS CCF2019 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            "刊物简称" TEXT,
            Journal TEXT,
            "年份" INTEGER,
            "出版社" TEXT,
            "网址" TEXT,
            "领域" TEXT,
            "CCF推荐类别（国际学术刊物/会议）" TEXT,
            "CCF推荐类型" TEXT,
            "合并/更名为" TEXT
        )
    """)
    
    # CCF 2022 表（用"刊物名称"字段）
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS CCF2022 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            "刊物名称" TEXT,
            Journal TEXT,
            "年份" INTEGER,
            "出版社" TEXT,
            "网址" TEXT,
            "领域" TEXT,
            "CCF推荐类别（国际学术刊物/会议）" TEXT,
            "CCF推荐类型" TEXT
        )
    """)
    
    # CCF 中文 2019 表（只有4个字段）
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS CCFChinese2019 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            Journal TEXT,
            "主办单位" TEXT,
            "网址" TEXT,
            "CCF推荐类型" TEXT
        )
    """)
    
    # CCFT 2022 表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS CCFT2022 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            "中文刊名" TEXT,
            Journal TEXT,
            "CN号" TEXT,
            "语种" TEXT,
            "主办单位" TEXT,
            "CCF推荐类别" TEXT,
            "T分区" TEXT
        )
    """)
    
    # 国际期刊预警名单表（2020, 2021, 2023 用"预警等级"）
    for year in [2020, 2021, 2023]:
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS GJQKYJMD{year} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                Journal TEXT NOT NULL,
                "预警等级（{year}）" TEXT
            )
        """)
    
    # 国际期刊预警名单表（2024, 2025 用"预警原因"）
    for year in [2024, 2025]:
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS GJQKYJMD{year} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                Journal TEXT NOT NULL,
                "预警原因（{year}）" TEXT
            )
        """)
    
    conn.commit()
    print("✓ 数据库表结构创建完成")

def create_indexes(conn):
    """创建索引以提高查询性能"""
    cursor = conn.cursor()
    
    print("\n创建索引...")
    
    # JCR 表索引
    for year in [2020, 2021, 2022, 2023]:
        cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_jcr{year}_journal ON JCR{year}(Journal)")
        cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_jcr{year}_quartile ON JCR{year}(\"IF Quartile({year})\")")
        print(f"  ✓ JCR{year} 索引")
    
    # JCR 2024 特殊索引（包含 ISSN）
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_jcr2024_journal ON JCR2024(Journal)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_jcr2024_issn ON JCR2024(ISSN)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_jcr2024_eissn ON JCR2024(eISSN)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_jcr2024_quartile ON JCR2024(\"IF Quartile(2024)\")")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_jcr2024_category ON JCR2024(Category)")
    print("  ✓ JCR2024 索引（包含 ISSN/eISSN）")
    
    # 中科院分区表索引
    for year in [2021, 2022, 2023]:
        cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_fqb{year}_journal ON FQBJCR{year}(Journal)")
        cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_fqb{year}_issn ON FQBJCR{year}(ISSN)")
        cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_fqb{year}_major_cat ON FQBJCR{year}(\"大类\")")
        cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_fqb{year}_major_part ON FQBJCR{year}(\"大类分区\")")
        cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_fqb{year}_top ON FQBJCR{year}(Top)")
        print(f"  ✓ FQBJCR{year} 索引")
    
    # FQBJCR 2025 索引
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fqb2025_journal ON FQBJCR2025(Journal)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fqb2025_issn ON FQBJCR2025(\"ISSN/EISSN\")")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fqb2025_major_cat ON FQBJCR2025(\"大类\")")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fqb2025_major_part ON FQBJCR2025(\"大类分区\")")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fqb2025_top ON FQBJCR2025(Top)")
    print("  ✓ FQBJCR2025 索引")
    
    # CCF 表索引
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ccf2019_journal ON CCF2019(Journal)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ccf2022_journal ON CCF2022(Journal)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ccfcn2019_journal ON CCFChinese2019(Journal)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ccft2022_journal ON CCFT2022(Journal)")
    print("  ✓ CCF 索引")
    
    # 预警名单索引
    for year in [2020, 2021, 2023, 2024, 2025]:
        cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_gjqk{year}_journal ON GJQKYJMD{year}(Journal)")
    print("  ✓ 预警名单索引")
    
    conn.commit()
    print("✓ 所有索引创建完成")

def import_csv_to_table(conn, csv_file, table_name):
    """导入 CSV 文件到指定表"""
    if not csv_file.exists():
        print(f"  ⚠ 文件不存在: {csv_file.name}")
        return 0
    
    cursor = conn.cursor()
    
    with open(csv_file, 'r', encoding='utf-8-sig') as f:  # utf-8-sig 会自动处理 BOM
        reader = csv.DictReader(f)
        # 清理列名的空格
        reader.fieldnames = [name.strip() if name else name for name in reader.fieldnames]
        rows = list(reader)
        
        if not rows:
            print(f"  ⚠ 文件为空: {csv_file.name}")
            return 0
        
        # 获取列名（已经被清理过）
        columns = list(rows[0].keys())
        placeholders = ','.join(['?' for _ in columns])
        column_names = ','.join([f'"{col}"' for col in columns])
        
        # 批量插入
        insert_sql = f'INSERT OR REPLACE INTO {table_name} ({column_names}) VALUES ({placeholders})'
        
        data = []
        for row in rows:
            values = []
            for col in columns:
                val = row[col].strip() if row[col] else None
                # 转换空字符串为 NULL
                if val == '':
                    val = None
                values.append(val)
            data.append(tuple(values))
        
        cursor.executemany(insert_sql, data)
        conn.commit()
        
        return len(data)

def main():
    print("=" * 60)
    print("JCR 数据库重建工具")
    print("=" * 60)
    
    # 检查 CSV 目录
    if not CSV_DIR.exists():
        print(f"❌ CSV 目录不存在: {CSV_DIR}")
        return
    
    # 删除旧数据库（如果存在）
    if DB_PATH.exists():
        backup_path = DB_PATH.with_suffix('.db.backup')
        print(f"\n备份旧数据库到: {backup_path}")
        import shutil
        shutil.copy2(DB_PATH, backup_path)
        DB_PATH.unlink()
    
    # 创建新数据库
    print(f"\n创建新数据库: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    
    # 创建表结构
    create_tables(conn)
    
    # 导入数据
    print("\n" + "=" * 60)
    print("导入 CSV 数据")
    print("=" * 60)
    
    total_records = 0
    
    # JCR 数据
    print("\n📊 JCR 影响因子数据:")
    for year in [2020, 2021, 2022, 2023, 2024]:
        csv_file = CSV_DIR / f"JCR{year}-UTF8.csv"
        count = import_csv_to_table(conn, csv_file, f"JCR{year}")
        print(f"  ✓ JCR{year}: {count:,} 条记录")
        total_records += count
    
    # 中科院分区数据
    print("\n🏆 中科院分区数据:")
    for year in [2021, 2022, 2023, 2025]:
        csv_file = CSV_DIR / f"FQBJCR{year}-UTF8.csv"
        count = import_csv_to_table(conn, csv_file, f"FQBJCR{year}")
        print(f"  ✓ FQBJCR{year}: {count:,} 条记录")
        total_records += count
    
    # CCF 数据
    print("\n💻 CCF 计算机领域分类:")
    mappings = [
        ("CCF2019-UTF8.csv", "CCF2019"),
        ("CCF2022-UTF8.csv", "CCF2022"),
        ("CCFChinese2019-UTF8.csv", "CCFChinese2019"),
        ("CCFT2022-UTF8.csv", "CCFT2022"),
    ]
    for csv_name, table_name in mappings:
        csv_file = CSV_DIR / csv_name
        count = import_csv_to_table(conn, csv_file, table_name)
        print(f"  ✓ {table_name}: {count:,} 条记录")
        total_records += count
    
    # 预警名单数据
    print("\n⚠️  国际期刊预警名单:")
    for year in [2020, 2021, 2023, 2024, 2025]:
        csv_file = CSV_DIR / f"GJQKYJMD{year}.csv"
        count = import_csv_to_table(conn, csv_file, f"GJQKYJMD{year}")
        print(f"  ✓ GJQKYJMD{year}: {count:,} 条记录")
        total_records += count
    
    # 创建索引
    print("\n" + "=" * 60)
    create_indexes(conn)
    
    # 统计信息
    print("\n" + "=" * 60)
    print("数据库统计")
    print("=" * 60)
    
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = cursor.fetchall()
    
    print(f"\n总表数: {len(tables)}")
    print(f"总记录数: {total_records:,}")
    
    # 数据库大小
    db_size = DB_PATH.stat().st_size
    print(f"数据库大小: {db_size / (1024 * 1024):.2f} MB")
    
    # 关闭连接
    conn.close()
    
    print("\n" + "=" * 60)
    print("✅ 数据库重建完成！")
    print("=" * 60)
    print(f"\n数据库位置: {DB_PATH}")
    print("\n现在可以使用新的数据库了！")

if __name__ == "__main__":
    main()

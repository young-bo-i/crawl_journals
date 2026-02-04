import { queryOne, RowDataPacket } from "@/server/db/mysql";

type OpenAlexKeysConfig = {
  keys: string[];
};

/**
 * OpenAlex API Key 管理器
 * 负责密钥的轮换和故障切换
 */
class OpenAlexKeyManager {
  private keys: string[] = [];
  private currentIndex: number = 0;
  private lastLoadTime: number = 0;
  private readonly CACHE_TTL = 60_000; // 缓存 1 分钟

  /**
   * 从数据库加载 API Keys
   */
  private async loadKeys(): Promise<void> {
    const now = Date.now();
    if (now - this.lastLoadTime < this.CACHE_TTL) {
      return;
    }

    try {
      const row = await queryOne<RowDataPacket>(
        "SELECT value FROM system_config WHERE `key` = 'openalex_api_keys'"
      );

      if (row?.value) {
        const config: OpenAlexKeysConfig = JSON.parse(row.value);
        this.keys = config.keys ?? [];
      } else {
        this.keys = [];
      }

      this.lastLoadTime = now;
      console.log(`[OpenAlexKeyManager] 加载了 ${this.keys.length} 个 API Keys`);
    } catch (err) {
      console.error(`[OpenAlexKeyManager] 加载 API Keys 失败:`, err);
      this.keys = [];
    }
  }

  async getCurrentKey(): Promise<string | null> {
    await this.loadKeys();
    if (this.keys.length === 0) {
      return null;
    }
    return this.keys[this.currentIndex];
  }

  async switchToNextKey(): Promise<boolean> {
    await this.loadKeys();
    if (this.keys.length <= 1) {
      console.log(`[OpenAlexKeyManager] 无法切换密钥，只有 ${this.keys.length} 个密钥`);
      return false;
    }
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    console.log(`[OpenAlexKeyManager] 切换到密钥 #${this.currentIndex + 1}/${this.keys.length}`);
    return true;
  }

  reset(): void {
    this.currentIndex = 0;
  }

  async getKeyCount(): Promise<number> {
    await this.loadKeys();
    return this.keys.length;
  }

  forceReload(): void {
    this.lastLoadTime = 0;
  }
}

const globalForKeyManager = globalThis as unknown as { openAlexKeyManager?: OpenAlexKeyManager };

export function getOpenAlexKeyManager(): OpenAlexKeyManager {
  if (!globalForKeyManager.openAlexKeyManager) {
    globalForKeyManager.openAlexKeyManager = new OpenAlexKeyManager();
  }
  return globalForKeyManager.openAlexKeyManager;
}

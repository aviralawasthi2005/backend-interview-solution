export class SyncService {
  // ... existing code ...

  async getPendingSyncCount(): Promise<number> {
    const sql = 'SELECT COUNT(*) as count FROM sync_queue WHERE retry_count < 3';
    const result = await this.db.get<CountResult>(sql);
    return result?.count || 0;
  }

  async getFailedSyncCount(): Promise<number> {
    const sql = 'SELECT COUNT(*) as count FROM sync_queue WHERE retry_count >= 3';
    const result = await this.db.get<CountResult>(sql);
    return result?.count || 0;
  }

  async getLastSyncTime(): Promise<string | null> {
    const sql = `
      SELECT last_synced_at FROM tasks 
      WHERE last_synced_at IS NOT NULL 
      ORDER BY last_synced_at DESC 
      LIMIT 1
    `;
    const result = await this.db.get<LastSyncResult>(sql);
    return result?.last_synced_at || null;
  }
}
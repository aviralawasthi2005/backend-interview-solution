export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  sync_status: 'pending' | 'synced' | 'error';
  server_id: string | null;
  last_synced_at: string | null;
}

// Add other types you might need
export interface SyncQueueItem {
  id: string;
  task_id: string;
  operation: 'create' | 'update' | 'delete';
  data: string;
  created_at: string;
  retry_count: number;
  error_message: string | null;
}
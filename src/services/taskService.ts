import { v4 as uuidv4 } from 'uuid';
import { Database } from '../db/database';
import { Task } from '../types';
import { SyncService } from './syncService';

export class TaskService {
  private syncService: SyncService;

  constructor(private db: Database) {
    this.syncService = new SyncService(db); // Pass the database to SyncService
  }

  async createTask(taskData: Partial<Task>): Promise<Task> {
    const taskId = uuidv4();
    const now = new Date().toISOString();
    
    const task: Task = {
      id: taskId,
      title: taskData.title || '',
      description: taskData.description || '',
      completed: taskData.completed || false,
      created_at: now,
      updated_at: now,
      is_deleted: false,
      sync_status: 'pending',
      server_id: null,
      last_synced_at: null
    };

    // Insert into database
    const sql = `INSERT INTO tasks (id, title, description, completed, created_at, updated_at, is_deleted, sync_status, server_id, last_synced_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    await this.db.run(sql, [
      task.id,
      task.title,
      task.description,
      task.completed ? 1 : 0,
      task.created_at,
      task.updated_at,
      task.is_deleted ? 1 : 0,
      task.sync_status,
      task.server_id,
      task.last_synced_at
    ]);

    // Add to sync queue
    await this.syncService.addToSyncQueue(task.id, 'create', task);
    
    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    // Check if task exists
    const existingTask = await this.getTask(id);
    if (!existingTask) {
      return null;
    }

    const now = new Date().toISOString();
    
    // Update task in database
    const sql = `UPDATE tasks SET 
                 title = ?, description = ?, completed = ?, 
                 updated_at = ?, sync_status = ? 
                 WHERE id = ?`;
    
    await this.db.run(sql, [
      updates.title !== undefined ? updates.title : existingTask.title,
      updates.description !== undefined ? updates.description : existingTask.description,
      updates.completed !== undefined ? (updates.completed ? 1 : 0) : (existingTask.completed ? 1 : 0),
      now,
      'pending',
      id
    ]);

    // Get updated task to add to sync queue
    const updatedTask = await this.getTask(id);
    if (updatedTask) {
      await this.syncService.addToSyncQueue(id, 'update', updatedTask);
    }
    
    return updatedTask;
  }

  async deleteTask(id: string): Promise<boolean> {
    // Check if task exists
    const existingTask = await this.getTask(id);
    if (!existingTask) {
      return false;
    }

    const now = new Date().toISOString();
    
    // Soft delete task
    const sql = `UPDATE tasks SET 
                 is_deleted = ?, updated_at = ?, sync_status = ? 
                 WHERE id = ?`;
    
    await this.db.run(sql, [
      1, // is_deleted = true
      now,
      'pending',
      id
    ]);

    // Add to sync queue
    await this.syncService.addToSyncQueue(id, 'delete', existingTask);
    
    return true;
  }

  async getTask(id: string): Promise<Task | null> {
    const sql = 'SELECT * FROM tasks WHERE id = ? AND is_deleted = 0';
    const row: any = await this.db.get(sql, [id]);
    
    if (!row) return null;
    
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      completed: Boolean(row.completed),
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_deleted: Boolean(row.is_deleted),
      sync_status: row.sync_status,
      server_id: row.server_id,
      last_synced_at: row.last_synced_at
    };
  }

  async getAllTasks(): Promise<Task[]> {
    const sql = 'SELECT * FROM tasks WHERE is_deleted = 0';
    const rows: any[] = await this.db.all(sql);
    
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      completed: Boolean(row.completed),
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_deleted: Boolean(row.is_deleted),
      sync_status: row.sync_status,
      server_id: row.server_id,
      last_synced_at: row.last_synced_at
    }));
  }

  async getTasksNeedingSync(): Promise<Task[]> {
    const sql = 'SELECT * FROM tasks WHERE sync_status IN (?, ?) AND is_deleted = 0';
    const rows: any[] = await this.db.all(sql, ['pending', 'error']);
    
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      completed: Boolean(row.completed),
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_deleted: Boolean(row.is_deleted),
      sync_status: row.sync_status,
      server_id: row.server_id,
      last_synced_at: row.last_synced_at
    }));
  }
}
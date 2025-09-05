import { Router, Request, Response } from 'express';
import { SyncService } from '../services/syncService'; // Make sure this path is correct

// Define response types for better type safety
interface SyncResponse {
  success: boolean;
  synced_items?: number;
  failed_items?: number;
  message: string;
  details?: any;
}

interface SyncStatusResponse {
  status: string;
  connectivity: boolean;
  pending_syncs: number;
  failed_syncs: number;
  last_sync: string | null;
  timestamp: string;
}

interface BatchOperation {
  taskId: string;
  operation: 'create' | 'update' | 'delete';
  data: any;
}

interface BatchResponse {
  success: boolean;
  processed: number;
  successful: number;
  failed: number;
  results: Array<{
    taskId: string;
    status: 'queued' | 'error';
    error?: string;
  }>;
}

export function createSyncRouter(syncService: SyncService): Router {
  const router = Router();

  // Add middleware for common functionality
  router.use((req, res, next) => {
    console.log(`Sync API called: ${req.method} ${req.path}`);
    next();
  });

  // Trigger manual sync
  router.post('/sync', async (_req: Request, res: Response<SyncResponse>) => {
    try {
      const result = await syncService.sync();
      
      return res.json({
        success: result.success,
        synced_items: result.synced_items,
        failed_items: result.failed_items,
        message: result.success ? 'Sync completed successfully' : 'Sync completed with errors',
        details: result.details
      });
    } catch (error) {
      console.error('Sync failed:', error);
      
      return res.status(500).json({ 
        success: false,
        message: 'Failed to execute sync',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Check sync status
  router.get('/status', async (_req: Request, res: Response<SyncStatusResponse>) => {
    try {
      const [isConnected, pendingCount, failedCount, lastSyncAt] = await Promise.all([
        syncService.checkConnectivity(),
        syncService.getPendingSyncCount(),
        syncService.getFailedSyncCount(),
        syncService.getLastSyncTime()
      ]);

      return res.json({
        status: 'ok',
        connectivity: isConnected,
        pending_syncs: pendingCount,
        failed_syncs: failedCount,
        last_sync: lastSyncAt,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to get sync status:', error);
      
      // Return partial status with error indication
      return res.status(200).json({
        status: 'error',
        connectivity: false,
        pending_syncs: 0,
        failed_syncs: 0,
        last_sync: null,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Batch sync endpoint (for server-side)
  router.post('/batch', async (req: Request<{}, BatchResponse, { operations: BatchOperation[] }>, res: Response<BatchResponse>) => {
    try {
      const { operations } = req.body;
      
      if (!Array.isArray(operations)) {
        return res.status(400).json({ 
          success: false,
          processed: 0,
          successful: 0,
          failed: 0,
          results: []
        });
      }

      if (operations.length === 0) {
        return res.json({
          success: true,
          processed: 0,
          successful: 0,
          failed: 0,
          results: []
        });
      }

      // Process batch operations in parallel for better performance
      const results = await Promise.allSettled(
        operations.map(async (op) => {
          try {
            await syncService.addToSyncQueue(op.taskId, op.operation, op.data);
            return { taskId: op.taskId, status: 'queued' as const };
          } catch (error) {
            throw { 
              taskId: op.taskId, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            };
          }
        })
      );

      // Process results
      const successfulResults = [];
      const failedResults = [];

      for (const result of results) {
        if (result.status === 'fulfilled') {
          successfulResults.push(result.value);
        } else {
          failedResults.push({
            taskId: result.reason.taskId,
            status: 'error' as const,
            error: result.reason.error
          });
        }
      }

      return res.json({
        success: failedResults.length === 0,
        processed: operations.length,
        successful: successfulResults.length,
        failed: failedResults.length,
        results: [...successfulResults, ...failedResults]
      });
    } catch (error) {
      console.error('Batch sync failed:', error);
      
      return res.status(500).json({ 
        success: false,
        processed: 0,
        successful: 0,
        failed: 0,
        results: []
      });
    }
  });

  // Get detailed sync queue information
  router.get('/queue', async (req: Request, res: Response) => {
    try {
      const { limit = 50, offset = 0, status } = req.query;
      
      // You'll need to implement this method in SyncService
      const queueItems = await syncService.getSyncQueue({
        limit: Number(limit),
        offset: Number(offset),
        status: status as string
      });

      return res.json({
        items: queueItems,
        total: queueItems.length,
        limit: Number(limit),
        offset: Number(offset)
      });
    } catch (error) {
      console.error('Failed to get sync queue:', error);
      
      return res.status(500).json({ 
        error: 'Failed to retrieve sync queue',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Retry failed sync operations
  router.post('/retry', async (req: Request, res: Response) => {
    try {
      const { ids, all } = req.body;
      
      let result;
      if (all) {
        result = await syncService.retryAllFailed();
      } else if (Array.isArray(ids)) {
        result = await syncService.retryFailed(ids);
      } else {
        return res.status(400).json({ 
          error: 'Either provide an array of ids or set all=true' 
        });
      }

      return res.json({
        success: true,
        retried: result.retried,
        failed: result.failed,
        message: `Retried ${result.retried} items, ${result.failed} failed`
      });
    } catch (error) {
      console.error('Retry failed:', error);
      
      return res.status(500).json({ 
        error: 'Failed to retry sync operations',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Health check endpoint
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const isConnected = await syncService.checkConnectivity();
      const [pendingCount, failedCount] = await Promise.all([
        syncService.getPendingSyncCount(),
        syncService.getFailedSyncCount()
      ]);

      return res.json({ 
        status: 'ok', 
        connectivity: isConnected,
        pending_syncs: pendingCount,
        failed_syncs: failedCount,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    } catch (error) {
      console.error('Health check failed:', error);
      
      return res.status(500).json({ 
        status: 'error',
        connectivity: false,
        pending_syncs: 0,
        failed_syncs: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    }
  });

  // Error handling middleware
  router.use((error: Error, _req: Request, res: Response, _next: Function) => {
    console.error('Unhandled error in sync router:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  });

  return router;
}
import { Router, Request, Response } from 'express';
import { TaskService } from '../services/taskService';

export function createTaskRouter(taskService: TaskService): Router {
  const router = Router();
  
  // Get all tasks
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const tasks = await taskService.getAllTasks();
      return res.json(tasks);
    } catch {
      return res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  // Get single task
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const task = await taskService.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      return res.json(task);
    } catch {
      return res.status(500).json({ error: 'Failed to fetch task' });
    }
  });

  // Create task
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { title, description, completed } = req.body;
      
      // Validate required fields
      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      const taskData = {
        title,
        description: description || '',
        completed: completed || false
      };

      const task = await taskService.createTask(taskData);
      return res.status(201).json(task);
    } catch {
      return res.status(500).json({ error: 'Failed to create task' });
    }
  });

  // Update task
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { title, description, completed } = req.body;
      const taskId = req.params.id;

      const updates: Partial<{ title: string; description: string; completed: boolean }> = {};
      
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (completed !== undefined) updates.completed = completed;

      const updatedTask = await taskService.updateTask(taskId, updates);
      
      if (!updatedTask) {
        return res.status(404).json({ error: 'Task not found' });
      }

      return res.json(updatedTask);
    } catch {
      return res.status(500).json({ error: 'Failed to update task' });
    }
  });

  // Delete task
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const taskId = req.params.id;
      const deleted = await taskService.deleteTask(taskId);
      
      if (!deleted) {
        return res.status(404).json({ error: 'Task not found' });
      }

      return res.status(204).send();
    } catch {
      return res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  return router;
}
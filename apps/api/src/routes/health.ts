import { Router } from 'express';
import { checkHealth } from '../services/health-service.js';

export const healthRouter = Router();

// public: ไม่ต้อง login (ใช้ตรวจสถานะระบบ)
healthRouter.get('/health', async (_req, res) => {
  const health = await checkHealth();
  res.json(health);
});

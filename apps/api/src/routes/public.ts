import { Router } from 'express';
import { getPublicStats } from '../services/public-stats-service.js';

export const publicRouter = Router();

// public: ไม่ต้อง login — ตัวเลขสรุปสำหรับหน้า landing (จำนวนรวมเท่านั้น)
// ให้ cache ได้ 5 นาทีเพื่อลดการ query ซ้ำจากผู้เข้าชมที่ไม่ได้ login
publicRouter.get('/public/stats', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(await getPublicStats());
});

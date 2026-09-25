import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth } from '../middlewares/auth.js';
import { completeUpload, getDownloadUrl, requestUpload } from '../services/files-service.js';
import { parseIdParam, requiredText } from './validation.js';

// ไฟล์: ต้อง login เท่านั้น สิทธิ์ตามวัตถุประสงค์ของไฟล์ตรวจใน files-service
export const filesRouter = Router();

const idOf = (value: unknown) => parseIdParam(value, 'FILE_NOT_FOUND', 'ไม่พบไฟล์');

const uploadSchema = z
  .object({
    purpose: z.enum(['advisor_consent', 'club_logo', 'achievement_evidence']),
    fileName: requiredText(500),
    mimeType: z.string().min(1).max(100),
    sizeBytes: z.number().int().positive(),
  })
  .strict();

filesRouter.post('/files/uploads', requireAuth, async (req, res) => {
  res.status(201).json(await requestUpload(getRequiredAuth(req), uploadSchema.parse(req.body)));
});

filesRouter.post('/files/:id/complete', requireAuth, async (req, res) => {
  const file = await completeUpload(getRequiredAuth(req), idOf(req.params.id));
  res.json({ id: file.id, originalName: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, status: file.status });
});

filesRouter.get('/files/:id/download-url', requireAuth, async (req, res) => {
  res.json(await getDownloadUrl(getRequiredAuth(req), idOf(req.params.id)));
});

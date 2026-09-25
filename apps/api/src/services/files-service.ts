import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db/pool.js';
import { AppError } from '../errors.js';
import { logger } from '../logger.js';
import {
  findFile,
  insertFile,
  lockFile,
  markFileUploaded,
  type FilePurpose,
  type FileRecord,
} from '../repositories/files-repository.js';
import { storage } from '../storage/s3-storage.js';
import { hasPermission, type AuthContext } from './authorization.js';
import { PERMISSIONS, type PermissionCode } from './permissions.js';

const UPLOAD_URL_TTL_SECONDS = 10 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
const MAX_FILE_NAME_LENGTH = 200;

interface FilePolicy {
  // permission ที่ต้องมีเพื่อขออัปโหลด
  uploadPermission: PermissionCode;
  mimeTypes: readonly string[];
  maxBytes: number;
  keyPrefix: string;
}

// ชนิดไฟล์ (allowlist) และขนาดสูงสุดตามวัตถุประสงค์ — ตรวจก่อนออก URL ทุกครั้ง
export const FILE_POLICIES: Record<FilePurpose, FilePolicy> = {
  advisor_consent: {
    uploadPermission: PERMISSIONS.CLUB_APPLICATION_CREATE,
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maxBytes: 10 * 1024 * 1024,
    keyPrefix: 'advisor-consents',
  },
};

/**
 * ตัวตรวจสิทธิ์อ่านไฟล์ตามวัตถุประสงค์ (นอกเหนือจากผู้อัปโหลดเอง)
 * ส่วนที่ใช้ไฟล์ (เช่น คำขอจัดตั้งชมรม) ลงทะเบียนตัวตรวจของตัวเอง เพื่อไม่ให้ service นี้ต้องรู้จักทุกโมดูล
 */
type ReadAccessResolver = (auth: AuthContext, file: FileRecord) => Promise<boolean>;
const readResolvers = new Map<FilePurpose, ReadAccessResolver>();

export function registerFileReadAccess(purpose: FilePurpose, resolver: ReadAccessResolver): void {
  readResolvers.set(purpose, resolver);
}

async function canReadFile(auth: AuthContext, file: FileRecord): Promise<boolean> {
  if (file.uploadedBy === auth.user.id) return true;
  const resolver = readResolvers.get(file.purpose);
  return resolver ? resolver(auth, file) : false;
}

function notFound(): AppError {
  return new AppError(404, 'FILE_NOT_FOUND', 'ไม่พบไฟล์');
}

export interface UploadRequest {
  purpose: FilePurpose;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadTicket {
  fileId: string;
  uploadUrl: string;
  // header ที่ browser ต้องส่งตอน PUT (ถูกเซ็นไว้ใน URL)
  headers: Record<string, string>;
  expiresAt: Date;
}

/**
 * ขอ URL อัปโหลด: ตรวจสิทธิ์ + ชนิด/ขนาดไฟล์ → บันทึกแถว pending → เซ็น URL อายุ 10 นาที
 * ชนิดและขนาดถูกเซ็นไว้ใน URL จึงอัปโหลดไฟล์ที่ต่างจากที่ขอไว้ไม่ได้
 */
export async function requestUpload(auth: AuthContext, input: UploadRequest): Promise<UploadTicket> {
  const policy = FILE_POLICIES[input.purpose];
  if (!hasPermission(auth, policy.uploadPermission)) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์อัปโหลดไฟล์ประเภทนี้');
  }
  if (!policy.mimeTypes.includes(input.mimeType)) {
    throw new AppError(422, 'FILE_TYPE_NOT_ALLOWED', 'ชนิดไฟล์ไม่รองรับ (รองรับ PDF, JPG, PNG)');
  }
  if (input.sizeBytes > policy.maxBytes) {
    throw new AppError(422, 'FILE_TOO_LARGE', `ไฟล์ใหญ่เกิน ${policy.maxBytes / 1024 / 1024} MB`);
  }
  const originalName = input.fileName.trim().slice(0, MAX_FILE_NAME_LENGTH);

  const file = await insertFile({
    bucket: storage.bucket,
    objectKey: `${policy.keyPrefix}/${randomUUID()}`,
    originalName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    purpose: input.purpose,
    uploadedBy: auth.user.id,
  });
  const uploadUrl = await storage.createUploadUrl(file.objectKey, file.mimeType, file.sizeBytes, UPLOAD_URL_TTL_SECONDS);
  return {
    fileId: file.id,
    uploadUrl,
    headers: { 'Content-Type': file.mimeType },
    expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000),
  };
}

/**
 * ยืนยันว่าอัปโหลดเสร็จ: ตรวจกับ bucket จริงว่ามีไฟล์และขนาดตรงกับที่ขอไว้ แล้วเปลี่ยนเป็น uploaded
 * (ไม่เชื่อคำบอกของ client ว่าอัปโหลดแล้ว)
 */
export async function completeUpload(auth: AuthContext, fileId: string): Promise<FileRecord> {
  return withTransaction(async (client) => {
    const file = await lockFile(fileId, client);
    if (!file || file.uploadedBy !== auth.user.id) throw notFound();
    if (file.status === 'uploaded') return file;

    const stored = await storage.headObject(file.objectKey);
    if (!stored) {
      throw new AppError(409, 'FILE_NOT_UPLOADED', 'ยังไม่พบไฟล์ในที่เก็บ กรุณาอัปโหลดใหม่');
    }
    if (stored.sizeBytes !== file.sizeBytes) {
      // ป้องกันไว้อีกชั้น (ปกติ Garage ปฏิเสธตั้งแต่ตอนอัปโหลด เพราะขนาดถูกเซ็นไว้)
      await storage.deleteObject(file.objectKey);
      throw new AppError(422, 'FILE_SIZE_MISMATCH', 'ขนาดไฟล์ไม่ตรงกับที่ขออัปโหลด');
    }
    await markFileUploaded(file.id, client);
    return { ...file, status: 'uploaded', uploadedAt: new Date() };
  });
}

// URL ดาวน์โหลดอายุ 5 นาที หลังตรวจสิทธิ์ (ไม่มีสิทธิ์ → 404 ไม่บอกว่ามีไฟล์นี้อยู่)
export async function getDownloadUrl(auth: AuthContext, fileId: string): Promise<{ url: string; expiresAt: Date }> {
  const file = await findFile(fileId);
  if (!file || file.status !== 'uploaded' || !(await canReadFile(auth, file))) throw notFound();
  const url = await storage.createDownloadUrl(file.objectKey, file.originalName, DOWNLOAD_URL_TTL_SECONDS);
  logger.info({ fileId: file.id, userId: auth.user.id }, 'ออก URL ดาวน์โหลดไฟล์');
  return { url, expiresAt: new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000) };
}

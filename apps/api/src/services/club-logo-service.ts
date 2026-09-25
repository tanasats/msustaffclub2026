import { withTransaction } from '../db/pool.js';
import { AppError } from '../errors.js';
import {
  findApplicationBase,
  findApplicationLogoFileId,
  replaceApplicationLogo,
} from '../repositories/club-applications-repository.js';
import { findClubLogoFileId, replaceClubLogo } from '../repositories/clubs-repository.js';
import type { AuthContext } from './authorization.js';
import { assertCanView, lockForEdit, notFound as applicationNotFound } from './club-application-service.js';
import { hasClubPermission } from './club-authorization.js';
import { CLUB_PERMISSIONS } from './club-permissions.js';
import { assertAttachableFile, createFileViewUrl, discardFileIfUnused } from './files-service.js';

function logoNotFound(): AppError {
  return new AppError(404, 'LOGO_NOT_FOUND', 'ไม่พบตราสัญลักษณ์');
}

// ไฟล์เดิมที่ถูกแทนที่: ลบทิ้งถ้าไม่มีคำขอ/ชมรมใดใช้แล้ว (ทำหลัง commit)
async function cleanupPrevious(previousFileId: string | null, newFileId: string | null): Promise<void> {
  if (previousFileId && previousFileId !== newFileId) {
    await discardFileIfUnused(previousFileId);
  }
}

// ---------- ตราในคำขอจัดตั้ง ----------

// ผู้ยื่นแนบ/เปลี่ยน/ลบตราได้ขณะคำขอแก้ไขได้ (ร่าง/ส่งกลับแก้ไข) — fileId = null คือเอาตราออก
export async function setApplicationLogo(auth: AuthContext, applicationId: string, fileId: string | null): Promise<void> {
  const { previousFileId } = await withTransaction(async (client) => {
    await lockForEdit(client, auth, applicationId);
    if (fileId) await assertAttachableFile(auth, fileId, 'club_logo', client);
    return replaceApplicationLogo(applicationId, fileId, client);
  });
  await cleanupPrevious(previousFileId, fileId);
}

// URL รูปตราในคำขอ: ผู้ที่ดูคำขอนี้ได้เท่านั้น
export async function getApplicationLogoUrl(auth: AuthContext, applicationId: string): Promise<string> {
  const base = await findApplicationBase(applicationId);
  if (!base) throw applicationNotFound();
  await assertCanView(auth, base);
  const logo = await findApplicationLogoFileId(applicationId);
  const url = logo?.logoFileId ? await createFileViewUrl(logo.logoFileId) : null;
  if (!url) throw logoNotFound();
  return url;
}

// ---------- ตราของชมรม ----------

// ผู้มีสิทธิ์ชมรม club_profile:edit แนบ/เปลี่ยน/ลบตราได้ (ชมรมที่ไม่ active เหลือสิทธิ์อ่านอย่างเดียว จึงแก้ไม่ได้)
export async function setClubLogo(auth: AuthContext, clubId: string, fileId: string | null): Promise<void> {
  if (!(await hasClubPermission(auth, clubId, CLUB_PERMISSIONS.PROFILE_EDIT))) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์แก้ไขข้อมูลของชมรมนี้');
  }
  const result = await withTransaction(async (client) => {
    if (fileId) await assertAttachableFile(auth, fileId, 'club_logo', client);
    return replaceClubLogo(clubId, fileId, client);
  });
  if (!result) throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
  await cleanupPrevious(result.previousFileId, fileId);
}

// URL รูปตราของชมรม: ทุกคนที่ login ดูได้ (เป็นข้อมูลสาธารณะของชมรม)
export async function getClubLogoUrl(clubId: string): Promise<string> {
  const club = await findClubLogoFileId(clubId);
  if (!club) throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
  const url = club.logoFileId ? await createFileViewUrl(club.logoFileId) : null;
  if (!url) throw logoNotFound();
  return url;
}

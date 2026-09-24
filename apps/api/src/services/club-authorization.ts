import { findClubAccess } from '../repositories/club-access-repository.js';
import { hasPermission, type AuthContext } from './authorization.js';
import {
  ALL_CLUB_PERMISSIONS,
  READ_ONLY_CLUB_PERMISSIONS,
  type ClubPermissionCode,
} from './club-permissions.js';
import { PERMISSIONS } from './permissions.js';

/**
 * สิทธิ์ระดับชมรมของผู้ใช้ในชมรมหนึ่ง (อ่านจากฐานข้อมูลใหม่ทุกครั้ง)
 * คืน null ถ้าไม่พบชมรม
 * - club:manage_all (รวม super_admin ผ่าน hasPermission) → ได้ทุกสิทธิ์ชมรม
 * - club:read_all → ได้ club:view_internal เพิ่ม
 * - ชมรมที่ไม่ active → ตัดเหลือเฉพาะสิทธิ์อ่าน (ยกเว้นผู้มี club:manage_all)
 * ข้อยกเว้นทั้งหมดอยู่ที่ฟังก์ชันนี้ที่เดียว
 */
export async function getClubPermissions(auth: AuthContext, clubId: string): Promise<ClubPermissionCode[] | null> {
  const access = await findClubAccess(clubId, auth.user.id);
  if (!access) {
    return null;
  }
  if (hasPermission(auth, PERMISSIONS.CLUB_MANAGE_ALL)) {
    return [...ALL_CLUB_PERMISSIONS];
  }

  const granted = new Set(access.permissions.filter((code): code is ClubPermissionCode =>
    (ALL_CLUB_PERMISSIONS as readonly string[]).includes(code),
  ));
  if (hasPermission(auth, PERMISSIONS.CLUB_READ_ALL)) {
    for (const code of READ_ONLY_CLUB_PERMISSIONS) granted.add(code);
  }
  if (access.clubStatus !== 'active') {
    for (const code of granted) {
      if (!READ_ONLY_CLUB_PERMISSIONS.includes(code)) granted.delete(code);
    }
  }
  return ALL_CLUB_PERMISSIONS.filter((code) => granted.has(code));
}

export async function hasClubPermission(
  auth: AuthContext,
  clubId: string,
  permission: ClubPermissionCode,
): Promise<boolean> {
  const permissions = await getClubPermissions(auth, clubId);
  return permissions?.includes(permission) ?? false;
}

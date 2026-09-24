import type { PermissionCode } from './permissions.js';
import { SYSTEM_ROLES } from './permissions.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
}

export interface AuthContext {
  sessionId: string;
  user: AuthUser;
  roles: string[];
  // union ของ permission จากทุก role ที่ถืออยู่
  permissions: string[];
}

/**
 * ตรวจสิทธิ์ที่เดียวของทั้งระบบ
 * super_admin ผ่านทุก permission (ข้อยกเว้นนี้มีที่นี่ที่เดียว ห้ามเขียนซ้ำที่อื่น)
 */
export function hasPermission(auth: AuthContext, permission: PermissionCode): boolean {
  if (auth.roles.includes(SYSTEM_ROLES.SUPER_ADMIN)) {
    return true;
  }
  return auth.permissions.includes(permission);
}

// permission ทั้งหมดของระบบประกาศที่นี่ที่เดียว (รูปแบบ resource:action)
// ทุกค่าต้องลงทะเบียนในตาราง permissions ผ่าน migration ด้วย (มี test ตรวจว่าตรงกัน)
export const PERMISSIONS = {
  USER_ROLE_ASSIGN: 'user_role:assign',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// role ระบบที่มีทุกระบบ (is_system = true) ใช้ตอนให้ role อัตโนมัติเท่านั้น
// ห้ามใช้เช็คสิทธิ์ตรง ๆ ให้ใช้ hasPermission / requirePermission แทน
export const SYSTEM_ROLES = {
  USER: 'user',
  SUPER_ADMIN: 'super_admin',
  STUDENT: 'student',
  STAFF: 'staff',
} as const;

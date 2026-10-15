// หน้า "สิทธิ์ในระบบ" (GET /admin/permissions)
export interface PermissionOverviewItem {
  code: string;
  descriptionTh: string;
  roles: { code: string; nameTh: string; isPrivileged: boolean }[];
  holderCount: number;
}

export interface RoleOverviewItem {
  id: string;
  code: string;
  nameTh: string;
  description: string | null;
  isSystem: boolean;
  isPrivileged: boolean;
  permissions: string[];
  activeHolderCount: number;
}

export interface PermissionOverview {
  permissions: PermissionOverviewItem[];
  roles: RoleOverviewItem[];
  clubPermissions: { code: string; descriptionTh: string }[];
  clubPositions: { code: string; nameTh: string; kind: string; permissions: string[] }[];
  superAdminCount: number;
}

export interface PermissionHolders {
  code: string;
  holders: { id: string; name: string | null; email: string; orgUnitName: string | null; roles: string[] }[];
  superAdminCount: number;
  limit: number;
}

export interface PermissionChangeLogPage {
  items: {
    id: string;
    action: 'role_grant' | 'role_revoke' | 'position_grant' | 'position_revoke' | 'role_create' | 'role_update';
    actorName: string | null;
    roleCode: string | null;
    roleNameTh: string | null;
    permissionCode: string | null;
    positionNameTh: string | null;
    clubPermissionCode: string | null;
    reason: string;
    createdAt: string;
  }[];
  total: number;
}

export const PERMISSION_LOG_ACTION_LABELS: Record<PermissionChangeLogPage['items'][number]['action'], string> = {
  role_grant: 'ผูกสิทธิ์ให้ role',
  role_revoke: 'ถอนสิทธิ์จาก role',
  position_grant: 'ผูกสิทธิ์ให้ตำแหน่งในชมรม',
  position_revoke: 'ถอนสิทธิ์จากตำแหน่งในชมรม',
  role_create: 'สร้าง role',
  role_update: 'แก้ไข role',
};

// role ที่ระบบให้อัตโนมัติตามประเภทบัญชี (การผูกสิทธิ์มีผลกับผู้ใช้จำนวนมาก)
export const AUTO_ASSIGNED_ROLE_CODES = ['user', 'staff', 'student'];

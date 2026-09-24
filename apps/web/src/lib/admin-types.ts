// รูปแบบข้อมูลจาก API /admin/* (ต้องตรงกับ apps/api/src/routes/admin-roles.ts)

export interface AdminRole {
  id: string;
  code: string;
  nameTh: string;
  description: string | null;
  isSystem: boolean;
  isPrivileged: boolean;
  permissions: string[];
  activeHolderCount: number;
  grantable: boolean;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: string[];
}

export interface AdminUserPage {
  items: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUserOverview {
  user: { id: string; email: string; name: string | null; isActive: boolean; orgUnitName: string | null };
  roles: {
    code: string;
    nameTh: string;
    isSystem: boolean;
    isPrivileged: boolean;
    grantedAt: string;
    grantedByName: string | null;
  }[];
  history: {
    id: string;
    action: 'grant' | 'revoke';
    roleCode: string;
    roleNameTh: string;
    reason: string;
    actorName: string | null;
    createdAt: string;
  }[];
}

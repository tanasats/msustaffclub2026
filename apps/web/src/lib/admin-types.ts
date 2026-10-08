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
  // false = เพิ่มล่วงหน้าโดยผู้ดูแล เจ้าตัวยังไม่เคยเข้าระบบ
  hasLoggedIn: boolean;
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

// GET /user-accounts/:userId — ผลที่จะเกิดถ้าปิดบัญชี และประวัติการปิด/เปิดบัญชี
export interface AccountOverview {
  effects: {
    memberships: { id: string; clubId: string; clubName: string; status: 'pending' | 'active' | 'invited' }[];
    committee: { id: string; clubId: string; clubName: string; positionTitle: string; isPresident: boolean }[];
    advisorships: { id: string; clubId: string; clubName: string }[];
  };
  history: { action: AccountEventAction; reason: string; effects: Record<string, number>; actorName: string | null; createdAt: string }[];
}

export type AccountEventAction = 'deactivated' | 'reactivated' | 'created' | 'updated' | 'linked';

export const ACCOUNT_EVENT_LABELS: Record<AccountEventAction, string> = {
  deactivated: 'ปิดบัญชี',
  reactivated: 'เปิดบัญชีคืน',
  created: 'เพิ่มผู้ใช้ล่วงหน้า',
  updated: 'แก้ไขข้อมูลบุคลากร',
  linked: 'ผูกบัญชี Google (เข้าระบบครั้งแรก)',
};

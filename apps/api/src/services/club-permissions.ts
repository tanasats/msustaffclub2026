// สิทธิ์ระดับชมรมทั้งหมดประกาศที่นี่ที่เดียว (ต้องตรงกับตาราง club_permissions ที่ seed ใน migration)
// ได้มาจาก "ตำแหน่งในชมรมนั้น" ผ่านตาราง club_position_permissions ห้ามเช็คชื่อตำแหน่งในโค้ดตรง ๆ
export const CLUB_PERMISSIONS = {
  VIEW_INTERNAL: 'club:view_internal',
  PROFILE_EDIT: 'club_profile:edit',
  MEMBER_APPROVE: 'club_member:approve',
  COMMITTEE_MANAGE: 'club_committee:manage',
  ACTIVITY_MANAGE: 'club_activity:manage',
  ACHIEVEMENT_MANAGE: 'club_achievement:manage',
  REPORT_SUBMIT: 'club_report:submit',
  FINANCE_MANAGE: 'club_finance:manage',
  REPORT_ACKNOWLEDGE: 'club_report:acknowledge',
} as const;

export type ClubPermissionCode = (typeof CLUB_PERMISSIONS)[keyof typeof CLUB_PERMISSIONS];

export const ALL_CLUB_PERMISSIONS: readonly ClubPermissionCode[] = Object.values(CLUB_PERMISSIONS);

// ชมรมที่ถูกระงับหรือยุบ เหลือสิทธิ์อ่านอย่างเดียว
export const READ_ONLY_CLUB_PERMISSIONS: readonly ClubPermissionCode[] = [CLUB_PERMISSIONS.VIEW_INTERNAL];

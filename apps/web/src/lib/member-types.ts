// รูปแบบข้อมูลจาก API รายชื่อ/ข้อมูลรายบุคคลของสมาชิก (ต้องตรงกับ apps/api/src/repositories/club-members-repository.ts)

export type MembershipStatus = 'pending' | 'active' | 'rejected' | 'ended' | 'withdrawn';

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  pending: 'รออนุมัติ',
  active: 'สมาชิก',
  rejected: 'ไม่อนุมัติ',
  ended: 'พ้นสภาพ',
  withdrawn: 'ยกเลิกใบสมัคร',
};

// เหตุพ้นสภาพ (ระเบียบข้อ 20) ต้องตรงกับ end_reason ใน club_memberships
export const MEMBERSHIP_END_REASON_LABELS: Record<string, string> = {
  resigned: 'ลาออก',
  left_university: 'ลาออกจากมหาวิทยาลัย',
  disciplinary: 'ต้องโทษวินัย',
  removed_by_resolution: 'มติที่ประชุมคณะกรรมการให้ออก',
  deceased: 'ถึงแก่กรรม',
  club_dissolved: 'ชมรมถูกยุบ',
};

export const MEMBERSHIP_ACTION_LABELS: Record<string, string> = {
  applied: 'สมัครเป็นสมาชิก',
  withdrawn: 'ยกเลิกใบสมัคร',
  approved: 'อนุมัติเป็นสมาชิก',
  rejected: 'ไม่อนุมัติใบสมัคร',
  left: 'ลาออก',
  removed: 'ให้พ้นสภาพ',
};

export interface MemberListItem {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  orgUnitName: string | null;
  status: MembershipStatus;
  joinedAt: string | null;
  endedOn: string | null;
  endReason: string | null;
  isCommittee: boolean;
  positionTitle: string | null;
}

export interface MemberProfile {
  person: {
    userId: string;
    name: string | null;
    email: string;
    orgUnitName: string | null;
    membershipId: string;
    status: MembershipStatus;
    appliedAt: string | null;
    joinedAt: string | null;
    endedOn: string | null;
    endReason: string | null;
  };
  history: { action: string; note: string | null; actorName: string | null; createdAt: string }[];
  positions: { positionTitle: string; startedOn: string; endedOn: string | null }[];
  achievements: { id: string; title: string; achievedOn: string; level: string; category: string; award: string | null; status: string }[];
  activities: { total: number; items: { id: string; title: string; heldOn: string }[] };
  competitionResults: { competitionId: string; title: string; sportName: string; heldFrom: string; rank: number | null; medal: string | null }[];
}

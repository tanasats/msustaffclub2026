// ชื่อไทยของเหตุพ้นตำแหน่งกรรมการ (ระเบียบข้อ 12) ต้องตรงกับ end_reason ใน club_committee_members

// เหตุที่ผู้จัดการกรรมการเลือกได้ ต้องตรงกับ COMMITTEE_END_REASONS ของ API
export const COMMITTEE_END_REASONS = [
  { value: 'term_ended', label: 'ครบวาระ' },
  { value: 'removed_by_resolution', label: 'มติที่ประชุมให้ออก / ถูกถอดถอน' },
  { value: 'disciplinary', label: 'ต้องโทษวินัย' },
  { value: 'left_university', label: 'ลาออกจากมหาวิทยาลัย' },
  { value: 'deceased', label: 'ถึงแก่กรรม' },
] as const;

const ALL_LABELS: Record<string, string> = {
  ...Object.fromEntries(COMMITTEE_END_REASONS.map((r) => [r.value, r.label])),
  resigned_position: 'ลาออกจากตำแหน่ง',
  replaced: 'เปลี่ยนตำแหน่ง / โอนตำแหน่ง',
  club_dissolved: 'ชมรมถูกยุบ',
};

export function committeeEndReasonLabel(code: string): string {
  return ALL_LABELS[code] ?? code;
}

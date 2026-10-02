// เหตุการณ์ที่ส่งอีเมลแจ้งเตือน (ประกาศที่นี่ที่เดียว) — super_admin เปิด/ปิดแยกตามเหตุการณ์ได้
export const NOTIFICATION_EVENTS = {
  ADVISOR_NOMINATED: 'advisor_nominated',
  ADVISOR_RESPONDED: 'advisor_responded',
  PRESIDENT_NOMINATED: 'president_nominated',
  PRESIDENT_RESPONDED: 'president_responded',
  APPLICATION_RESULT: 'application_result',
  APPLICATION_QUEUE: 'application_queue',
  MONTHLY_REPORT_SUBMITTED: 'monthly_report_submitted',
  MEMBERSHIP_APPLIED: 'membership_applied',
  MEMBERSHIP_DECIDED: 'membership_decided',
  MEMBERSHIP_INVITED: 'membership_invited',
  RESIGNATION_REQUESTED: 'resignation_requested',
} as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS];

export const NOTIFICATION_EVENT_INFO: Record<NotificationEvent, { label: string; recipients: string }> = {
  advisor_nominated: { label: 'ถูกเสนอชื่อเป็นที่ปรึกษาชมรม', recipients: 'ที่ปรึกษาที่เป็นบุคลากร' },
  advisor_responded: { label: 'ที่ปรึกษายินยอม/ปฏิเสธ', recipients: 'ผู้ยื่นคำขอ' },
  president_nominated: { label: 'ถูกเสนอชื่อเป็นประธานชมรม', recipients: 'ผู้ถูกเสนอเป็นประธาน' },
  president_responded: { label: 'ผู้ถูกเสนอเป็นประธานตอบรับ/ปฏิเสธ', recipients: 'ผู้ยื่นคำขอ' },
  application_result: { label: 'คำขอถูกส่งกลับแก้ไข / อนุมัติ / ไม่อนุมัติ', recipients: 'ผู้ยื่นคำขอ' },
  application_queue: { label: 'มีคำขอรอตรวจ / รออนุมัติ', recipients: 'ผู้มีสิทธิ์ตรวจ หรืออนุมัติคำขอ' },
  monthly_report_submitted: { label: 'ชมรมส่งรายงานประจำเดือน', recipients: 'ที่ปรึกษาชมรม' },
  membership_applied: { label: 'มีผู้สมัครเป็นสมาชิกชมรม', recipients: 'กรรมการที่อนุมัติสมาชิกได้' },
  membership_decided: { label: 'ผลการพิจารณาใบสมัครสมาชิก', recipients: 'ผู้สมัคร' },
  membership_invited: { label: 'ได้รับคำเชิญเข้าชมรม', recipients: 'ผู้ถูกเชิญ' },
  resignation_requested: { label: 'สมาชิกยื่นลาออกจากชมรม', recipients: 'กรรมการที่อนุมัติสมาชิกได้' },
};

export const ALL_NOTIFICATION_EVENTS = Object.values(NOTIFICATION_EVENTS);

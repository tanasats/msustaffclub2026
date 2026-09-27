// เหตุการณ์ที่ส่งอีเมลแจ้งเตือน (ประกาศที่นี่ที่เดียว) — super_admin เปิด/ปิดแยกตามเหตุการณ์ได้
export const NOTIFICATION_EVENTS = {
  ADVISOR_NOMINATED: 'advisor_nominated',
  ADVISOR_RESPONDED: 'advisor_responded',
  APPLICATION_RESULT: 'application_result',
  APPLICATION_QUEUE: 'application_queue',
  MONTHLY_REPORT_SUBMITTED: 'monthly_report_submitted',
} as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS];

export const NOTIFICATION_EVENT_INFO: Record<NotificationEvent, { label: string; recipients: string }> = {
  advisor_nominated: { label: 'ถูกเสนอชื่อเป็นที่ปรึกษาชมรม', recipients: 'ที่ปรึกษาที่เป็นบุคลากร' },
  advisor_responded: { label: 'ที่ปรึกษายินยอม/ปฏิเสธ', recipients: 'ผู้ยื่นคำขอ' },
  application_result: { label: 'คำขอถูกส่งกลับแก้ไข / อนุมัติ / ไม่อนุมัติ', recipients: 'ผู้ยื่นคำขอ' },
  application_queue: { label: 'มีคำขอรอตรวจ / รออนุมัติ', recipients: 'ผู้มีสิทธิ์ตรวจ หรืออนุมัติคำขอ' },
  monthly_report_submitted: { label: 'ชมรมส่งรายงานประจำเดือน', recipients: 'ที่ปรึกษาชมรม' },
};

export const ALL_NOTIFICATION_EVENTS = Object.values(NOTIFICATION_EVENTS);

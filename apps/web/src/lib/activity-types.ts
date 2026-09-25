// รูปแบบข้อมูลจาก API แผนกิจกรรม/กิจกรรม (ต้องตรงกับ apps/api/src/services/activity-service.ts)

export interface PlannedActivity {
  id: string;
  clubId: string;
  fiscalYear: number;
  plannedDate: string | null;
  plannedTime: string | null;
  title: string;
  note: string | null;
  heldCount: number;
}

export interface ActivityItem {
  id: string;
  clubId: string;
  plannedActivityId: string | null;
  plannedTitle: string | null;
  heldOn: string;
  timeText: string | null;
  title: string;
  location: string | null;
  summary: string | null;
  participantCount: number | null;
  participantTotal: number | null;
  photoCount: number;
  recordedByName: string | null;
  createdAt: string;
}

export interface ActivityDetail extends ActivityItem {
  // มีเฉพาะสมาชิกชมรม / ผู้ดูข้อมูลภายใน
  participants?: { userId: string; name: string | null; email: string }[];
  photos?: { fileId: string; originalName: string }[];
  me: { canManage: boolean };
}

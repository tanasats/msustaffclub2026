// รูปแบบข้อมูลจาก GET /public/stats (ต้องตรงกับ apps/api/src/services/public-stats-service.ts)
export interface PublicStats {
  fiscalYear: number;
  activeClubs: number;
  members: number;
  activities: number;
  achievements: number;
  categories: { code: string; nameTh: string; clubCount: number }[];
}

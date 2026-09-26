// รูปแบบข้อมูลจาก API กีฬา (ต้องตรงกับ apps/api/src/services/sport-service.ts)

export interface Sport {
  id: string;
  code: string;
  nameTh: string;
  isActive: boolean;
}

export interface ClubSport {
  sportId: string;
  code: string;
  nameTh: string;
  athleteCount: number;
}

export interface Athlete {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  orgUnitName: string | null;
  sportId: string;
  sportName: string;
  eventOrPosition: string | null;
  since: string;
}

export interface StatDefinition {
  id: string;
  sportId: string;
  code: string;
  nameTh: string;
  unit: string | null;
  better: 'higher' | 'lower';
  isActive: boolean;
}

export type Medal = 'gold' | 'silver' | 'bronze';
export const MEDAL_LABELS: Record<Medal, string> = { gold: 'เหรียญทอง', silver: 'เหรียญเงิน', bronze: 'เหรียญทองแดง' };

export interface CompetitionItem {
  id: string;
  clubId: string;
  clubName: string;
  sportId: string;
  sportName: string;
  title: string;
  eventName: string | null;
  level: 'international' | 'national' | 'regional' | 'provincial' | 'university' | 'club';
  format: 'individual' | 'team';
  heldFrom: string;
  heldTo: string | null;
  location: string | null;
  organizer: string | null;
  note: string | null;
  participantCount: number;
  gold: number;
  silver: number;
  bronze: number;
  recordedByName: string | null;
}

export interface CompetitionDetail extends CompetitionItem {
  results: {
    userId: string;
    name: string | null;
    email: string;
    rank: number | null;
    medal: Medal | null;
    note: string | null;
    // มีเฉพาะค่าของตัวเอง หรือทั้งหมดถ้าเป็นผู้ดูข้อมูลภายใน
    stats?: { statId: string; nameTh: string; unit: string | null; value: number }[];
  }[];
  me: { canManage: boolean };
}

export interface AthleteSummary {
  userId: string;
  name: string | null;
  registrations: { id: string; sportName: string; eventOrPosition: string | null; since: string }[];
  summary: { competitionCount: number; gold: number; silver: number; bronze: number; bestRank: number | null; activityCount: number };
  bestStats: { statId: string; sportName: string; nameTh: string; unit: string | null; better: 'higher' | 'lower'; best: number; timesRecorded: number }[];
  competitions: {
    competitionId: string;
    title: string;
    eventName: string | null;
    sportName: string;
    level: string;
    heldFrom: string;
    organizer: string | null;
    rank: number | null;
    medal: Medal | null;
  }[];
}

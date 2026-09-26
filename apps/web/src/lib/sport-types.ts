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

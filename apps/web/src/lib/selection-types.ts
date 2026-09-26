// รูปแบบข้อมูลจาก API การคัดเลือก (ต้องตรงกับ apps/api/src/services/selection-service.ts)

export type SelectionKind = 'representative' | 'award';
export type SelectionDecision = 'selected' | 'reserve' | 'not_selected';

export const KIND_LABELS: Record<SelectionKind, string> = { representative: 'คัดเลือกตัวแทน', award: 'รางวัลเชิดชูเกียรติ' };
export const DECISION_LABELS: Record<SelectionDecision, string> = { selected: 'คัดเลือก', reserve: 'สำรอง', not_selected: 'ไม่คัดเลือก' };

export interface RoundItem {
  id: string;
  kind: SelectionKind;
  title: string;
  sportId: string | null;
  sportName: string | null;
  eventName: string | null;
  fiscalYear: number;
  criteria: string | null;
  slots: number | null;
  status: 'open' | 'closed';
  createdByName: string | null;
  closedAt: string | null;
  decidedCount: number;
  selectedCount: number;
}

export interface Candidate {
  userId: string;
  name: string | null;
  email: string;
  clubs: string[];
  competitionCount: number;
  gold: number;
  silver: number;
  bronze: number;
  bestRank: number | null;
  activityCount: number;
  achievementCount: number;
  bestStats: { nameTh: string; unit: string | null; better: 'higher' | 'lower'; best: number }[];
  decision: SelectionDecision | null;
  reason: string | null;
}

export interface RoundDetail extends RoundItem {
  candidates: Candidate[];
}

export interface Announcement {
  id: string;
  kind: SelectionKind;
  title: string;
  sportName: string | null;
  eventName: string | null;
  fiscalYear: number;
  criteria: string | null;
  closedAt: string;
  results: { userId: string; name: string; decision: 'selected' | 'reserve'; reason: string; clubs: string[] }[];
}

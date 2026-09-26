// รูปแบบข้อมูลจาก API /clubs (ต้องตรงกับ apps/api/src/services/club-service.ts)

export interface ClubListItem {
  id: string;
  nameTh: string;
  status: 'active' | 'suspended' | 'dissolved';
  category: { code: string; nameTh: string };
  motto: string | null;
  logoFileId: string | null;
  memberCount: number;
  establishedOn: string;
  registeredUntil: string;
  myMembershipStatus: 'pending' | 'active' | null;
}

export interface ClubPage {
  id: string;
  nameTh: string;
  status: 'active' | 'suspended' | 'dissolved';
  category: { code: string; nameTh: string };
  categoryDetail: string | null;
  motto: string | null;
  logoMeaning: string | null;
  logoFileId: string | null;
  history: string | null;
  objectives: string[];
  officeLocation: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  regulationText: string | null;
  establishedOn: string;
  registeredUntil: string;
  memberCount: number;
  committee: {
    // id ของตำแหน่ง (ใช้ตอนให้พ้นตำแหน่ง)
    id: string;
    userId: string;
    name: string;
    orgUnitName: string | null;
    positionCode: string;
    positionTitle: string;
    startedOn: string;
    email?: string;
    contactPhone?: string | null;
    workLocation?: string | null;
  }[];
  advisors: {
    kind: 'internal' | 'external';
    name: string;
    organization: string | null;
    position: string | null;
    email?: string | null;
    phone?: string | null;
  }[];
  me: {
    membershipStatus: 'pending' | 'active' | null;
    positions: string[];
    isAdvisor: boolean;
    permissions: string[];
  };
}

export interface ClubMember {
  membershipId: string;
  isCommittee: boolean;
  userId: string;
  name: string | null;
  email: string;
  orgUnitName: string | null;
  joinedAt: string | null;
}

export interface MembershipRequest {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  orgUnitName: string | null;
  appliedAt: string;
}

export interface CommitteeHistoryItem {
  id: string;
  name: string | null;
  email: string;
  positionTitle: string;
  startedOn: string;
  endedOn: string;
  endReason: string;
  endNote: string | null;
  endedByName: string | null;
}

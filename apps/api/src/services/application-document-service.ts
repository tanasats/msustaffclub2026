import { listActiveClubCategories } from '../repositories/club-master-repository.js';
import {
  findApplicationDetail,
  findOrgUnitNames,
  listActivityDetails,
  listAdvisorDetails,
  listCommitteeDetails,
  listMemberDetails,
} from '../repositories/club-applications-repository.js';
import { listActiveMembers, listCurrentCommittee } from '../repositories/clubs-repository.js';
import type { AuthContext } from './authorization.js';
import { pool } from '../db/pool.js';
import { findViewableApplication, notFound } from './club-application-service.js';

/**
 * ข้อมูลสำหรับพิมพ์ชุดเอกสารคำขอ (แบบฟอร์มสโมสร 11 รายการ) — ผู้ที่ดูคำขอนี้ได้เท่านั้น
 * - คำขอจัดตั้ง: กรรมการ/สมาชิกจากคำขอ (สมาชิก = กรรมการ ∪ สมาชิกที่ระบุ)
 * - คำขอต่อทะเบียน: กรรมการ/สมาชิกปัจจุบันของชมรม
 * เบอร์โทรเฉพาะกรรมการ (ระบบไม่เก็บเบอร์ของสมาชิก — ในแบบฟอร์มเว้นช่องไว้เขียนเอง)
 */
export async function getApplicationDocument(auth: AuthContext, applicationId: string) {
  const base = await findViewableApplication(auth, applicationId);

  const [detail, advisors, activities, categories] = await Promise.all([
    findApplicationDetail(applicationId, pool, base.deletedAt !== null),
    listAdvisorDetails(applicationId),
    listActivityDetails(applicationId),
    listActiveClubCategories(),
  ]);
  if (!detail) throw notFound();

  // consentStatus/respondedAt: การตอบรับผ่านระบบของประธานที่ผู้ยื่นเสนอชื่อ (NULL = ไม่ต้องตอบรับ / คำขอต่อทะเบียน)
  let committee: {
    name: string;
    positionCode: string;
    positionTitle: string;
    orgUnitName: string | null;
    workLocation: string | null;
    contactPhone: string | null;
    bio: string | null;
    isApplicant: boolean;
    consentStatus: 'pending' | 'accepted' | 'declined' | null;
    respondedAt: Date | null;
    // ตอบรับด้วยใบลงนามที่แนบ (ไม่ใช่กดในระบบ)
    hasConsentFile: boolean;
  }[];
  let members: { name: string; orgUnitName: string | null }[];
  if (detail.type === 'renewal' && detail.clubId) {
    const [clubCommittee, clubMembers] = await Promise.all([listCurrentCommittee(detail.clubId), listActiveMembers(detail.clubId, 1000, 0)]);
    // เอกสารทางการ: ชื่อพร้อมคำนำหน้า (user_formal_name)
    committee = clubCommittee.map((c) => ({
      name: c.formalName,
      positionCode: c.positionCode,
      positionTitle: c.positionTitle,
      orgUnitName: c.orgUnitName,
      workLocation: c.workLocation,
      contactPhone: c.contactPhone,
      bio: null,
      isApplicant: c.userId === detail.applicantUserId,
      consentStatus: null,
      respondedAt: null,
      hasConsentFile: false,
    }));
    members = clubMembers.items.map((m) => ({ name: m.formalName, orgUnitName: m.orgUnitName }));
  } else {
    const [appCommittee, appMembers] = await Promise.all([listCommitteeDetails(applicationId), listMemberDetails(applicationId)]);
    committee = appCommittee.map((c) => ({
      name: c.userFormalName,
      positionCode: c.positionCode,
      positionTitle: c.positionTitle,
      orgUnitName: c.orgUnitName,
      workLocation: c.workLocation,
      contactPhone: c.contactPhone,
      bio: c.bio,
      isApplicant: c.userId === detail.applicantUserId,
      consentStatus: c.consentStatus,
      respondedAt: c.respondedAt,
      hasConsentFile: c.consentFileId !== null,
    }));
    const committeeIds = new Set(appCommittee.map((c) => c.userId));
    members = [
      ...appCommittee.map((c) => ({ name: c.userFormalName, orgUnitName: c.orgUnitName })),
      ...appMembers.filter((m) => !committeeIds.has(m.userId)).map((m) => ({ name: m.userFormalName, orgUnitName: m.orgUnitName })),
    ];
  }

  const orgUnits = await findOrgUnitNames([detail.applicantUserId, ...advisors.flatMap((a) => (a.userId ? [a.userId] : []))]);
  return {
    id: detail.id,
    type: detail.type,
    status: detail.status,
    fiscalYear: detail.fiscalYear,
    submittedAt: detail.submittedAt,
    nameTh: detail.nameTh,
    applicant: { name: detail.applicantFormalName, orgUnitName: orgUnits.get(detail.applicantUserId) ?? null },
    categoryCode: detail.categoryCode,
    categoryDetail: detail.categoryDetail,
    categories: categories.map((c) => ({ code: c.code, nameTh: c.nameTh })),
    history: detail.history,
    motto: detail.motto,
    logoMeaning: detail.logoMeaning,
    logoFileId: detail.logoFileId,
    objectives: detail.objectives,
    officeLocation: detail.officeLocation,
    contactPhone: detail.contactPhone,
    contactEmail: detail.contactEmail,
    regulationText: detail.regulationText,
    advisors: advisors.map((a) => ({
      // ใช้อ้างอิงใบคำยินยอมรายคน (/club-applications/:id/consent-form/advisor-:sortOrder)
      sortOrder: a.sortOrder,
      name: a.external
        ? `${a.external.prefixTh ?? ''}${a.external.firstNameTh} ${a.external.lastNameTh}`
        : (a.userFormalName ?? a.email ?? ''),
      orgUnitName: a.external ? a.external.organization : a.userId ? (orgUnits.get(a.userId) ?? null) : null,
      kind: a.external ? ('external' as const) : ('internal' as const),
      consentStatus: a.consentStatus,
      respondedAt: a.respondedAt,
      // ยินยอมด้วยใบลงนามที่แนบ (บุคคลภายนอก/บุคลากรที่ไม่สะดวกเข้าระบบ)
      hasConsentFile: a.consentFileId !== null,
    })),
    committee,
    members,
    activities,
  };
}

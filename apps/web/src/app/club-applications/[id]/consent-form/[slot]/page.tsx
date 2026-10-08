import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Fill, Page, Signature } from '@/components/print/DocParts';
import { PrintToolbar } from '@/components/print/PrintToolbar';
import { sarabun } from '@/components/print/sarabun';
import { thaiDigits } from '@/components/print/thai-doc';
import { apiGetJson } from '@/lib/api-server';
import type { ApplicationDocument } from '@/lib/club-application-types';

/**
 * ใบคำยินยอมเป็นที่ปรึกษา / ใบตอบรับเป็นประธาน แบบรายคน สำหรับพิมพ์ให้ลงนาม แล้วผู้ยื่นแนบกลับในระบบ
 * slot = advisor-{ลำดับ} หรือ president — ใช้ข้อมูลชุดเดียวกับเอกสารสำหรับพิมพ์ (API ตอบ 404 ถ้าไม่มีสิทธิ์ดูคำขอ)
 */
export default async function ConsentFormPage({ params }: { params: Promise<{ id: string; slot: string }> }) {
  const { id, slot } = await params;
  const d = await apiGetJson<ApplicationDocument>(`/club-applications/${encodeURIComponent(id)}/document`);
  const requestHeaders = await headers();
  const siteOrigin = `${requestHeaders.get('x-forwarded-proto') ?? 'http'}://${requestHeaders.get('host') ?? ''}`.replace(/^http:\/\/(?!localhost)/, 'https://');

  const club = `ชมรม${d.nameTh.replace(/^ชมรม/, '')}`;
  const action = d.type === 'renewal' ? 'ต่อทะเบียน' : 'จัดตั้ง';
  const fy = thaiDigits(d.fiscalYear);
  const term = `ตั้งแต่วันที่ ๑ ตุลาคม พ.ศ. ${thaiDigits(d.fiscalYear - 1)} ถึงวันที่ ๓๐ กันยายน พ.ศ. ${fy}`;

  const advisorMatch = /^advisor-(\d+)$/.exec(slot);
  const advisor = advisorMatch ? d.advisors.find((a) => a.sortOrder === Number(advisorMatch[1])) : undefined;
  // ใบตอบรับประธาน: เฉพาะคำขอจัดตั้งที่เสนอบุคลากรอื่น (ไม่ใช่ผู้ยื่น) เป็นประธาน
  const president =
    slot === 'president' && d.type === 'establish' ? d.committee.find((c) => c.positionCode === 'president' && !c.isApplicant) : undefined;
  const person = advisor ?? president;
  if (!person) notFound();

  const noun = advisor ? 'ใบคำยินยอม' : 'ใบตอบรับ';
  const acceptedInSystem = person.consentStatus === 'accepted' && !person.hasConsentFile;

  return (
    <div className={`${sarabun.variable} bg-neutral-200 py-6 print:bg-white print:py-0`}>
      <PrintToolbar backHref={`/club-applications/${d.id}`} backLabel="กลับไปหน้าคำขอ" />
      {acceptedInSystem && (
        <p role="status" className="mx-auto mb-4 max-w-[210mm] rounded-lg border border-matcha-300 bg-white px-4 py-3 text-sm text-matcha-800 print:hidden">
          {person.name} {advisor ? 'ยินยอม' : 'ตอบรับ'}ผ่านระบบแล้ว ไม่จำเป็นต้องพิมพ์{noun}นี้
        </p>
      )}

      <Page>
        <div className="text-center font-bold">
          <p>{advisor ? 'หนังสือแสดงความยินยอมเป็นที่ปรึกษาชมรม' : 'หนังสือตอบรับการเสนอชื่อเป็นประธานชมรม'}</p>
          <p>
            {club} สังกัดสโมสรบุคลากร มหาวิทยาลัยมหาสารคาม
          </p>
        </div>
        <div className="mt-8 ml-auto w-fit">
          <p>เขียนที่ ..................................................</p>
          <p className="mt-2">วันที่ .......... เดือน ............................ พ.ศ. ..............</p>
        </div>

        <p className="mt-8 indent-16">
          ข้าพเจ้า <Fill value={person.name} /> สังกัด/หน่วยงาน <Fill value={person.orgUnitName} />{' '}
          {advisor ? (
            <>
              ได้รับการเสนอชื่อให้เป็นที่ปรึกษา{club} สังกัดสโมสรบุคลากร มหาวิทยาลัยมหาสารคาม ตามคำขอ{action}ชมรม ประจำปีงบประมาณ {fy} ({term})
            </>
          ) : (
            <>
              ได้รับการเสนอชื่อจาก <Fill value={d.applicant.name} /> ให้เป็นประธาน{club} สังกัดสโมสรบุคลากร มหาวิทยาลัยมหาสารคาม ตามคำขอจัดตั้งชมรม
              ประจำปีงบประมาณ {fy} ({term})
            </>
          )}
        </p>
        <p className="mt-4 indent-16">
          {advisor ? (
            <>ข้าพเจ้ามีความยินดีและยินยอมรับเป็นที่ปรึกษาของ{club} ตั้งแต่บัดนี้เป็นต้นไป</>
          ) : (
            <>
              ข้าพเจ้าได้รับทราบรายละเอียดของคำขอจัดตั้งชมรมดังกล่าวแล้ว และมีความยินดีตอบรับเป็นประธาน{club} ตั้งแต่บัดนี้เป็นต้นไป
            </>
          )}
        </p>

        <div className="mt-12 ml-auto w-1/2">
          <Signature name={person.name} role={advisor ? `ที่ปรึกษา${club}` : `ประธาน${club}`} />
          <p className="mt-2 text-center">วันที่ .......... / .......... / ..............</p>
        </div>

        {/* PDPA มาตรา 23: แจ้งการเก็บข้อมูลแก่ผู้ลงนาม (รวมบุคคลภายนอกที่ไม่ได้ใช้ระบบ) */}
        <p className="mt-12 text-[11pt]">
          หมายเหตุ ข้อมูลส่วนบุคคลของท่าน (ชื่อ-สกุล หน่วยงาน ตำแหน่ง ช่องทางติดต่อ และเอกสารที่ลงนามนี้) ใช้เพื่อการจัดตั้งและบริหารชมรมเท่านั้น
          รายละเอียดตามประกาศความเป็นส่วนตัวของระบบ {siteOrigin}/privacy
        </p>

        <div className="mt-6 border border-black px-4 py-3 text-[11pt]">
          <p className="font-bold">สำหรับผู้ยื่นคำขอ</p>
          <p>
            เมื่อลงนามแล้ว ให้สแกนหรือถ่ายภาพเอกสารนี้ (PDF / JPG / PNG ไม่เกิน 10 MB) แล้วแนบในระบบที่คำขอ{action}
            {club} {advisor ? `ช่องที่ปรึกษาลำดับที่ ${thaiDigits(advisor.sortOrder)}` : 'ช่องประธานชมรม'} — เจ้าหน้าที่สโมสรบุคลากรจะตรวจ{noun}ก่อนพิจารณาคำขอ
          </p>
          <p className="mt-1">
            เสนอชื่อโดย {d.applicant.name} · เลขอ้างอิงคำขอ {d.id.slice(-8).toUpperCase()}
          </p>
        </div>
      </Page>
    </div>
  );
}

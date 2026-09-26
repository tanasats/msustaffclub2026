import { DraftMark, Page, Signature } from '@/components/print/DocParts';
import { PrintToolbar } from '@/components/print/PrintToolbar';
import { Acknowledgement, ActivityTable, MemoHeader, SectionHeading } from '@/components/print/ReportMemo';
import { sarabun } from '@/components/print/sarabun';
import { thaiDateParts, thaiDigits, thaiShortDate } from '@/components/print/thai-doc';
import { apiGetJson } from '@/lib/api-server';
import type { MonthlyReportDetail } from '@/lib/report-types';

// รายงานประจำเดือนเสนอที่ปรึกษา (ระเบียบชมรม ข้อ ๑๖) สำหรับพิมพ์ — API ตอบ 404 ถ้าไม่มีสิทธิ์ดูรายงานนี้
export default async function MonthlyReportDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiGetJson<MonthlyReportDetail>(`/monthly-reports/${encodeURIComponent(id)}`);
  const club = `ชมรม${r.clubName.replace(/^ชมรม/, '')}`;
  const { month, year } = thaiDateParts(r.reportMonth);

  return (
    <div className={`${sarabun.variable} bg-neutral-200 py-6 print:bg-white print:py-0`}>
      <PrintToolbar backHref={`/monthly-reports/${r.id}`} backLabel="กลับไปหน้ารายงาน" />
      <Page>
        <DraftMark show={r.status === 'draft'} />
        <MemoHeader
          club={club}
          date={r.submittedAt}
          subject={
            <>
              รายงานผลการดำเนินงานประจำเดือน {month} {year}
            </>
          }
          to="ที่ปรึกษาชมรม"
        />
        <p className="indent-16">
          ตามระเบียบ{club} ข้อ ๑๖ กำหนดให้คณะกรรมการบริหารชมรมจัดทำบันทึกสรุปและรายงานรายละเอียดการประชุมและการจัดกิจกรรมของชมรมให้ที่ปรึกษาได้รับทราบทุกสิ้นเดือน
          บัดนี้ {club} ขอรายงานผลการดำเนินงานประจำเดือน {month} {year} ดังนี้
        </p>

        <SectionHeading>๑. การจัดกิจกรรม (จำนวน {thaiDigits(r.activities.length)} กิจกรรม)</SectionHeading>
        <ActivityTable activities={r.activities} />

        <SectionHeading>๒. การประชุมคณะกรรมการ/สมาชิก (จำนวน {thaiDigits(r.meetings.length)} ครั้ง)</SectionHeading>
        <table className="mb-4">
          <thead>
            <tr>
              <th className="w-[1.8rem]">ที่</th>
              <th className="w-[7rem]">วันที่</th>
              <th>วาระการประชุม</th>
              <th>มติ/ผลการประชุม</th>
              <th className="w-[6.5rem]">ผู้เข้าประชุม</th>
            </tr>
          </thead>
          <tbody>
            {r.meetings.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center">
                  - ไม่มีการประชุม -
                </td>
              </tr>
            ) : (
              r.meetings.map((m, i) => (
                <tr key={m.id} className="break-inside-avoid">
                  <td className="text-center">{thaiDigits(i + 1)}</td>
                  <td className="whitespace-nowrap">{thaiShortDate(m.metOn)}</td>
                  <td className="whitespace-pre-line">{m.agenda}</td>
                  <td className="whitespace-pre-line">{m.resolution ?? ''}</td>
                  <td className="text-center whitespace-nowrap">{m.attendeeCount !== null ? `${thaiDigits(m.attendeeCount)} คน` : ''}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <SectionHeading>๓. สรุปอื่น ๆ</SectionHeading>
        <p className="indent-16 whitespace-pre-line">{r.summary ?? '-'}</p>

        <p className="mt-4 indent-16">จึงเรียนมาเพื่อโปรดทราบ</p>
        <div className="mt-8 ml-auto w-3/5 break-inside-avoid">
          <Signature name={r.submittedByName ?? r.createdByName} role={`ผู้รายงาน ${club}`} />
        </div>

        <Acknowledgement heading="ความเห็นของที่ปรึกษาชมรม" role="ที่ปรึกษาชมรม" byName={r.acknowledgedByName} at={r.acknowledgedAt} note={r.acknowledgementNote} />
      </Page>
    </div>
  );
}

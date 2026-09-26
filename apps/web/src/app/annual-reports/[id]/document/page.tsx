import { DraftMark, Page, Signature } from '@/components/print/DocParts';
import { PrintToolbar } from '@/components/print/PrintToolbar';
import { Acknowledgement, ActivityTable, MemoHeader, SectionHeading } from '@/components/print/ReportMemo';
import { sarabun } from '@/components/print/sarabun';
import { thaiDigits, thaiLongDate } from '@/components/print/thai-doc';
import { apiGetJson } from '@/lib/api-server';
import type { AnnualReportDetail } from '@/lib/report-types';

// รายงานประจำปีเสนอสโมสรบุคลากร (ระเบียบชมรม ข้อ ๑๖ วรรคสอง) สำหรับพิมพ์ — API ตอบ 404 ถ้าไม่มีสิทธิ์ดู
export default async function AnnualReportDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiGetJson<AnnualReportDetail>(`/annual-reports/${encodeURIComponent(id)}`);
  const club = `ชมรม${r.clubName.replace(/^ชมรม/, '')}`;
  const fy = thaiDigits(r.fiscalYear);
  const stats: [string, number, string][] = [
    ['กิจกรรมที่จัด', r.stats.activityCount, `กิจกรรม (จากแผน ${thaiDigits(r.stats.plannedCount)} รายการ)`],
    ['ผู้เข้าร่วมกิจกรรมรวม', r.stats.participantTotal, 'คน-ครั้ง'],
    ['สมาชิก', r.stats.activeMembers, 'คน'],
    ['ผลงานที่ได้รับการรับรอง', r.stats.approvedAchievements, 'รายการ'],
    ['รายงานประจำเดือนที่ส่งที่ปรึกษา', r.stats.monthlyReportsSubmitted, 'เดือน (จาก ๑๒ เดือน)'],
  ];

  return (
    <div className={`${sarabun.variable} bg-neutral-200 py-6 print:bg-white print:py-0`}>
      <PrintToolbar backHref={`/annual-reports/${r.id}`} backLabel="กลับไปหน้ารายงาน" />
      <Page>
        <DraftMark show={r.status === 'draft'} />
        <MemoHeader
          club={club}
          date={r.submittedAt}
          subject={<>รายงานผลการดำเนินงานประจำปีงบประมาณ {fy}</>}
          to="นายกสโมสรบุคลากร มหาวิทยาลัยมหาสารคาม"
        />
        <p className="indent-16">
          ตามระเบียบ{club} ข้อ ๑๖ กำหนดให้คณะกรรมการบริหารชมรมจัดทำบันทึกสรุปและรายงานรายละเอียดการจัดกิจกรรมแต่ละโครงการตลอดทั้งปีของชมรม
          เสนอต่อกรรมการดำเนินงานสโมสรบุคลากร มหาวิทยาลัยมหาสารคาม ก่อนสิ้นสุดวาระการดำรงตำแหน่งสามสิบวัน บัดนี้ {club} ขอรายงานผลการดำเนินงานประจำปีงบประมาณ {fy}{' '}
          (กำหนดส่ง {thaiLongDate(r.dueDate)}) ดังนี้
        </p>

        <SectionHeading>๑. สรุปข้อมูลการดำเนินงาน</SectionHeading>
        <table className="mb-4">
          <tbody>
            {stats.map(([label, value, unit]) => (
              <tr key={label}>
                <td className="w-[42%]">{label}</td>
                <td className="w-[5rem] text-right font-bold">{thaiDigits(value.toLocaleString('en-US'))}</td>
                <td>{unit}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <SectionHeading>๒. สรุปผลการดำเนินงาน</SectionHeading>
        <p className="mb-4 indent-16 whitespace-pre-line">{r.summary ?? '-'}</p>

        <SectionHeading>๓. ปัญหา อุปสรรค และข้อเสนอแนะ</SectionHeading>
        <p className="mb-4 indent-16 whitespace-pre-line">{r.obstacles ?? '-'}</p>

        <SectionHeading>๔. กิจกรรมตลอดปีงบประมาณ (จำนวน {thaiDigits(r.activities.length)} กิจกรรม)</SectionHeading>
        <ActivityTable activities={r.activities} />

        <p className="mt-4 indent-16">จึงเรียนมาเพื่อโปรดทราบ</p>
        <div className="mt-8 ml-auto w-3/5 break-inside-avoid">
          <Signature name={r.submittedByName ?? r.createdByName} role={`ผู้รายงาน ${club}`} />
        </div>

        <Acknowledgement heading="สำหรับสโมสรบุคลากร" role="กรรมการดำเนินงานสโมสรบุคลากร" byName={r.acknowledgedByName} at={r.acknowledgedAt} note={r.acknowledgementNote} />
      </Page>
    </div>
  );
}

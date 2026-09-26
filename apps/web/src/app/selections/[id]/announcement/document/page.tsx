import { Page, Signature } from '@/components/print/DocParts';
import { PrintToolbar } from '@/components/print/PrintToolbar';
import { SectionHeading } from '@/components/print/ReportMemo';
import { sarabun } from '@/components/print/sarabun';
import { thaiDateParts, thaiDigits } from '@/components/print/thai-doc';
import { apiGetJson } from '@/lib/api-server';
import type { Announcement } from '@/lib/selection-types';

type Result = Announcement['results'][number];

function ResultTable({ rows }: { rows: Result[] }) {
  return (
    <table className="mb-4">
      <thead>
        <tr>
          <th className="w-[1.8rem]">ที่</th>
          <th className="w-[9.5rem]">ชื่อ – สกุล</th>
          <th className="w-[11.5rem]">ชมรม</th>
          <th>เหตุผลการพิจารณา</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={4} className="text-center">
              - ไม่มี -
            </td>
          </tr>
        ) : (
          rows.map((r, i) => (
            <tr key={r.userId} className="break-inside-avoid">
              <td className="text-center">{thaiDigits(i + 1)}</td>
              <td>{r.name}</td>
              <td>{r.clubs.join(', ') || '-'}</td>
              <td className="whitespace-pre-line">{r.reason}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ประกาศผลการคัดเลือกสำหรับพิมพ์ (ต้อง login เท่านั้น เฉพาะรอบที่ปิดแล้ว — API ตอบ 404 ถ้ายังไม่ปิด)
export default async function AnnouncementDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await apiGetJson<Announcement>(`/selection-rounds/${encodeURIComponent(id)}/announcement`);
  const selected = a.results.filter((r) => r.decision === 'selected');
  const reserve = a.results.filter((r) => r.decision === 'reserve');
  const fy = thaiDigits(a.fiscalYear);
  const announced = thaiDateParts(a.closedAt);
  const scope = [a.sportName && `ชนิดกีฬา${a.sportName}`, a.eventName && `ประเภท ${a.eventName}`].filter(Boolean).join(' ');
  // ชื่อรอบขึ้นต้นด้วยกริยา (คัดเลือก/พิจารณา) → "ผลการ" + ชื่อรอบ, ไม่เช่นนั้นเติมประเภทรอบนำหน้า
  const title = a.title.replace(/^ผลการ/, '');
  const subject = /^(คัดเลือก|พิจารณา)/.test(title) ? `ผลการ${title}` : `ผลการ${a.kind === 'award' ? 'พิจารณารางวัล' : 'คัดเลือก'} ${title}`;
  const purpose =
    a.kind === 'representative'
      ? `คัดเลือกนักกีฬาตัวแทนมหาวิทยาลัยมหาสารคาม${scope ? ` ${scope}` : ''}`
      : 'พิจารณาบุคลากรผู้มีผลงานเพื่อรับรางวัลเชิดชูเกียรติ';

  return (
    <div className={`${sarabun.variable} bg-neutral-200 py-6 print:bg-white print:py-0`}>
      <PrintToolbar backHref={`/selections/${a.id}/announcement`} backLabel="กลับไปหน้าประกาศ" />
      <Page>
        <div className="mb-6 text-center font-bold">
          <p>ประกาศคณะกรรมการคัดเลือก สโมสรบุคลากร มหาวิทยาลัยมหาสารคาม</p>
          <p>เรื่อง {subject}</p>
          <p className="mx-auto mt-2 w-1/3 border-b border-black" />
        </div>

        <p className="indent-16">
          ตามที่คณะกรรมการคัดเลือก สโมสรบุคลากร มหาวิทยาลัยมหาสารคาม ได้ดำเนินการ{purpose} ประจำปีงบประมาณ {fy} โดยพิจารณาจากข้อมูลผลการแข่งขัน
          ผลงานที่ได้รับการรับรอง และการเข้าร่วมกิจกรรมของชมรมที่บันทึกไว้ในระบบ นั้น บัดนี้ การพิจารณาได้เสร็จสิ้นแล้ว จึงประกาศรายชื่อ ดังนี้
        </p>

        <SectionHeading>๑. ผู้ได้รับคัดเลือก (จำนวน {thaiDigits(selected.length)} คน)</SectionHeading>
        <ResultTable rows={selected} />

        <SectionHeading>๒. สำรอง (จำนวน {thaiDigits(reserve.length)} คน)</SectionHeading>
        <ResultTable rows={reserve} />

        {a.criteria && (
          <>
            <SectionHeading>เกณฑ์การพิจารณา</SectionHeading>
            <p className="mb-4 pl-8 whitespace-pre-line">{a.criteria}</p>
          </>
        )}

        {/* คำปิด วันที่ประกาศ และลายมือชื่อ อยู่หน้าเดียวกันเสมอ */}
        <div className="break-inside-avoid">
          <p className="mt-4 indent-16">จึงประกาศมาให้ทราบโดยทั่วกัน</p>
          <p className="mt-2 text-center">
            ประกาศ ณ วันที่ {announced.day} {announced.month} พ.ศ. {announced.year}
          </p>
          <div className="mt-8 ml-auto w-3/5">
            <Signature name={null} role="ประธานคณะกรรมการคัดเลือก" />
          </div>
        </div>
      </Page>
    </div>
  );
}

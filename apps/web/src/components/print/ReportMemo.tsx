import { thaiDateParts, thaiDigits, thaiLongDate, thaiShortDate } from '@/components/print/thai-doc';

// หัวบันทึกข้อความ (ส่วนราชการ / ที่ / วันที่ / เรื่อง / เรียน) ของรายงานชมรม
export function MemoHeader({ club, date, subject, to }: { club: string; date: string | null; subject: React.ReactNode; to: string }) {
  const d = date ? thaiDateParts(date) : null;
  return (
    <>
      <h2 className="mb-4 text-center text-[18pt] font-bold">บันทึกข้อความ</h2>
      <p>
        <span className="font-bold">ส่วนราชการ</span> {club} สังกัดสโมสรบุคลากร มหาวิทยาลัยมหาสารคาม
      </p>
      <p className="flex justify-between gap-4">
        <span>
          <span className="font-bold">ที่</span> ........../{d?.year ?? '..........'}
        </span>
        <span>
          <span className="font-bold">วันที่</span> {d ? `${d.day} ${d.month} ${d.year}` : '........ เดือน ............. พ.ศ. ..........'}
        </span>
      </p>
      <p>
        <span className="font-bold">เรื่อง</span> {subject}
      </p>
      <p className="mb-4">
        <span className="font-bold">เรียน</span> {to}
      </p>
    </>
  );
}

export interface ActivityRow {
  id: string;
  heldOn: string;
  title: string;
  location: string | null;
  participantTotal: number | null;
}

// ตารางกิจกรรม (ว่าง → แถวเดียวบอกว่าไม่มี)
export function ActivityTable({ activities }: { activities: ActivityRow[] }) {
  return (
    <table className="mb-4">
      <thead>
        <tr>
          <th className="w-[1.8rem]">ที่</th>
          <th className="w-[7rem]">วันที่</th>
          <th>กิจกรรม</th>
          <th className="w-[9.5rem]">สถานที่</th>
          <th className="w-[5.5rem]">ผู้เข้าร่วม</th>
        </tr>
      </thead>
      <tbody>
        {activities.length === 0 ? (
          <tr>
            <td colSpan={5} className="text-center">
              - ไม่มีกิจกรรม -
            </td>
          </tr>
        ) : (
          activities.map((a, i) => (
            <tr key={a.id} className="break-inside-avoid">
              <td className="text-center">{thaiDigits(i + 1)}</td>
              <td className="whitespace-nowrap">{thaiShortDate(a.heldOn)}</td>
              <td>{a.title}</td>
              <td>{a.location ?? ''}</td>
              <td className="text-center whitespace-nowrap">{a.participantTotal !== null ? `${thaiDigits(a.participantTotal)} คน` : ''}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ส่วนรับทราบ: รับทราบในระบบแล้ว → ชื่อ/วันที่/ความเห็น, ยังไม่รับทราบ → ช่องว่างให้เขียนและลงนาม
export function Acknowledgement({
  heading,
  role,
  byName,
  at,
  note,
}: {
  heading: string;
  role: string;
  byName: string | null;
  at: string | null;
  note: string | null;
}) {
  return (
    <div className="mt-8 break-inside-avoid border border-black p-4">
      <p className="font-bold">{heading}</p>
      <p className="min-h-[3em] whitespace-pre-line">{note ?? (at ? '' : '..........................................................................................................................')}</p>
      <div className="mt-4 ml-auto w-3/5 text-center">
        <p>ลงชื่อ.....................................................</p>
        <p>( {byName ?? '.............................................'} )</p>
        <p>{role}</p>
        {at && <p className="text-[11pt] text-neutral-600">(รับทราบผ่านระบบเมื่อ {thaiLongDate(at)})</p>}
      </div>
    </div>
  );
}

// หัวข้อของส่วน — ไม่ให้ค้างท้ายหน้าแยกจากเนื้อหา
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 mb-2 font-bold break-after-avoid">{children}</p>;
}

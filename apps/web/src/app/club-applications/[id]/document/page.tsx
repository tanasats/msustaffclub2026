import { DOTS, Fill, Page, Signature, Title } from '@/components/print/DocParts';
import { PrintToolbar } from '@/components/print/PrintToolbar';
import { sarabun } from '@/components/print/sarabun';
import { thaiDateParts, thaiDigits, thaiLongDate } from '@/components/print/thai-doc';
import { apiGetJson } from '@/lib/api-server';
import type { ApplicationDocument } from '@/lib/club-application-types';
import { publicEnv } from '@/lib/public-env';

/**
 * ระเบียบข้อบังคับ (ข้อความล้วน) จัดรูปแบบตามต้นฉบับ:
 * บรรทัดแรก (ชื่อระเบียบ) และบรรทัด "หมวด ..." อยู่กลางหน้าตัวหนา, "ข้อ ..." ย่อหน้า, บรรทัดอื่นย่อหน้าลึกกว่า
 */
function Regulation({ text }: { text: string | null }) {
  if (!text) return <p className="text-center">- ยังไม่มีระเบียบ -</p>;
  const all = text.split('\n').map((l) => l.trim()).filter(Boolean);
  // ส่วนท้าย ("จึงประกาศ..." เป็นต้นไป) = วันที่ประกาศและลายมือชื่อประธาน จัดชิดขวาแบบช่องลงนาม
  const closingAt = all.findIndex((l) => /^จึงประกาศ/.test(l));
  const lines = closingAt === -1 ? all : all.slice(0, closingAt);
  const closing = closingAt === -1 ? [] : all.slice(closingAt);
  return (
    <div>
      {lines.map((line, i) => {
        if (i === 0 || /^หมวด/.test(line)) {
          return (
            <p key={i} className={`text-center font-bold ${i === 0 ? 'mb-4' : 'mt-4 mb-1'}`}>
              {line}
            </p>
          );
        }
        if (/^_+$/.test(line)) return <hr key={i} className="mx-auto mb-4 w-1/3 border-black" />;
        if (/^ข้อ\s/.test(line)) {
          return (
            <p key={i} className="indent-8">
              <span className="font-bold">{line.split(' ').slice(0, 2).join(' ')}</span> {line.split(' ').slice(2).join(' ')}
            </p>
          );
        }
        return (
          <p key={i} className="indent-16">
            {line}
          </p>
        );
      })}
      {closing.length > 0 && (
        <>
          <p className="mt-2 indent-16">{closing[0]}</p>
          <div className="mt-8 ml-auto w-3/5 text-center">
            {closing.slice(1).map((line, i) => (
              <p key={i} className={/^\(/.test(line) ? 'mt-10' : ''}>
                {/^\(/.test(line) && <span className="mb-1 block">ลงชื่อ.....................................................</span>}
                {line}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const CHECKED = '☑';
const UNCHECKED = '☐';

// ชุดเอกสารคำขอจัดตั้ง/ต่อทะเบียน ตามแบบฟอร์มสโมสรบุคลากร (11 รายการ) — API ตอบ 404 ถ้าไม่มีสิทธิ์ดูคำขอนี้
export default async function ApplicationDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await apiGetJson<ApplicationDocument>(`/club-applications/${encodeURIComponent(id)}/document`);
  const renewal = d.type === 'renewal';
  const club = `ชมรม${d.nameTh.replace(/^ชมรม/, '')}`;
  const fy = thaiDigits(d.fiscalYear);
  const submitted = d.submittedAt ? thaiDateParts(d.submittedAt) : null;
  const president = d.committee.find((c) => c.positionCode === 'president') ?? null;
  const advisors = [d.advisors[0] ?? null, d.advisors[1] ?? null];
  const consentNote = (a: ApplicationDocument['advisors'][number] | null) =>
    a && a.consentStatus === 'accepted'
      ? a.kind === 'internal' && a.respondedAt
        ? `(ยินยอมผ่านระบบเมื่อ ${thaiLongDate(a.respondedAt)})`
        : '(แนบใบคำยินยอมที่ลงนามแล้ว)'
      : null;
  const action = renewal ? 'ต่อทะเบียน' : 'จัดตั้ง';

  return (
    <div className={`${sarabun.variable} bg-neutral-200 py-6 print:bg-white print:py-0`}>
      <PrintToolbar backHref={`/club-applications/${d.id}`} backLabel="กลับไปหน้าคำขอ" />

      {/* ปก */}
      <Page className="flex flex-col items-center text-center">
        <p className="mt-10 mb-16 font-bold">
          เอกสารการ{action}
          {club}
        </p>
        <div className="flex size-[9cm] items-center justify-center border border-black">
          {d.logoFileId ? (
            // eslint-disable-next-line @next/next/no-img-element -- รูปจาก API (ตรวจสิทธิ์แล้ว redirect) next/image ใช้ไม่ได้
            <img src={`${publicEnv.apiUrl}/club-applications/${d.id}/logo?v=${d.logoFileId}`} alt="ตราสัญลักษณ์ชมรม" className="max-h-full max-w-full object-contain p-4" />
          ) : (
            <span>รูปตราสัญลักษณ์ชมรม</span>
          )}
        </div>
        <div className="mt-16 font-bold">
          <p>สังกัดสโมสรบุคลากร มหาวิทยาลัยมหาสารคาม</p>
          <p>ประจำปีงบประมาณ {fy}</p>
        </div>
      </Page>

      {/* รายการเอกสาร */}
      <Page>
        <div className="mb-6 text-center underline">
          <p>รายละเอียดการ{action}ชมรม</p>
          <p>สังกัดสโมสรบุคลากร มหาวิทยาลัยมหาสารคาม</p>
        </div>
        <ol className="list-decimal pl-8">
          <li>แบบขอ{action}ชมรม</li>
          <li>บันทึกขอเสนอชื่อแต่งตั้งที่ปรึกษาชมรม</li>
          <li>ประวัติชมรม (ถ้ามี)</li>
          <li>ข้อมูลผู้ประสานงานของชมรม (เฉพาะกรรมการชมรม ทุกคน)</li>
          <li>ตราสัญลักษณ์ คำขวัญและความหมายตราสัญลักษณ์ของชมรม</li>
          <li>วัตถุประสงค์ของการจัดตั้งชมรม</li>
          <li>ระเบียบข้อบังคับของชมรม</li>
          <li>รายชื่อคณะกรรมการบริหารชมรม</li>
          <li>ประวัติรายละเอียดคณะกรรมการบริหารชมรม</li>
          <li>แผนงานกิจกรรมของชมรมประจำปี</li>
          <li>รายชื่อสมาชิกของชมรม</li>
        </ol>
        <div className="mt-24 grid grid-cols-[auto_1fr] gap-x-6">
          <span className="font-bold underline">หมายเหตุ</span>
          <div>
            <p>เอกสารการ{action}ชมรม ฉบับสมบูรณ์ ให้สำเนา ๓ ชุด</p>
            <p>
              โดย <span className="underline">(เข้าเล่มปกสีเหลือง/สันปกสีเหลือง)</span> ดังนี้
            </p>
            <p>- ส่งสำนักงานสโมสรบุคลากร ๑ ชุด (ต้นฉบับ)</p>
            <p>- ส่งสภาคณาจารย์ ๑ ชุด (สำเนา)</p>
            <p>- เก็บที่ชมรม/กลุ่ม ๑ ชุด (สำเนา)</p>
          </div>
        </div>
      </Page>

      {/* 1. แบบขอจัดตั้ง/ต่อทะเบียน */}
      <Page>
        <div className="text-center font-bold">
          <p>แบบขอ{action}ชมรม</p>
          <p>สังกัดสโมสรบุคลากร มหาวิทยาลัยมหาสารคาม</p>
        </div>
        <div className="mt-6 text-right">
          <p>มหาวิทยาลัยมหาสารคาม</p>
          <p>จังหวัดมหาสารคาม</p>
          <p className="mt-4">
            วันที่ <Fill value={submitted?.day} dots="....." /> เดือน <Fill value={submitted?.month} dots="......................" /> พ.ศ.{' '}
            {submitted?.year ?? fy}
          </p>
        </div>
        <p className="mt-6">
          <span className="font-bold">เรื่อง</span>&emsp;ขออนุมัติ{action}
          <span className="font-bold">{club}</span>
        </p>
        <p className="mt-4">
          <span className="font-bold">เรียน</span>&emsp;นายกสโมสรบุคลากร มหาวิทยาลัยมหาสารคาม
        </p>
        <div className="mt-4 grid grid-cols-[auto_1fr_auto] gap-x-6">
          <span className="font-bold">สิ่งที่แนบมาด้วย</span>
          <span>๑. รายละเอียดชมรม</span>
          <span>จำนวน ๔ ชุด</span>
          <span />
          <span>๒. แบบเสนอชื่อที่ปรึกษาชมรม</span>
          <span>จำนวน ๑ ชุด</span>
          <span />
          <span>๓. ระเบียบข้อบังคับชมรม</span>
          <span>จำนวน ๑ ชุด</span>
        </div>
        <p className="mt-6 indent-16">
          ข้าพเจ้า <Fill value={d.applicant.name} /> สังกัด <Fill value={d.applicant.orgUnitName} /> มหาวิทยาลัยมหาสารคาม มีความประสงค์ขอ{action}ชมรม
          ตามประกาศมหาวิทยาลัยมหาสารคาม เรื่อง แนวปฏิบัติด้านกิจกรรมบุคลากร มหาวิทยาลัยมหาสารคาม พุทธศักราช ๒๕๔๙ หมวดที่ ๑๓ ว่าด้วยชมรมและกลุ่ม
          โดยใช้ชื่อว่า <span className="font-bold">{club}</span> ซึ่งมีรายละเอียดดังเอกสารที่แนบมานี้
        </p>
        <p className="mt-4 indent-16">จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติ</p>
        <div className="mt-6 ml-auto w-1/2">
          <Signature name={president?.name ?? null} role={`ประธาน${club}`} />
        </div>
        <div className="mt-8 grid grid-cols-2 gap-6">
          {advisors.map((a, i) => (
            <Signature key={i} name={a?.name ?? null} role={`ที่ปรึกษา ${club}`} note={consentNote(a)} />
          ))}
        </div>
      </Page>

      {/* 2. บันทึกขอเสนอชื่อแต่งตั้งที่ปรึกษา */}
      <Page>
        <Title>บันทึกข้อความ</Title>
        <p>
          <span className="font-bold">สโมสรบุคลากร</span> {club} สังกัดสโมสรบุคลากร มหาวิทยาลัยมหาสารคาม
        </p>
        <p className="grid grid-cols-2">
          <span>
            <span className="font-bold">ที่</span> อ.มมส. ........../{fy}
          </span>
          <span>
            วันที่ <Fill value={submitted?.day} dots="........" /> เดือน <Fill value={submitted?.month} dots="............." /> พ.ศ. {submitted?.year ?? fy}
          </span>
        </p>
        <p>
          <span className="font-bold">เรื่อง</span>&emsp;ขอเสนอชื่อแต่งตั้งที่ปรึกษา <span className="font-bold">{club}</span>
        </p>
        <p>
          <span className="font-bold">เรียน</span>&emsp;นายกสโมสรบุคลากร มหาวิทยาลัยมหาสารคาม
        </p>
        <p className="mt-6 indent-16">
          ด้วย{club} สังกัดสโมสรบุคลากร มหาวิทยาลัยมหาสารคาม ได้มีความเห็นชอบขอเสนอชื่อที่ปรึกษา {club} ประจำปีงบประมาณ {fy} (ตั้งแต่วันที่ ๑ เดือน ตุลาคม
          พ.ศ. {thaiDigits(d.fiscalYear - 1)} ถึงวันที่ ๓๐ เดือน กันยายน พ.ศ. {fy}) ดังนี้
        </p>
        <ol className="mt-4 grid gap-3 pl-24">
          {advisors.map((a, i) => (
            <li key={i}>
              {thaiDigits(i + 1)}. <Fill value={a?.name} /> สังกัด <Fill value={a?.orgUnitName} />
            </li>
          ))}
        </ol>
        <p className="mt-6 indent-16">จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติ</p>
        <div className="mt-6 ml-auto w-1/2">
          <Signature name={president?.name ?? null} role={`ประธาน${club}`} />
        </div>
      </Page>

      {/* คำยินยอมจากที่ปรึกษา */}
      <Page>
        {advisors.map((a, i) => (
          <div key={i} className="mb-10">
            <p className="font-bold underline">คำยินยอมจากที่ปรึกษา</p>
            <p className="indent-16">
              ข้าพเจ้า <Fill value={a?.name} /> มีความยินดีและยินยอมรับเป็นที่ปรึกษาของ {club} ตั้งแต่บัดนี้เป็นต้นไป
            </p>
            <div className="mt-4 ml-auto w-1/2">
              <Signature name={a?.name ?? null} role={`ที่ปรึกษา${club}`} note={consentNote(a)} />
            </div>
          </div>
        ))}
      </Page>

      {/* 3. ประวัติชมรม */}
      <Page>
        <Title>ประวัติ {club}</Title>
        {d.history ? <p className="indent-16 whitespace-pre-line">{d.history}</p> : <p className="text-center">- ไม่มี -</p>}
      </Page>

      {/* 4. ข้อมูลผู้ประสานงาน */}
      <Page>
        <Title>ข้อมูลผู้ประสานงานของ{club}</Title>
        <ol className="grid gap-2">
          {d.committee.map((c, i) => (
            <li key={i} className="grid grid-cols-[2rem_1fr]">
              <span>{thaiDigits(i + 1)}.</span>
              <span>
                ชื่อ <span className="font-bold">{c.name}</span>&emsp;ตำแหน่ง {c.positionTitle}
                <br />
                สถานที่ <Fill value={c.workLocation ?? c.orgUnitName} />
                <br />
                เบอร์โทร <Fill value={c.contactPhone} />
              </span>
            </li>
          ))}
        </ol>
      </Page>

      {/* 5–6. ตราสัญลักษณ์ คำขวัญ ความหมาย และวัตถุประสงค์ */}
      <Page>
        <Title>ตราสัญลักษณ์ของ{club}</Title>
        <div className="mx-auto flex size-[8cm] items-center justify-center border border-black">
          {d.logoFileId ? (
            // eslint-disable-next-line @next/next/no-img-element -- รูปจาก API (ตรวจสิทธิ์แล้ว redirect) next/image ใช้ไม่ได้
            <img src={`${publicEnv.apiUrl}/club-applications/${d.id}/logo?v=${d.logoFileId}`} alt="ตราสัญลักษณ์ชมรม" className="max-h-full max-w-full object-contain p-4" />
          ) : (
            <span>รูปตราสัญลักษณ์ชมรม</span>
          )}
        </div>
        <p className="mt-8 text-center font-bold">คำขวัญ</p>
        <p className="text-center">
          <Fill value={d.motto} />
        </p>
        <p className="mt-6 text-center font-bold">ความหมายของตราสัญลักษณ์</p>
        <p className="indent-16 whitespace-pre-line">{d.logoMeaning ?? DOTS}</p>
        <p className="mt-6 text-center font-bold">วัตถุประสงค์</p>
        <ol className="list-decimal pl-16">
          {d.objectives.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ol>
      </Page>

      {/* 7. ระเบียบข้อบังคับ (ยาวหลายหน้า — เบราว์เซอร์ตัดหน้าให้เอง) */}
      <Page>
        <Regulation text={d.regulationText} />
      </Page>

      {/* 8. รายชื่อคณะกรรมการบริหาร */}
      <Page>
        <Title>รายชื่อคณะกรรมการบริหาร{club}</Title>
        <table>
          <thead>
            <tr className="text-center font-bold">
              <th className="w-12">ที่</th>
              <th>ชื่อ – สกุล</th>
              <th>ตำแหน่ง</th>
              <th>หน่วยงาน</th>
              <th className="w-32">เบอร์ติดต่อ</th>
            </tr>
          </thead>
          <tbody>
            {d.committee.map((c, i) => (
              <tr key={i}>
                <td className="text-center">{thaiDigits(i + 1)}</td>
                <td>{c.name}</td>
                <td className="text-center">{c.positionTitle}</td>
                <td>{c.orgUnitName ?? ''}</td>
                <td>{c.contactPhone ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-16 ml-auto w-1/2">
          <Signature name={president?.name ?? null} role={`ประธาน${club}`} />
        </div>
      </Page>

      {/* 9. ประวัติรายละเอียดคณะกรรมการ */}
      <Page>
        <Title>ประวัติรายละเอียดคณะกรรมการบริหาร{club}</Title>
        <ol className="grid gap-4">
          {d.committee.map((c, i) => (
            <li key={i}>
              <p className="font-bold">
                {thaiDigits(i + 1)}. {c.name} — {c.positionTitle}
              </p>
              <p className="indent-8 whitespace-pre-line">{c.bio ?? `หน่วยงาน ${c.orgUnitName ?? DOTS}`}</p>
            </li>
          ))}
        </ol>
      </Page>

      {/* 10. ประเภท สถานที่ทำการ และแผนงานกิจกรรม */}
      <Page>
        <p>
          <span className="font-bold">ประเภทของชมรม</span> โดยดำเนินกิจกรรมในด้าน (โปรดกาเครื่องหมาย ✓ ในช่อง ☐ ด้านหน้า)
        </p>
        <ul className="mt-2 grid gap-1 pl-10">
          {d.categories.map((c) => (
            <li key={c.code}>
              {c.code === d.categoryCode ? CHECKED : UNCHECKED} {c.nameTh}
              {c.code === d.categoryCode && d.categoryDetail ? ` (${d.categoryDetail})` : ''}
            </li>
          ))}
        </ul>
        <p className="mt-6 font-bold">สถานที่ทำการของชมรม</p>
        <p>
          <Fill value={d.officeLocation} />
        </p>
        <p className="mt-2">
          <span className="font-bold">เบอร์โทรศัพท์ติดต่อ</span> <Fill value={d.contactPhone} />
          &emsp;<span className="font-bold">อีเมลติดต่อ</span> <Fill value={d.contactEmail} />
        </p>
        <p className="mt-10 mb-4 text-center font-bold">แผนงานกิจกรรมของ{club}</p>
        <table>
          <thead>
            <tr className="text-center font-bold">
              <th className="w-36">วันที่</th>
              <th className="w-28">เวลา</th>
              <th>กิจกรรม</th>
              <th className="w-32">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {d.activities.map((a, i) => (
              <tr key={i}>
                <td>{a.activityDate ? thaiLongDate(a.activityDate) : ''}</td>
                <td>{a.activityTime ?? ''}</td>
                <td>{a.title}</td>
                <td>{a.note ?? ''}</td>
              </tr>
            ))}
            {d.activities.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center">
                  -
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Page>

      {/* 11. รายชื่อสมาชิก (ระบบไม่เก็บเบอร์โทรสมาชิก — เว้นช่องไว้เขียนเอง) */}
      <Page>
        <Title>รายชื่อสมาชิกของ{club}</Title>
        <table>
          <thead>
            <tr className="text-center font-bold">
              <th className="w-12">ที่</th>
              <th>ชื่อ-สกุล</th>
              <th>หน่วยงาน</th>
              <th className="w-36">เบอร์โทรศัพท์</th>
            </tr>
          </thead>
          <tbody>
            {d.members.map((m, i) => (
              <tr key={i}>
                <td className="text-center">{thaiDigits(i + 1)}</td>
                <td>{m.name}</td>
                <td>{m.orgUnitName ?? ''}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-16 ml-auto w-1/2">
          <Signature name={president?.name ?? null} role={`ประธาน${club}`} />
        </div>
      </Page>
    </div>
  );
}

import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { Icon, LogoMark, type IconName } from '@/components/ui/icons';
import type { PublicStats } from '@/lib/public-types';

// คำอธิบายประเภทชมรม (ตามรหัสใน club_categories) — ไม่รู้จักรหัส = แสดงเฉพาะชื่อ
const CATEGORY_HINTS: Record<string, string> = {
  academic: 'วิจัย นวัตกรรม ภาษา และการเรียนรู้ร่วมกัน',
  ethics_culture: 'ดนตรี นาฏศิลป์ ศาสนา และสืบสานวัฒนธรรม',
  volunteer: 'จิตอาสา พัฒนาชุมชน และช่วยเหลือสังคม',
  health_sports: 'กีฬา การออกกำลังกาย และนันทนาการ',
  other: 'ความสนใจอื่น ๆ เช่น ถ่ายภาพ ศิลปะ งานฝีมือ',
};

// ใช้เมื่อโหลดตัวเลขไม่ได้: แสดงประเภทชมรมโดยไม่มีจำนวน (ชื่อตรงกับข้อมูลตั้งต้นใน migration)
const DEFAULT_CATEGORIES: { code: string; nameTh: string; clubCount: number | null }[] = [
  { code: 'academic', nameTh: 'ด้านวิชาการ', clubCount: null },
  { code: 'ethics_culture', nameTh: 'ด้านคุณธรรมและจริยธรรม และศิลปวัฒนธรรม', clubCount: null },
  { code: 'volunteer', nameTh: 'ด้านบำเพ็ญประโยชน์', clubCount: null },
  { code: 'health_sports', nameTh: 'ด้านสุขภาพ กีฬาและนันทนาการ', clubCount: null },
  { code: 'other', nameTh: 'ด้านอื่น ๆ', clubCount: null },
];

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'scroll', title: 'จัดตั้งและต่อทะเบียนออนไลน์', body: 'กรอกคำขอ เชิญที่ปรึกษายินยอมในระบบ ติดตามสถานะการตรวจและอนุมัติได้ตลอด ไม่ต้องเดินเอกสาร' },
  { icon: 'users', title: 'สมาชิกและคณะกรรมการ', body: 'รับสมัครสมาชิก อนุมัติ/ลาออก และบันทึกการเปลี่ยนแปลงกรรมการพร้อมประวัติย้อนหลัง' },
  { icon: 'calendar', title: 'แผน กิจกรรม และรายงาน', body: 'วางแผนกิจกรรมประจำปี บันทึกผู้เข้าร่วม ส่งรายงานรายเดือนถึงที่ปรึกษา และรายงานประจำปีถึงสโมสร' },
  { icon: 'award', title: 'คลังผลงานของชมรม', body: 'สมาชิกบันทึกผลงานของตนเอง กรรมการชมรมรับรอง แล้วผลงานจะเป็นประวัติของชมรมและของบุคคล' },
  { icon: 'leaf', title: 'ส่วนขยายสำหรับชมรมกีฬา', body: 'ทะเบียนนักกีฬา ผลและสถิติการแข่งขัน ใช้ประกอบการคัดเลือกตัวแทนและรางวัลเชิดชูเกียรติอย่างโปร่งใส' },
  { icon: 'inbox', title: 'เอกสารพร้อมพิมพ์', body: 'ออกชุดเอกสารจัดตั้งชมรม รายงาน และประกาศผลตามแบบฟอร์มของสโมสร บันทึกเป็น PDF ได้ทันที' },
];

const STEPS: { title: string; body: string }[] = [
  { title: 'เตรียมข้อมูลชมรม', body: 'ชื่อ วัตถุประสงค์ ระเบียบ คณะกรรมการ และรายชื่อสมาชิกอย่างน้อย 5 คน' },
  { title: 'ที่ปรึกษายินยอม', body: 'เสนอชื่อที่ปรึกษา 1–2 คน ที่ปรึกษากดยินยอมผ่านระบบได้เลย' },
  { title: 'ยื่นคำขอ', body: 'ส่งคำขอถึงสโมสรบุคลากร และติดตามสถานะได้ทุกขั้น' },
  { title: 'สโมสรตรวจสอบ', body: 'เจ้าหน้าที่สโมสรตรวจความครบถ้วน หรือส่งกลับให้แก้ไข' },
  { title: 'นายกสโมสรอนุมัติ', body: 'ชมรมเปิดใช้งานทันที พร้อมรับสมาชิกและบันทึกกิจกรรม' },
];

const AUDIENCES: { title: string; items: string[] }[] = [
  { title: 'บุคลากร', items: ['ค้นหาและสมัครเป็นสมาชิกชมรม', 'ยื่นขอจัดตั้งชมรมใหม่', 'บันทึกและติดตามผลงานของตนเอง'] },
  { title: 'กรรมการชมรม', items: ['ดูแลสมาชิกและคณะกรรมการ', 'บันทึกกิจกรรม ส่งรายงาน', 'รับรองผลงานของสมาชิก'] },
  { title: 'ที่ปรึกษาชมรม', items: ['ยินยอมเป็นที่ปรึกษาผ่านระบบ', 'รับทราบรายงานประจำเดือน', 'ติดตามความเคลื่อนไหวของชมรม'] },
  { title: 'สโมสรบุคลากร', items: ['ตรวจและอนุมัติคำขอจัดตั้ง/ต่อทะเบียน', 'รับทราบรายงานประจำปี', 'เห็นภาพรวมของทุกชมรม'] },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'ใครเข้าใช้งานได้บ้าง', a: 'ผู้ที่มีบัญชี Google ของมหาวิทยาลัย (@msu.ac.th) เข้าสู่ระบบได้ ฟังก์ชันชมรมออกแบบสำหรับบุคลากรของมหาวิทยาลัย ระบบจะแยกประเภทบัญชีให้อัตโนมัติ' },
  { q: 'ต้องตั้งรหัสผ่านใหม่หรือไม่', a: 'ไม่ต้อง ระบบใช้การเข้าสู่ระบบด้วยบัญชี Google ของมหาวิทยาลัยเท่านั้น จึงไม่มีรหัสผ่านแยกให้ต้องจำ' },
  { q: 'จัดตั้งชมรมใหม่ต้องมีอะไรบ้าง', a: 'คณะกรรมการชมรม สมาชิกอย่างน้อย 5 คน และที่ปรึกษา 1–2 คนที่ยินยอม ชมรมต้องต่อทะเบียนทุกปีงบประมาณ (สิ้นสุด 30 กันยายน)' },
  { q: 'ข้อมูลส่วนบุคคลของฉันปลอดภัยไหม', a: 'ระบบเก็บข้อมูลเท่าที่จำเป็นตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล ข้อมูลภายในชมรมเห็นเฉพาะผู้มีสิทธิ์ และหน้านี้แสดงเพียงตัวเลขรวมเท่านั้น' },
];

function SectionTitle({ eyebrow, title, id }: { eyebrow: string; title: string; id?: string }) {
  return (
    <div id={id} className="mb-6 scroll-mt-20 sm:mb-8">
      <p className="text-xs font-medium tracking-[0.18em] text-matcha-600 uppercase">{eyebrow}</p>
      <h2 className="mt-2 font-serif text-2xl leading-snug font-medium text-ink sm:text-3xl">{title}</h2>
    </div>
  );
}

// หน้าแรกสำหรับผู้ที่ยังไม่ได้เข้าสู่ระบบ: แนะนำระบบ + ตัวเลขสรุป (public) + ปุ่มเข้าสู่ระบบ
export function Landing({ stats }: { stats: PublicStats | null }) {
  const numbers = stats
    ? ([
        ['ชมรมที่เปิดดำเนินการ', stats.activeClubs, 'ชมรม'],
        ['สมาชิกชมรม', stats.members, 'คน'],
        ['กิจกรรมในปีงบประมาณนี้', stats.activities, 'กิจกรรม'],
        ['ผลงานที่ได้รับการรับรอง', stats.achievements, 'รายการ'],
      ] as const)
    : null;

  return (
    <div className="min-h-dvh bg-washi text-ink">
      {/* แถบบน */}
      <header className="sticky top-0 z-10 border-b border-ink/[0.08] bg-washi">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <LogoMark className="size-9 shrink-0" />
            <span className="truncate font-serif text-[0.95rem] font-medium sm:text-base">ระบบบริหารจัดการชมรมบุคลากร</span>
          </Link>
          <Link href="/login" className={buttonClass('primary', '!min-h-10 shrink-0 text-sm')}>
            เข้าสู่ระบบ
          </Link>
        </div>
      </header>

      <main>
        {/* ส่วนเปิด */}
        <section className="relative overflow-hidden bg-matcha-800 text-washi">
          <svg viewBox="0 0 200 200" aria-hidden="true" className="pointer-events-none absolute -top-16 -right-24 size-[28rem] text-matcha-700 sm:size-[36rem]">
            <path d="M150 48A70 70 0 1 0 168 110" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
          </svg>
          <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <p className="text-sm text-matcha-100">สโมสรบุคลากร มหาวิทยาลัยมหาสารคาม</p>
            <h1 className="mt-4 max-w-3xl font-serif text-3xl leading-snug font-medium sm:text-5xl sm:leading-tight">
              พื้นที่ของชมรมบุคลากร
              <br />
              ตั้งแต่จัดตั้ง จนถึงผลงาน
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-matcha-50 sm:text-lg">
              ระบบเดียวสำหรับทุกชมรม ทั้งกีฬา ดนตรี วิชาการ จิตอาสา และอีกหลากหลาย ยื่นขอจัดตั้ง ดูแลสมาชิก บันทึกกิจกรรม ส่งรายงาน และเก็บผลงานของชมรมไว้ในที่เดียว
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className={buttonClass('secondary', '!min-h-12 !border-transparent !bg-washi px-6 !text-matcha-900 hover:!bg-cream')}>
                เข้าสู่ระบบด้วยบัญชี @msu.ac.th
                <Icon name="arrowRight" className="size-[1.125rem]" />
              </Link>
              <a href="#features" className="btn !min-h-12 border border-matcha-200 px-6 text-washi hover:bg-matcha-700">
                ระบบทำอะไรได้บ้าง
              </a>
            </div>
          </div>
        </section>

        {/* ตัวเลขสรุป (ซ่อนถ้าโหลดไม่ได้) */}
        {numbers && stats && (
          <section aria-labelledby="stats-title" className="border-b border-ink/[0.08] bg-cream">
            <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
              <h2 id="stats-title" className="text-sm text-stone">
                ภาพรวมชมรมบุคลากร · ปีงบประมาณ {stats.fiscalYear}
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {numbers.map(([label, value, unit]) => (
                  <div key={label} className="rounded-bento border border-ink/[0.10] bg-white p-4 sm:p-6">
                    <dt className="text-[0.8125rem] font-medium text-stone sm:text-sm">{label}</dt>
                    <dd className="mt-2 flex items-baseline gap-1.5">
                      <span className="font-serif text-3xl font-medium text-matcha-800 tabular-nums sm:text-4xl">{value.toLocaleString('th-TH')}</span>
                      <span className="text-sm text-stone">{unit}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        )}

        {/* ความสามารถของระบบ */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionTitle id="features" eyebrow="Features" title="ทุกงานของชมรม ในระบบเดียว" />
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="bento p-5 sm:p-6">
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-matcha-50 text-matcha-700">
                  <Icon name={f.icon} className="size-5" />
                </span>
                <h3 className="mt-4 font-serif text-lg font-medium">{f.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-stone">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ประเภทชมรม */}
        <section className="border-y border-ink/[0.08] bg-cream">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <SectionTitle eyebrow="Club types" title="ชมรมหลากหลาย ตามความสนใจของบุคลากร" />
            <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-5">
              {(stats?.categories ?? DEFAULT_CATEGORIES).map((c) => (
                <li key={c.code} className="flex flex-col rounded-bento border border-ink/[0.10] bg-white p-5">
                  <p className="font-medium leading-snug">{c.nameTh}</p>
                  {CATEGORY_HINTS[c.code] && <p className="mt-2 text-sm leading-relaxed text-stone">{CATEGORY_HINTS[c.code]}</p>}
                  {c.clubCount !== null && (
                    <p className="mt-auto pt-4 text-sm text-matcha-700">
                      <span className="font-serif text-2xl font-medium tabular-nums">{c.clubCount.toLocaleString('th-TH')}</span> ชมรม
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ขั้นตอนจัดตั้ง */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionTitle eyebrow="How it works" title="อยากตั้งชมรม? 5 ขั้นตอนผ่านระบบ" />
          <ol className="grid gap-3 sm:gap-4 md:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="bento p-5">
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-matcha-800 font-serif text-washi">{i + 1}</span>
                <h3 className="mt-4 font-medium">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-stone">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ผู้ใช้แต่ละกลุ่ม */}
        <section className="border-y border-ink/[0.08] bg-cream">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <SectionTitle eyebrow="For everyone" title="ใช้งานได้ตามบทบาทของคุณ" />
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {AUDIENCES.map((g) => (
                <article key={g.title} className="rounded-bento border border-ink/[0.10] bg-white p-5 sm:p-6">
                  <h3 className="font-serif text-lg font-medium">{g.title}</h3>
                  <ul className="mt-3 grid gap-2">
                    {g.items.map((item) => (
                      <li key={item} className="flex gap-2 text-[0.9375rem] leading-relaxed text-stone">
                        <Icon name="check" className="mt-1 size-4 shrink-0 text-matcha-600" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* คำถามที่พบบ่อย */}
        <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionTitle eyebrow="FAQ" title="คำถามที่พบบ่อย" />
          <div className="grid gap-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group bento p-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-medium">
                  {f.q}
                  <Icon name="plus" className="size-5 shrink-0 text-matcha-700 transition group-open:rotate-45" />
                </summary>
                <p className="px-5 pb-5 leading-relaxed text-stone">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ปิดท้าย */}
        <section className="px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 rounded-bento bg-matcha-800 p-8 text-washi sm:flex-row sm:items-center sm:justify-between sm:p-12">
            <div>
              <h2 className="font-serif text-2xl leading-snug font-medium sm:text-3xl">พร้อมเริ่มใช้งานแล้วหรือยัง</h2>
              <p className="mt-2 text-matcha-50">เข้าสู่ระบบด้วยบัญชี Google ของมหาวิทยาลัย ไม่ต้องสมัครสมาชิกเพิ่ม</p>
            </div>
            <Link href="/login" className={buttonClass('secondary', '!min-h-12 shrink-0 !border-transparent !bg-washi px-6 !text-matcha-900 hover:!bg-cream')}>
              เข้าสู่ระบบ
              <Icon name="arrowRight" className="size-[1.125rem]" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink/[0.08] bg-cream">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-stone sm:flex-row sm:justify-between sm:px-6">
          <p>สโมสรบุคลากร มหาวิทยาลัยมหาสารคาม</p>
          <p>ระบบบริหารจัดการชมรมบุคลากร</p>
        </div>
      </footer>
    </div>
  );
}

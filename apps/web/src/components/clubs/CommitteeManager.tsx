'use client';

import { useState } from 'react';
import { useSave } from '@/components/club-applications/useSave';

interface Person {
  userId: string;
  name: string;
}

interface CommitteeManagerProps {
  clubId: string;
  // สมาชิกที่แต่งตั้งเป็นกรรมการได้ (ยังไม่เป็นกรรมการ และไม่ใช่ตัวเอง)
  appointable: Person[];
  // สมาชิกที่รับโอนตำแหน่งประธานได้ (ไม่ใช่ประธานปัจจุบัน และไม่ใช่ตัวเอง)
  transferable: Person[];
  positions: { code: string; nameTh: string }[];
}

type Mode = 'closed' | 'appoint' | 'transfer';

// แต่งตั้งกรรมการ / โอนตำแหน่งประธาน (เมนูแสดงตามสิทธิ์เพื่อ UX เท่านั้น API ตรวจสิทธิ์จริง)
export function CommitteeManager({ clubId, appointable, transferable, positions }: CommitteeManagerProps) {
  const [mode, setMode] = useState<Mode>('closed');

  if (mode === 'closed') {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setMode('appoint')} className="btn btn-primary !min-h-10 text-sm">
          แต่งตั้งกรรมการ
        </button>
        <button type="button" onClick={() => setMode('transfer')} className="btn btn-secondary !min-h-10 text-sm">
          โอนตำแหน่งประธาน
        </button>
      </div>
    );
  }
  return mode === 'appoint' ? (
    <AppointForm clubId={clubId} people={appointable} positions={positions} onClose={() => setMode('closed')} />
  ) : (
    <TransferForm clubId={clubId} people={transferable} onClose={() => setMode('closed')} />
  );
}

function PersonSelect({ people, value, onChange, label }: { people: Person[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-stone">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field !min-h-10 text-sm">
        <option value="">— เลือกสมาชิก —</option>
        {people.map((p) => (
          <option key={p.userId} value={p.userId}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function AppointForm({
  clubId,
  people,
  positions,
  onClose,
}: {
  clubId: string;
  people: Person[];
  positions: { code: string; nameTh: string }[];
  onClose: () => void;
}) {
  const { save, pending, error } = useSave();
  const [userId, setUserId] = useState('');
  const [positionCode, setPositionCode] = useState(positions[0]?.code ?? '');
  const [positionTitle, setPositionTitle] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [note, setNote] = useState('');

  async function submit() {
    const ok = await save('POST', `/clubs/${clubId}/committee`, {
      userId,
      positionCode,
      positionTitle: positionTitle || null,
      contactPhone: contactPhone || null,
      note: note || null,
    });
    if (ok) onClose();
  }

  return (
    <div className="grid gap-3 rounded-xl border border-ink/[0.08] bg-cream p-4">
      <p className="font-medium">แต่งตั้งกรรมการ</p>
      {people.length === 0 ? (
        <p className="text-sm text-stone">ไม่มีสมาชิกที่แต่งตั้งได้ (ผู้ที่จะเป็นกรรมการต้องเป็นสมาชิกชมรมและยังไม่ได้เป็นกรรมการ)</p>
      ) : (
        <>
          <PersonSelect people={people} value={userId} onChange={setUserId} label="สมาชิก" />
          <label className="grid gap-1 text-sm">
            <span className="text-stone">ตำแหน่ง</span>
            <select value={positionCode} onChange={(e) => setPositionCode(e.target.value)} className="field !min-h-10 text-sm">
              {positions.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.nameTh}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-stone">ชื่อตำแหน่งที่แสดง (ถ้าไม่กรอก ใช้ชื่อตำแหน่งมาตรฐาน)</span>
            <input value={positionTitle} onChange={(e) => setPositionTitle(e.target.value)} maxLength={100} placeholder="เช่น ฝ่ายสวัสดิการ" className="field !min-h-10 text-sm" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-stone">เบอร์ติดต่อ (ถ้ามี แสดงเฉพาะกรรมการ/ผู้ดูแล)</span>
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={50} inputMode="tel" className="field !min-h-10 text-sm" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-stone">หมายเหตุ (ถ้ามี)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="เช่น ผลการเลือกตั้งครั้งที่ ..." className="field !min-h-10 text-sm" />
          </label>
        </>
      )}
      {error && <p role="alert" className="text-sm text-beni">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {people.length > 0 && (
          <button type="button" disabled={pending || !userId || !positionCode} onClick={submit} className="btn btn-primary !min-h-10 text-sm">
            {pending ? 'กำลังบันทึก...' : 'ยืนยันแต่งตั้ง'}
          </button>
        )}
        <button type="button" onClick={onClose} className="btn btn-ghost !min-h-10 text-sm">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

function TransferForm({ clubId, people, onClose }: { clubId: string; people: Person[]; onClose: () => void }) {
  const { save, pending, error } = useSave();
  const [userId, setUserId] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  async function submit() {
    const ok = await save('POST', `/clubs/${clubId}/committee/transfer-presidency`, {
      userId,
      contactPhone: contactPhone || null,
      note: note || null,
    });
    if (ok) onClose();
  }

  return (
    <div className="grid gap-3 rounded-xl border border-kin/30 bg-cream p-4">
      <p className="font-medium">โอนตำแหน่งประธานชมรม</p>
      <p className="text-sm text-stone">
        ประธานคนปัจจุบันจะพ้นตำแหน่งทันทีและเป็นสมาชิกต่อไป ผู้รับโอนจะเป็นประธานแทน (ถ้าดำรงตำแหน่งกรรมการอื่นอยู่ ตำแหน่งเดิมจะสิ้นสุด)
      </p>
      {people.length === 0 ? (
        <p className="text-sm text-stone">ไม่มีสมาชิกที่รับโอนตำแหน่งได้</p>
      ) : (
        <>
          <PersonSelect people={people} value={userId} onChange={setUserId} label="ประธานคนใหม่" />
          <label className="grid gap-1 text-sm">
            <span className="text-stone">เบอร์ติดต่อของประธานคนใหม่ (ถ้ามี)</span>
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={50} inputMode="tel" className="field !min-h-10 text-sm" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-stone">หมายเหตุ (ถ้ามี)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="เช่น ผลการเลือกตั้งครั้งที่ ..." className="field !min-h-10 text-sm" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-4 accent-matcha-700" />
            <span>ยืนยันการโอนตำแหน่ง (สิทธิ์จัดการของประธานคนเดิมจะหมดทันที)</span>
          </label>
        </>
      )}
      {error && <p role="alert" className="text-sm text-beni">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {people.length > 0 && (
          <button type="button" disabled={pending || !userId || !confirmed} onClick={submit} className="btn btn-primary !min-h-10 text-sm">
            {pending ? 'กำลังบันทึก...' : 'โอนตำแหน่ง'}
          </button>
        )}
        <button type="button" onClick={onClose} className="btn btn-ghost !min-h-10 text-sm">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

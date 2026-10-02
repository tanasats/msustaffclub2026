import { ActionButton } from '@/components/club-applications/ActionButton';
import { Bento, BentoLabel } from '@/components/ui/Bento';
import type { ClubPage } from '@/lib/club-types';
import { formatTimestampDate } from '@/lib/format';

interface MembershipPanelProps {
  club: ClubPage;
  // บัญชีบุคลากรเท่านั้นที่สมัครได้ (ยังไม่เปิดให้นิสิต) — API ตรวจซ้ำเสมอ
  eligible: boolean;
  // ผู้ใช้เป็นประธานชมรม (ประธานพ้นตำแหน่งได้ด้วยการโอนตำแหน่งเท่านั้น) — เพื่อเลือกข้อความ/ปุ่ม API ตรวจซ้ำเสมอ
  isPresident: boolean;
}

// การเป็นสมาชิกของผู้ใช้ปัจจุบัน: สมัคร / ยกเลิกใบสมัคร / ลาออก ตามสถานะ
export function MembershipPanel({ club, eligible, isPresident }: MembershipPanelProps) {
  const base = `/clubs/${club.id}/membership`;
  const status = club.me.membershipStatus;
  const isCommittee = club.me.positions.length > 0;

  let content: React.ReactNode;
  if (club.status !== 'active') {
    content = <p className="text-sm text-stone">ชมรมนี้ไม่ได้ดำเนินการอยู่ จึงไม่เปิดรับสมาชิก</p>;
  } else if (status === 'active') {
    content = (
      <>
        <p className="font-serif text-lg font-medium text-matcha-800">คุณเป็นสมาชิกชมรมนี้</p>
        {isPresident ? (
          <p className="mt-2 text-sm text-stone">คุณเป็นประธานชมรม หากต้องการพ้นตำแหน่ง ให้โอนตำแหน่งประธานให้สมาชิกคนอื่นก่อน</p>
        ) : isCommittee ? (
          <>
            <p className="mt-2 text-sm text-stone">คุณเป็นกรรมการ หากต้องการลาออกจากชมรม ต้องลาออกจากตำแหน่งกรรมการก่อน</p>
            <div className="mt-3">
              <ActionButton path={`/clubs/${club.id}/committee/resign`} label="ลาออกจากตำแหน่งกรรมการ" note="optional" tone="neutral" />
            </div>
          </>
        ) : club.me.resignation ? (
          <div className="mt-3 grid gap-3">
            <p className="rounded-xl border border-kin/20 bg-kin-50 px-3 py-2 text-sm text-kin">
              คุณยื่นลาออกเมื่อ {formatTimestampDate(club.me.resignation.requestedAt)} รอกรรมการรับทราบ — มีผลอัตโนมัติภายใน{' '}
              {formatTimestampDate(club.me.resignation.effectiveAt)}
              <span className="block">เหตุผล: {club.me.resignation.note}</span>
            </p>
            <div>
              <ActionButton path={`${base}/leave/cancel`} label="ยกเลิกคำขอลาออก" tone="neutral" />
            </div>
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            <p className="text-sm text-stone">ยื่นลาออกพร้อมเหตุผล กรรมการรับทราบแล้วมีผลทันที หรือมีผลอัตโนมัติเมื่อครบ 30 วัน</p>
            <div>
              <ActionButton path={`${base}/leave`} label="ยื่นลาออกจากชมรม" note="required" tone="danger" />
            </div>
          </div>
        )}
      </>
    );
  } else if (status === 'pending') {
    content = (
      <>
        <p className="font-serif text-lg font-medium">ส่งใบสมัครแล้ว</p>
        <p className="mt-1 text-sm text-stone">รอคณะกรรมการชมรมพิจารณาอนุมัติ</p>
        <div className="mt-3">
          <ActionButton path={`${base}/withdraw`} label="ยกเลิกใบสมัคร" tone="neutral" />
        </div>
      </>
    );
  } else if (club.me.invitation) {
    content = (
      <>
        <p className="font-serif text-lg font-medium">คุณได้รับคำเชิญเข้าชมรม</p>
        <p className="mt-1 text-sm text-stone">
          {club.me.invitation.invitedByName ?? 'กรรมการชมรม'} เชิญเมื่อ {formatTimestampDate(club.me.invitation.invitedAt)} — ตอบรับแล้วเป็นสมาชิกทันที
        </p>
        {club.me.invitation.note && <p className="mt-2 rounded-xl bg-white px-3 py-2 text-sm">“{club.me.invitation.note}”</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton path={`${base}/invitation`} body={{ decision: 'accept' }} label="ตอบรับคำเชิญ" />
          <ActionButton path={`${base}/invitation`} body={{ decision: 'decline' }} label="ปฏิเสธ" tone="neutral" />
        </div>
      </>
    );
  } else if (!eligible) {
    content = <p className="text-sm text-stone">ขณะนี้ชมรมเปิดรับสมัครเฉพาะบุคลากรของมหาวิทยาลัย</p>;
  } else {
    content = (
      <>
        {club.me.rejection && (
          <p className="mb-3 rounded-xl border border-kin/20 bg-kin-50 px-3 py-2 text-sm text-kin">
            ใบสมัครครั้งล่าสุดไม่ได้รับอนุมัติ
            {club.me.rejection.note && <span className="block">เหตุผล: {club.me.rejection.note}</span>}
          </p>
        )}
        <p className="text-sm text-stone">สมัครแล้วรอคณะกรรมการชมรมอนุมัติ ไม่ต้องแนบเอกสาร (ระบบยืนยันตัวตนจากบัญชีมหาวิทยาลัย)</p>
        <div className="mt-3">
          <ActionButton path={base} label="สมัครเป็นสมาชิก" />
        </div>
      </>
    );
  }

  return (
    <Bento tone="cream">
      <BentoLabel className="mb-2">การเป็นสมาชิก</BentoLabel>
      {content}
    </Bento>
  );
}

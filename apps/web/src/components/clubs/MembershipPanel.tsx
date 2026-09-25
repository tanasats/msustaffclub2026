import { ActionButton } from '@/components/club-applications/ActionButton';
import { Bento, BentoLabel } from '@/components/ui/Bento';
import type { ClubPage } from '@/lib/club-types';

interface MembershipPanelProps {
  club: ClubPage;
  // บัญชีบุคลากรเท่านั้นที่สมัครได้ (ยังไม่เปิดให้นิสิต) — API ตรวจซ้ำเสมอ
  eligible: boolean;
}

// การเป็นสมาชิกของผู้ใช้ปัจจุบัน: สมัคร / ยกเลิกใบสมัคร / ลาออก ตามสถานะ
export function MembershipPanel({ club, eligible }: MembershipPanelProps) {
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
        {isCommittee ? (
          <p className="mt-2 text-sm text-stone">คุณเป็นกรรมการ หากต้องการลาออกจากชมรม ต้องพ้นจากตำแหน่งกรรมการก่อน</p>
        ) : (
          <div className="mt-3">
            <ActionButton path={`${base}/leave`} label="ลาออกจากชมรม" note="optional" tone="danger" />
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
  } else if (!eligible) {
    content = <p className="text-sm text-stone">ขณะนี้ชมรมเปิดรับสมัครเฉพาะบุคลากรของมหาวิทยาลัย</p>;
  } else {
    content = (
      <>
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

import { STAFF_AUDIENCE_LABELS, type BroadcastItem } from '@/lib/broadcast-types';
import { formatDateTime } from '@/lib/format';

// ประวัติข้อความที่ส่งแล้ว (แก้/ลบไม่ได้) — กดหัวข้อเพื่ออ่านข้อความเต็ม
export function BroadcastHistory({ items }: { items: BroadcastItem[] }) {
  if (items.length === 0) return <p className="text-sm text-stone">ยังไม่เคยส่งข้อความ</p>;
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-ink/[0.08] bg-white p-4">
          <details>
            <summary className="cursor-pointer">
              <span className="font-medium text-ink">{item.title}</span>
              <span className="mt-1 block text-sm text-stone">
                {formatDateTime(item.createdAt)} · {item.senderName ?? '—'} · ถึง{' '}
                {item.audience === 'club'
                  ? 'สมาชิกชมรม'
                  : item.audience === 'org_units'
                    ? item.orgUnitNames.join(', ')
                    : item.audience === 'individual'
                      ? (item.recipientName ?? 'รายบุคคล')
                      : STAFF_AUDIENCE_LABELS[item.audience]}{' '}
                ({item.recipientCount.toLocaleString('th-TH')} คน)
              </span>
            </summary>
            <p className="mt-3 border-t border-ink/[0.06] pt-3 text-sm whitespace-pre-line text-ink">{item.body}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}

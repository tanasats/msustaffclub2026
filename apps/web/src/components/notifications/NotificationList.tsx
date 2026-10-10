'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiSend } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import type { NotificationItem } from '@/lib/notification-types';

// รายการแจ้งเตือน: กดแล้วทำเครื่องหมายอ่านแล้ว และไปหน้าที่เกี่ยวข้อง (อ่านไม่สำเร็จก็ยังไปหน้านั้นได้)
export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);

  async function open(item: NotificationItem) {
    setOpening(item.id);
    if (!item.readAt) await apiSend('POST', `/me/notifications/${item.id}/read`, {});
    router.push(item.linkPath);
    router.refresh();
  }

  return (
    <ul className="grid gap-2">
      {items.map((item) => {
        const unread = !item.readAt;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => open(item)}
              disabled={opening === item.id}
              className={`flex w-full gap-3 rounded-bento border p-4 text-left transition hover:border-matcha-300 sm:p-5 ${
                unread ? 'border-matcha-200 bg-white' : 'border-ink/[0.08] bg-washi'
              }`}
            >
              <span aria-hidden="true" className={`mt-2 size-2.5 shrink-0 rounded-full ${unread ? 'bg-beni' : 'bg-transparent'}`} />
              <span className="min-w-0 flex-1">
                <span className={`block text-[0.9375rem] ${unread ? 'font-semibold text-ink' : 'text-ink'}`}>
                  {item.title}
                  {unread && <span className="sr-only"> (ยังไม่อ่าน)</span>}
                </span>
                <span className="mt-1 block text-sm whitespace-pre-line text-stone">{item.body}</span>
                <span className="mt-2 block text-xs text-stone">{formatDateTime(item.createdAt)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

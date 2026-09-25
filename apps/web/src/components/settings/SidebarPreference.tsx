'use client';

import { setSidebarCollapsed, useSidebarCollapsed } from '@/lib/sidebar-preference';

// สวิตช์ย่อเมนูด้านข้าง (จำไว้ในเครื่องนี้)
export function SidebarPreference() {
  const collapsed = useSidebarCollapsed();
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <span id="sidebar-pref-label">
        <span className="block text-[0.9375rem] text-ink">ย่อเมนูด้านข้าง</span>
        <span className="block text-sm text-stone">แสดงเฉพาะไอคอนบนหน้าจอขนาดใหญ่</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={collapsed}
        aria-labelledby="sidebar-pref-label"
        onClick={() => setSidebarCollapsed(!collapsed)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${collapsed ? 'bg-matcha-700' : 'bg-ink/15'}`}
      >
        <span className={`inline-block size-5 rounded-full bg-white shadow transition ${collapsed ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

'use client';

import { useSyncExternalStore } from 'react';

// กลุ่มเมนูที่ผู้ใช้ย่อไว้ จำใน localStorage (รูปแบบเดียวกับ sidebar-preference: แจ้งทุก component และแท็บอื่น)
const KEY = 'msu-club:nav-groups-collapsed';
const EVENT = 'msu-club:nav-group-preference';

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// คืนเป็นสตริงเพื่อให้ useSyncExternalStore เทียบค่าได้ (ไม่สร้าง array ใหม่ทุกครั้ง)
function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setNavGroupCollapsed(group: string, collapsed: boolean) {
  const current = new Set(read().split(',').filter(Boolean));
  if (collapsed) current.add(group);
  else current.delete(group);
  try {
    localStorage.setItem(KEY, [...current].join(','));
  } catch {
    // เบราว์เซอร์ที่ปิด storage: ค่าจะไม่ถูกจำ แต่ยังใช้งานได้
  }
  window.dispatchEvent(new Event(EVENT));
}

// ชื่อกลุ่มที่ย่ออยู่ (ฝั่ง server ถือว่าขยายทุกกลุ่ม)
export function useCollapsedNavGroups(): string[] {
  return useSyncExternalStore(subscribe, read, () => '').split(',').filter(Boolean);
}

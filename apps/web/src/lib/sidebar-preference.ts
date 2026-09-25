'use client';

import { useSyncExternalStore } from 'react';

// ค่าย่อ/ขยาย sidebar จำไว้ใน localStorage และแจ้งทุก component ที่ใช้อยู่ผ่าน event
// (sidebar กับหน้าการตั้งค่าเห็นค่าเดียวกันทันที รวมถึงแท็บอื่นผ่าน storage event)
const KEY = 'msu-club:sidebar-collapsed';
const EVENT = 'msu-club:sidebar-preference';

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setSidebarCollapsed(value: boolean) {
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    // เบราว์เซอร์ที่ปิด storage: ค่าจะไม่ถูกจำ แต่ยังใช้งานได้
  }
  window.dispatchEvent(new Event(EVENT));
}

// ฝั่ง server ถือว่าไม่ย่อ (ค่าจริงอ่านหลัง hydrate)
export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

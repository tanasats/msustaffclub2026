'use client';

import { useEffect, useState } from 'react';
import { apiGetClient } from '@/lib/api-client';
import type { PersonRef } from '@/lib/club-application-types';

interface UserPickerProps {
  // id ที่เลือกไปแล้ว (ไม่แสดงซ้ำในผลค้นหา)
  excludeIds: string[];
  onSelect: (user: PersonRef) => void;
  placeholder?: string;
}

// ค้นหาบุคลากรที่เคย login แล้ว (พิมพ์อย่างน้อย 2 ตัวอักษร รอหยุดพิมพ์ 300ms ก่อนค้น)
export function UserPicker({ excludeIds, onSelect, placeholder = 'ค้นหาชื่อหรืออีเมลบุคลากร' }: UserPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonRef[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    // คำค้นสั้นเกินไม่ต้องค้น (dropdown ถูกซ่อนอยู่แล้ว ผลเดิมจึงไม่แสดง)
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      const data = await apiGetClient<{ items: PersonRef[] }>(`/users/search?q=${encodeURIComponent(q)}`);
      setResults(data?.items ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const visible = results.filter((user) => !excludeIds.includes(user.id));

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      {query.trim().length >= 2 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow">
          {searching && <li className="p-2 text-sm text-slate-500">กำลังค้นหา...</li>}
          {!searching && visible.length === 0 && (
            <li className="p-2 text-sm text-slate-500">ไม่พบ (ผู้ใช้ต้องเคยเข้าสู่ระบบแล้ว)</li>
          )}
          {visible.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(user);
                  setQuery('');
                  setResults([]);
                }}
                className="w-full p-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium">{user.name ?? user.email}</span>
                <span className="block text-xs text-slate-500">
                  {user.email}
                  {user.orgUnitName ? ` · ${user.orgUnitName}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

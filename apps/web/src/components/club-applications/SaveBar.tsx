interface SaveBarProps {
  pending: boolean;
  error: string | null;
  saved: boolean;
  label?: string;
  disabled?: boolean;
}

// ปุ่มบันทึก + สถานะ (ใช้ร่วมกันทุกส่วนของฟอร์ม)
export function SaveBar({ pending, error, saved, label = 'บันทึก', disabled = false }: SaveBarProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending || disabled}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? 'กำลังบันทึก...' : label}
      </button>
      {saved && !error && <span className="text-sm text-green-700">บันทึกแล้ว</span>}
      {error && (
        <span role="alert" className="text-sm text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}

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
        className="btn btn-primary"
      >
        {pending ? 'กำลังบันทึก...' : label}
      </button>
      {saved && !error && <span className="text-sm text-matcha-700">บันทึกแล้ว</span>}
      {error && (
        <span role="alert" className="text-sm text-beni">
          {error}
        </span>
      )}
    </div>
  );
}

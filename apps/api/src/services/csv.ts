/**
 * สร้างไฟล์ CSV (RFC 4180) สำหรับเปิดใน Excel
 * - ใส่ BOM ให้ Excel อ่าน UTF-8 (ภาษาไทย) ถูกต้อง, ขึ้นบรรทัดด้วย CRLF
 * - ครอบทุกช่องด้วย " และ escape " ภายในเป็น ""
 * - กัน CSV/formula injection: ช่องที่ขึ้นต้นด้วย = + - @ tab หรือ CR ใส่ ' นำหน้า (Excel ไม่ตีความเป็นสูตร)
 */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const cell = (value: string | number | null): string => {
    let text = value === null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const lines = [header, ...rows].map((row) => row.map(cell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

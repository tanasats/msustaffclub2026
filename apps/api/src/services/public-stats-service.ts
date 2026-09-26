import { getPublicTotals, listPublicCategoryCounts } from '../repositories/public-stats-repository.js';
import { fiscalYearOf, fiscalYearRange } from './fiscal-year.js';

// public: ตัวเลขสรุปของระบบสำหรับหน้า landing — เฉพาะจำนวนรวม ไม่มีชื่อหรือข้อมูลรายบุคคล (PDPA)
export async function getPublicStats() {
  const fiscalYear = fiscalYearOf();
  const { start, end } = fiscalYearRange(fiscalYear);
  const [totals, categories] = await Promise.all([getPublicTotals(start, end), listPublicCategoryCounts()]);
  return { fiscalYear, ...totals, categories };
}

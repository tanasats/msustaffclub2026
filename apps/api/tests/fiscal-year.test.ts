import { describe, expect, it } from 'vitest';
import { bangkokDateString, fiscalYearOf, fiscalYearRange, toThaiDigits } from '../src/services/fiscal-year.js';

describe('ปีงบประมาณ (ตามเวลาประเทศไทย)', () => {
  it('30 ก.ย. 2569 เวลา 23:59 น. (ไทย) ยังเป็นปีงบ 2569', () => {
    expect(fiscalYearOf(new Date('2026-09-30T16:59:59Z'))).toBe(2569);
  });

  it('1 ต.ค. 2569 เวลา 00:00 น. (ไทย) เป็นปีงบ 2570 แม้เวลา UTC ยังเป็น 30 ก.ย.', () => {
    expect(fiscalYearOf(new Date('2026-09-30T17:00:00Z'))).toBe(2570);
    expect(bangkokDateString(new Date('2026-09-30T17:00:00Z'))).toBe('2026-10-01');
  });

  it('ช่วงวันของปีงบประมาณ 2570 = 2026-10-01 ถึง 2027-09-30', () => {
    expect(fiscalYearRange(2570)).toEqual({ start: '2026-10-01', end: '2027-09-30' });
  });

  it('แปลงเลขไทย', () => {
    expect(toThaiDigits(2569)).toBe('๒๕๖๙');
  });
});

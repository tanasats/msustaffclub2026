import { findPreferences, upsertPreferences, type FontScale, type UserPreferences } from '../repositories/preferences-repository.js';

export const FONT_SCALES = ['sm', 'md', 'lg', 'xl'] as const satisfies readonly FontScale[];
// ค่าเริ่มต้นของทุกคน: ตัวอักษรปกติ และรับอีเมลแจ้งเตือน
export const DEFAULT_PREFERENCES: UserPreferences = { fontScale: 'md', emailNotifications: true };

export async function getPreferences(userId: string): Promise<UserPreferences> {
  return (await findPreferences(userId)) ?? DEFAULT_PREFERENCES;
}

// แก้เฉพาะค่าที่ส่งมา (ค่าอื่นคงเดิม)
export async function updatePreferences(
  userId: string,
  changes: { fontScale?: FontScale; emailNotifications?: boolean },
): Promise<UserPreferences> {
  return upsertPreferences(userId, changes);
}

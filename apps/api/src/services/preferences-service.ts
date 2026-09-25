import { findPreferences, upsertFontScale, type FontScale, type UserPreferences } from '../repositories/preferences-repository.js';

export const FONT_SCALES = ['sm', 'md', 'lg', 'xl'] as const satisfies readonly FontScale[];
export const DEFAULT_PREFERENCES: UserPreferences = { fontScale: 'md' };

export async function getPreferences(userId: string): Promise<UserPreferences> {
  return (await findPreferences(userId)) ?? DEFAULT_PREFERENCES;
}

export async function updatePreferences(userId: string, changes: { fontScale: FontScale }): Promise<UserPreferences> {
  return upsertFontScale(userId, changes.fontScale);
}

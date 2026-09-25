import { Badge } from '@/components/ui/Badge';
import { STATUS_LABELS, type AchievementStatus } from '@/lib/achievement-types';

const TONES = {
  pending: 'sky',
  approved: 'matcha',
  returned: 'kin',
  rejected: 'beni',
  withdrawn: 'neutral',
} as const satisfies Record<AchievementStatus, 'neutral' | 'matcha' | 'kin' | 'beni' | 'sky'>;

export function AchievementStatusBadge({ status }: { status: AchievementStatus }) {
  return <Badge tone={TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

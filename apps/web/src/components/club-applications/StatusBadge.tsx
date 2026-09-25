import { Badge } from '@/components/ui/Badge';
import { STATUS_LABELS, type ApplicationStatus } from '@/lib/club-application-types';

const STATUS_TONES = {
  draft: 'neutral',
  awaiting_consent: 'sky',
  submitted: 'sky',
  returned: 'kin',
  reviewed: 'sky',
  approved: 'matcha',
  rejected: 'beni',
  cancelled: 'neutral',
} as const satisfies Record<ApplicationStatus, 'neutral' | 'matcha' | 'kin' | 'beni' | 'sky'>;

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

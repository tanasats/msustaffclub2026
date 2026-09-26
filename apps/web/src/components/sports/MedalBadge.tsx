import { Badge } from '@/components/ui/Badge';
import { MEDAL_LABELS, type Medal } from '@/lib/sport-types';

const TONES = { gold: 'kin', silver: 'neutral', bronze: 'beni' } as const;

export function MedalBadge({ medal }: { medal: Medal }) {
  return <Badge tone={TONES[medal]}>{MEDAL_LABELS[medal]}</Badge>;
}

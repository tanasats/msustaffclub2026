'use client';

import { useSave } from '@/components/club-applications/useSave';

// เลิกเป็นนักกีฬา (เจ้าตัว) / ให้พ้น (ผู้จัดการทีม)
export function EndAthleteButton({ athleteId, label }: { athleteId: string; label: string }) {
  const { save, pending, error } = useSave();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => window.confirm(`${label}?`) && save('POST', `/athletes/${athleteId}/end`)}
        className="text-xs text-beni underline"
      >
        {label}
      </button>
      {error && <span role="alert" className="text-xs text-beni">{error}</span>}
    </span>
  );
}

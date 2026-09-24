import { STATUS_LABELS, type ApplicationStatus } from '@/lib/club-application-types';

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  awaiting_consent: 'bg-sky-100 text-sky-900',
  submitted: 'bg-indigo-100 text-indigo-900',
  returned: 'bg-amber-100 text-amber-900',
  reviewed: 'bg-violet-100 text-violet-900',
  approved: 'bg-green-100 text-green-900',
  rejected: 'bg-red-100 text-red-900',
  cancelled: 'bg-slate-200 text-slate-600',
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

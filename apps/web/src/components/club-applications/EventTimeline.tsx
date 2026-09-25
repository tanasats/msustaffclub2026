import { formatDateTime } from '@/lib/format';
import { STATUS_LABELS, type ApplicationDetail } from '@/lib/club-application-types';

// ประวัติการเปลี่ยนสถานะคำขอ (จาก club_application_events)
export function EventTimeline({ events }: { events: ApplicationDetail['events'] }) {
  return (
    <ol className="grid gap-3 border-l-2 border-ink/[0.08] pl-4">
      {events.map((event, index) => (
        <li key={index} className="text-sm">
          <p className="font-medium">{STATUS_LABELS[event.toStatus]}</p>
          <p className="text-xs text-mist">
            {formatDateTime(event.createdAt)} · {event.actorName ?? 'ระบบ'}
          </p>
          {event.note && <p className="mt-1 whitespace-pre-line text-ink">{event.note}</p>}
        </li>
      ))}
    </ol>
  );
}

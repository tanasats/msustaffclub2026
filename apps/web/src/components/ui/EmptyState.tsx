import { Icon, type IconName } from './icons';

// สถานะว่าง: ไอคอนในวงกลม + ข้อความ
export function EmptyState({ icon = 'leaf', title, description }: { icon?: IconName; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-bento border border-dashed border-ink/[0.12] bg-white px-6 py-12 text-center">
      <span className="mb-3 inline-flex size-12 items-center justify-center rounded-full bg-matcha-50 text-matcha-600">
        <Icon name={icon} className="size-6" />
      </span>
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-stone">{description}</p>}
    </div>
  );
}

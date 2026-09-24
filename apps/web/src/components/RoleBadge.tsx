interface RoleBadgeProps {
  label: string;
  privileged?: boolean;
}

export function RoleBadge({ label, privileged = false }: RoleBadgeProps) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        privileged ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {label}
    </span>
  );
}

import { Badge } from '@/components/ui/Badge';

// role สิทธิ์สูงแสดงเป็นสีทอง (kin) role ทั่วไปเป็นสีมัทฉะ
export function RoleBadge({ label, privileged = false }: { label: string; privileged?: boolean }) {
  return <Badge tone={privileged ? 'kin' : 'matcha'}>{label}</Badge>;
}

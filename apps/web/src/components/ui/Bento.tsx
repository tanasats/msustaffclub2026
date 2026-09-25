// ช่อง Bento: มุมโค้ง 16px + เส้นขอบบาง 1px โปร่งแสง
type Tone = 'paper' | 'cream' | 'matcha';

const TONES: Record<Tone, string> = {
  paper: 'bento',
  cream: 'rounded-bento border border-ink/[0.08] bg-cream/80',
  matcha: 'rounded-bento border border-matcha-900/20 bg-matcha-800 text-washi',
};

interface BentoProps {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  as?: 'section' | 'div' | 'article';
}

export function Bento({ tone = 'paper', className = '', children, as: Tag = 'section' }: BentoProps) {
  return <Tag className={`${TONES[tone]} p-5 sm:p-6 ${className}`}>{children}</Tag>;
}

// หัวข้อเล็กภายในช่อง (ภาษาไทยห้ามเว้นระยะตัวอักษร เพราะสระ/วรรณยุกต์จะดูแยกจากพยัญชนะ)
export function BentoLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[0.8125rem] font-medium text-stone ${className}`}>{children}</p>;
}

export function BentoTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`font-serif text-lg font-medium text-ink ${className}`}>{children}</h2>;
}

type Tone = 'neutral' | 'matcha' | 'kin' | 'beni' | 'sky';

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink/[0.05] text-stone',
  matcha: 'bg-matcha-100 text-matcha-800',
  kin: 'bg-kin-50 text-kin',
  beni: 'bg-beni-50 text-beni',
  sky: 'bg-[#e8eef2] text-[#3d5566]',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}

import { Badge } from './ui';

/**
 * Tiny per-page tag mapping the screen to the compliance control it satisfies.
 * Nobody else does this — it's the "trust receipt" Sovera ships with every view.
 */
export function ComplianceBadge({ code, label }: { code: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-(--color-ink-mute)">
      <Badge tone="cyan">{code}</Badge>
      <span className="hidden md:inline">{label}</span>
    </span>
  );
}

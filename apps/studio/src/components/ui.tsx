import * as React from 'react';

type Div = React.HTMLAttributes<HTMLDivElement>;

function cn(...a: Array<string | false | undefined>) { return a.filter(Boolean).join(' '); }

export function Card({ className, ...p }: Div) {
  return <div className={cn('glass p-5 lift', className)} {...p} />;
}

export function CardTitle({ className, ...p }: Div) {
  return <div className={cn('text-[13px] uppercase tracking-[0.14em] text-(--color-ink-mute)', className)} {...p} />;
}

export function H1({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn('text-2xl font-semibold tracking-tight', className)} {...p} />;
}

export function H2({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-medium tracking-tight', className)} {...p} />;
}

export function Stat({
  label, value, hint, accent = 'violet',
}: { label: string; value: React.ReactNode; hint?: string; accent?: 'violet' | 'cyan' | 'good' | 'warn' | 'bad' }) {
  const map: Record<string, string> = {
    violet: 'text-(--color-violet)',
    cyan:   'text-(--color-cyan)',
    good:   'text-(--color-good)',
    warn:   'text-(--color-warn)',
    bad:    'text-(--color-bad)',
  };
  return (
    <Card>
      <CardTitle>{label}</CardTitle>
      <div className={cn('mt-2 text-3xl font-semibold tracking-tight', map[accent])}>{value}</div>
      {hint ? <div className="mt-2 text-xs text-(--color-ink-mute)">{hint}</div> : null}
    </Card>
  );
}

export function Badge({
  children, tone = 'neutral', className,
}: { children: React.ReactNode; tone?: 'neutral' | 'violet' | 'cyan' | 'good' | 'warn' | 'bad'; className?: string }) {
  const map: Record<string, string> = {
    neutral: 'bg-(--color-bg-2) text-(--color-ink-dim) border-(--color-line-2)',
    violet:  'bg-violet-500/10 text-violet-300 border-violet-500/30',
    cyan:    'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    good:    'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    warn:    'bg-amber-500/10 text-amber-300 border-amber-500/30',
    bad:     'bg-rose-500/10 text-rose-300 border-rose-500/30',
  };
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
      map[tone], className,
    )}>
      {children}
    </span>
  );
}

export function Button({
  className, variant = 'default', size = 'md', ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'ghost' | 'brand'; size?: 'sm' | 'md' }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-(--radius) font-medium transition-colors';
  const sizes = { sm: 'h-7 px-2.5 text-xs', md: 'h-9 px-3.5 text-sm' };
  const variants = {
    default: 'bg-(--color-bg-2) text-(--color-ink) border border-(--color-line-2) hover:bg-(--color-line)',
    ghost:   'text-(--color-ink-dim) hover:bg-white/[0.04] hover:text-(--color-ink)',
    brand:   'text-white border border-violet-500/40 bg-gradient-to-r from-violet-500/90 to-cyan-500/90 hover:from-violet-500 hover:to-cyan-500',
  };
  return <button className={cn(base, sizes[size], variants[variant], className)} {...p} />;
}

export function Section({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-4', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between">
          {title && <H2>{title}</H2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return <code className={cn('font-mono text-[12.5px] text-(--color-cyan)', className)}>{children}</code>;
}

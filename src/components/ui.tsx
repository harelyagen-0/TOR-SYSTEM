/**
 * Shared UI primitives. Calm and uncluttered (spec §6): cards over borders,
 * one tenant accent, restrained motion, 44px minimum touch targets, numbers
 * as the hero of every card.
 */
import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { he } from '../locale/he'

// ── cards + sections ────────────────────────────────────────────────────────
export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-card border border-line bg-surface p-4 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-base font-bold">{children}</h2>
      {aside && <span className="text-xs font-semibold text-faint">{aside}</span>}
    </div>
  )
}

// ── buttons ─────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'ghost' | 'danger'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary',
  ghost: 'border border-line bg-surface text-ink',
  danger: 'bg-crit text-white',
}

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-field px-4 text-sm font-semibold transition-transform active:scale-[0.98] disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
    />
  )
}

// ── form fields ─────────────────────────────────────────────────────────────
export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  )
}

const fieldClass =
  'min-h-12 w-full rounded-field border border-line bg-surface px-3 text-base text-ink placeholder:text-faint focus:border-accent focus:outline-none'

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${fieldClass} ${className}`} />
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={`${fieldClass} ${className}`} />
}

export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-3 grid place-items-center text-faint">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-4.5" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>
      </span>
      <input type="search" autoComplete="off" {...props} className={`${fieldClass} ps-10`} />
    </div>
  )
}

// ── choice tiles (radio semantics, thumb-sized) ─────────────────────────────
export function OptionTile({
  selected,
  onSelect,
  title,
  subtitle,
  trailing,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  subtitle?: string
  trailing?: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-field border p-3 text-start transition-colors ${
        selected ? 'border-accent bg-accent/5' : 'border-line bg-surface'
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full border-2 ${
          selected ? 'border-accent' : 'border-line'
        }`}
      >
        {selected && <span className="size-2 rounded-full bg-accent" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        {subtitle && <span className="mt-0.5 block text-xs text-muted">{subtitle}</span>}
      </span>
      {trailing && <span className="ps-2 text-sm font-bold tnum whitespace-nowrap">{trailing}</span>}
    </button>
  )
}

// ── stat card: the number is the hero ───────────────────────────────────────
export function StatCard({ label, value, sub, onClick }: {
  label: string
  value: ReactNode
  sub?: ReactNode
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className="flex min-h-20 w-full flex-col justify-center gap-0.5 rounded-card border border-line bg-surface p-4 text-start shadow-sm"
    >
      <span className="text-xl font-bold leading-tight tnum">{value}</span>
      <span className="truncate text-xs font-semibold text-muted">{label}</span>
      {sub && <span className="text-[0.6875rem] font-semibold text-faint">{sub}</span>}
    </Tag>
  )
}

// ── empty state ─────────────────────────────────────────────────────────────
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="grid place-items-center gap-1 rounded-card border border-dashed border-line bg-surface/50 px-4 py-10 text-center">
      <p className="text-sm font-bold text-muted">{title}</p>
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
  )
}

// ── status pill ─────────────────────────────────────────────────────────────
export function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'crit' | 'muted' | 'accent'; children: ReactNode }) {
  const tones = {
    ok: 'text-ok bg-ok/10 border-ok/25',
    warn: 'text-warn bg-warn/10 border-warn/25',
    crit: 'text-crit bg-crit/10 border-crit/25',
    muted: 'text-muted bg-muted/10 border-muted/25',
    accent: 'text-accent bg-accent/10 border-accent/25',
  }
  return (
    <span className={`inline-block rounded-md border px-1.5 py-px text-[0.6875rem] font-bold ${tones[tone]}`}>
      {children}
    </span>
  )
}

// ── bottom sheet ────────────────────────────────────────────────────────────
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children?: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // move focus into the dialog
    const first = ref.current?.querySelector<HTMLElement>('input, select, button')
    first?.focus({ preventScroll: true })
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-ink/50 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-sheet border-t border-line bg-surface p-4 shadow-lg transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        hidden={!open}
      >
        <div aria-hidden="true" className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <h2 className="text-lg font-bold">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-4 flex flex-col gap-4">{children}</div>
        {footer && <div className="mt-5 flex gap-3 [&>*]:flex-1">{footer}</div>}
      </div>
    </>
  )
}

// ── confirm dialog (Hebrew כן / לא) ─────────────────────────────────────────
export function ConfirmDialog({
  open,
  question,
  detail,
  onYes,
  onNo,
  danger = true,
}: {
  open: boolean
  question: string
  detail?: string
  onYes: () => void
  onNo: () => void
  danger?: boolean
}) {
  return (
    <Sheet
      open={open}
      onClose={onNo}
      title={question}
      subtitle={detail}
      footer={
        <>
          <Button variant="ghost" onClick={onNo}>{he.common.no}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onYes}>{he.common.yes}</Button>
        </>
      }
    />
  )
}

// ── loading row ─────────────────────────────────────────────────────────────
export function Loading() {
  return <p className="py-6 text-center text-sm font-medium text-faint">{he.common.loading}</p>
}

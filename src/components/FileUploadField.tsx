/**
 * A drag-&-drop / click file picker, styled with THIS app's theme tokens
 * (no shadcn tokens, no cn/cva/radix/lucide/framer-motion) and localised to
 * Hebrew/RTL. Single-file: reports the chosen File up, or null when removed.
 *
 * Adapted from a shadcn "file upload card" — that version relied on shadcn
 * semantic tokens and framer-motion, neither of which exist in this project.
 */
import { useRef, useState, type DragEvent } from 'react'
import { he } from '../locale/he'

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 KB'
  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`
}

function fileBadge(file: File): string {
  const fromType = file.type.split('/')[1]
  const fromName = file.name.split('.').pop()
  return (fromType || fromName || 'file').toUpperCase().slice(0, 4)
}

export function FileUploadField({
  file,
  onSelect,
  accept = 'image/*,application/pdf',
}: {
  file: File | null
  onSelect: (file: File | null) => void
  accept?: string
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function take(list: FileList | null | undefined) {
    const f = list?.[0]
    if (f) onSelect(f)
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    take(e.dataTransfer.files)
  }

  // ── chosen file: show a chip with size + remove ──
  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-field border border-line bg-surface p-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-field bg-accent/10 text-[0.625rem] font-bold text-accent">
          {fileBadge(file)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{file.name}</p>
          <p className="text-xs text-muted">
            <bdi className="tnum">{formatFileSize(file.size)}</bdi>
            <span className="mx-1 text-faint">·</span>
            <span className="font-semibold text-ok">{he.upload.selected}</span>
          </p>
        </div>
        <span aria-hidden="true" className="shrink-0 text-ok">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
        </span>
        <button
          type="button"
          aria-label={he.upload.remove}
          onClick={() => { onSelect(null); if (inputRef.current) inputRef.current.value = '' }}
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-crit/10 hover:text-crit"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    )
  }

  // ── empty: drop zone ──
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={he.upload.browse}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true) }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false) }}
      onDrop={onDrop}
      className={`flex cursor-pointer flex-col items-center gap-2 rounded-field border-[1.5px] border-dashed px-4 py-6 text-center transition-colors ${
        dragging ? 'border-accent bg-accent/10' : 'border-line bg-page/60 hover:border-accent/50'
      }`}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => take(e.target.files)} />
      <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-accent/10 text-accent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-6">
          <path d="M12 15V4M8.5 7.5 12 4l3.5 3.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />
        </svg>
      </span>
      <span className="text-sm font-bold">{he.upload.prompt}</span>
      <span className="text-xs text-faint">{he.upload.formats}</span>
      <span className="mt-1 inline-flex min-h-8 items-center rounded-field border border-line bg-surface px-3 text-xs font-bold text-ink">
        {he.upload.browse}
      </span>
    </div>
  )
}

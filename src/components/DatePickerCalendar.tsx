/**
 * A month calendar for jumping the schedule to any date. Built on react-day-picker
 * but styled entirely with THIS app's theme tokens (no shadcn tokens, no cn/cva/
 * radix/lucide) and localised to Hebrew/RTL via Intl. Selecting a day reports it
 * back so the week view can jump there.
 */
import { DayPicker } from 'react-day-picker'

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ')

const heCaption = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' })
const heWeekday = new Intl.DateTimeFormat('he-IL', { weekday: 'narrow' })

function Chevron({ orientation }: { orientation?: 'left' | 'right' | 'up' | 'down' }) {
  // react-day-picker already resolves physical direction for RTL.
  const d = orientation === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4.5" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export function DatePickerCalendar({
  selected,
  month,
  onMonthChange,
  onSelect,
}: {
  selected?: Date
  month: Date
  onMonthChange: (d: Date) => void
  onSelect: (d: Date) => void
}) {
  return (
    <DayPicker
      mode="single"
      dir="rtl"
      weekStartsOn={0}
      showOutsideDays
      selected={selected}
      month={month}
      onMonthChange={onMonthChange}
      onSelect={(d) => d && onSelect(d)}
      formatters={{
        formatCaption: (m) => heCaption.format(m),
        formatWeekdayName: (d) => heWeekday.format(d),
      }}
      components={{ Chevron }}
      className="w-full"
      classNames={{
        months: 'relative',
        month: 'w-full',
        month_grid: 'w-full',
        month_caption: 'relative mb-2 flex h-9 items-center justify-center text-sm font-bold text-ink',
        caption_label: 'text-sm font-bold',
        nav: 'absolute top-0 z-10 flex w-full justify-between',
        button_previous: 'grid size-9 place-items-center rounded-field text-muted hover:bg-accent/10',
        button_next: 'grid size-9 place-items-center rounded-field text-muted hover:bg-accent/10',
        weekdays: 'grid grid-cols-7 text-center text-xs font-semibold text-faint',
        weekday: 'py-1',
        week: 'grid grid-cols-7',
        // the cell carries data-selected/data-today (RDP puts modifiers here);
        // `group` lets the inner button react to the cell's selected state.
        day: 'group text-center',
        day_button: cx(
          'relative mx-auto flex size-9 items-center justify-center rounded-full text-sm font-semibold tnum transition-colors',
          'hover:bg-accent/10',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          'group-data-[selected]:bg-primary group-data-[selected]:text-on-primary group-data-[selected]:font-bold group-data-[selected]:shadow-sm',
          'group-data-[disabled]:opacity-40 group-data-[disabled]:hover:bg-transparent',
        ),
        today: 'after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:size-1 after:rounded-full after:bg-accent',
        outside: 'text-faint/60',
        disabled: 'opacity-40',
        hidden: 'invisible',
      }}
    />
  )
}

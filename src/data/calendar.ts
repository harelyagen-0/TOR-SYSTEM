import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { rawCol, tenantCol } from './db'
import { useTenantId } from './customers'
import { addDaysKey, dateKey, tzParts, zonedTimeToUtc } from '../lib/format'
import { useTenant } from '../tenant/TenantProvider'
import { useCan } from '../auth/AuthProvider'
import { DEFAULT_POLICIES } from '../types/models'
import type {
  ClassTemplate,
  Customer,
  Instructor,
  Recurrence,
  Registration,
  RegistrationStatus,
  Session,
} from '../types/models'

// ── reads ───────────────────────────────────────────────────────────────────
// Each read is gated on the caller's calendar permission. Without this the
// query still fires for an operator who can't read the collection, and the
// Firestore SDK logs a permission error — noise in the console and a failure
// in the cdp-verify harness, which counts error-level log entries.
export function useSessionsForWeek(weekStart: string) {
  const tenantId = useTenantId()
  const tenant = useTenant()
  const enabled = useCan('calendar')
  return useQuery({
    enabled,
    queryKey: ['sessions', tenantId, weekStart],
    queryFn: async () => {
      const startAt = zonedTimeToUtc(weekStart, '00:00', tenant.timezone)
      const endAt = zonedTimeToUtc(addDaysKey(weekStart, 7), '00:00', tenant.timezone)
      const snap = await getDocs(
        query(
          tenantCol<Session>(tenantId, 'sessions'),
          where('startAt', '>=', Timestamp.fromDate(startAt)),
          where('startAt', '<', Timestamp.fromDate(endAt)),
          orderBy('startAt'),
        ),
      )
      return snap.docs.map((d) => d.data())
    },
  })
}

/** All of one day's sessions in time order — Home's "today" card. */
export function useSessionsForDay(ymd: string) {
  const tenantId = useTenantId()
  const tenant = useTenant()
  const enabled = useCan('calendar')
  return useQuery({
    enabled,
    queryKey: ['sessions', tenantId, 'day', ymd],
    queryFn: async () => {
      const startAt = zonedTimeToUtc(ymd, '00:00', tenant.timezone)
      const endAt = zonedTimeToUtc(addDaysKey(ymd, 1), '00:00', tenant.timezone)
      const snap = await getDocs(
        query(
          tenantCol<Session>(tenantId, 'sessions'),
          where('startAt', '>=', Timestamp.fromDate(startAt)),
          where('startAt', '<', Timestamp.fromDate(endAt)),
          orderBy('startAt'),
        ),
      )
      return snap.docs.map((d) => d.data())
    },
  })
}

export function useTemplates() {
  const tenantId = useTenantId()
  const enabled = useCan('calendar')
  return useQuery({
    enabled,
    queryKey: ['classTemplates', tenantId],
    queryFn: async () => {
      const snap = await getDocs(
        query(tenantCol<ClassTemplate>(tenantId, 'classTemplates'), orderBy('title')),
      )
      return snap.docs.map((d) => d.data())
    },
  })
}

export function useInstructors() {
  const tenantId = useTenantId()
  const enabled = useCan('calendar')
  return useQuery({
    enabled,
    queryKey: ['instructors', tenantId],
    queryFn: async () => {
      const snap = await getDocs(
        query(tenantCol<Instructor>(tenantId, 'instructors'), orderBy('firstName')),
      )
      return snap.docs.map((d) => d.data())
    },
  })
}

export interface RegistrantRow {
  registration: Registration
  customer: Customer | null
}

export function useSessionRegistrants(sessionId: string | null) {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['registrations', tenantId, 'bySession', sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<RegistrantRow[]> => {
      const snap = await getDocs(
        query(
          tenantCol<Registration>(tenantId, 'registrations'),
          where('sessionId', '==', sessionId),
        ),
      )
      const regs = snap.docs.map((d) => d.data())
      const rows: RegistrantRow[] = []
      for (const r of regs) {
        const c = await getDoc(doc(rawCol(tenantId, 'customers'), r.customerId))
        rows.push({
          registration: r,
          customer: c.exists() ? ({ ...(c.data() as Omit<Customer, 'id'>), id: c.id }) : null,
        })
      }
      return rows
    },
  })
}

// ── session mutations ───────────────────────────────────────────────────────
export interface SessionInput {
  title: string
  classTypeId: string
  instructorId?: string
  date: string // 'YYYY-MM-DD' studio tz
  time: string // 'HH:mm'
  durationMinutes: number
  capacity: number
  price: number
  templateId?: string
  recurrenceId?: string
  occurrenceDate?: string
}

export function useCreateSession() {
  const tenantId = useTenantId()
  const tenant = useTenant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SessionInput) => {
      const startAt = zonedTimeToUtc(input.date, input.time, tenant.timezone)
      const endAt = new Date(startAt.getTime() + input.durationMinutes * 60_000)
      await addDoc(rawCol(tenantId, 'sessions'), {
        templateId: input.templateId ?? null,
        recurrenceId: input.recurrenceId ?? null,
        occurrenceDate: input.occurrenceDate ?? input.date,
        title: input.title,
        classTypeId: input.classTypeId,
        instructorId: input.instructorId ?? null,
        startAt: Timestamp.fromDate(startAt),
        endAt: Timestamp.fromDate(endAt),
        capacity: input.capacity,
        price: input.price,
        registeredCount: 0,
        status: 'scheduled',
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', tenantId] }),
  })
}

/** Edits ONE session only — a recurrence's other occurrences are untouched
 *  by design (spec §10: editing one occurrence never edits the series). */
export function useUpdateSession() {
  const tenantId = useTenantId()
  const tenant = useTenant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      session,
      changes,
    }: {
      session: Session
      changes: { time?: string; instructorId?: string; capacity?: number; price?: number; durationMinutes?: number }
    }) => {
      const updates: Record<string, unknown> = {}
      const day = dateKey(session.startAt, tenant.timezone)
      const currentStart = session.startAt.toDate()
      const currentDur = Math.round((session.endAt.toMillis() - session.startAt.toMillis()) / 60_000)
      const newStart = changes.time ? zonedTimeToUtc(day, changes.time, tenant.timezone) : currentStart
      const newDur = changes.durationMinutes ?? currentDur
      if (changes.time || changes.durationMinutes != null) {
        updates.startAt = Timestamp.fromDate(newStart)
        updates.endAt = Timestamp.fromDate(new Date(newStart.getTime() + newDur * 60_000))
      }
      if (changes.instructorId !== undefined) updates.instructorId = changes.instructorId || null
      if (changes.capacity != null) updates.capacity = changes.capacity
      if (changes.price != null) updates.price = changes.price
      await updateDoc(doc(rawCol(tenantId, 'sessions'), session.id), updates)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', tenantId] }),
  })
}

/**
 * Cancels one session. If it came from a recurrence, its occurrence date joins
 * the recurrence's exception list so materialisation never resurrects it.
 */
export function useCancelSession() {
  const tenantId = useTenantId()
  const tenant = useTenant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (session: Session) => {
      if (session.recurrenceId) {
        const occurrence = session.occurrenceDate ?? dateKey(session.startAt, tenant.timezone)
        await updateDoc(doc(rawCol(tenantId, 'recurrences'), session.recurrenceId), {
          exceptions: arrayUnion(occurrence),
        })
      }
      await updateDoc(doc(rawCol(tenantId, 'sessions'), session.id), { status: 'cancelled' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', tenantId] }),
  })
}

// ── attendance ──────────────────────────────────────────────────────────────
/** Punch-card auto-deduction on attendance is [OPEN — spec Q5]; only the
 *  registration status + denormalised customer stats move here.
 *
 *  A cancellation additionally stamps `lateCancel` from the studio's
 *  cancellation window (Settings → כללי עסק): inside the window the seat is
 *  still charged, which is what CustomerProfileSheet renders as ביטול באיחור. */
export function useMarkAttendance() {
  const tenantId = useTenantId()
  const tenant = useTenant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      registration,
      status,
      session,
    }: {
      registration: Registration
      status: RegistrationStatus
      /** the class being cancelled — needed to measure the notice given */
      session?: Session | null
    }) => {
      const windowHours =
        tenant.policies?.cancellationWindowHours ?? DEFAULT_POLICIES.cancellationWindowHours
      const lateCancel =
        status === 'cancelled' && session
          ? session.startAt.toMillis() - Date.now() < windowHours * 3_600_000
          : undefined

      await updateDoc(doc(rawCol(tenantId, 'registrations'), registration.id), {
        status,
        ...(lateCancel === undefined ? {} : { lateCancel }),
      })
      const wasAttended = registration.status === 'attended'
      const nowAttended = status === 'attended'
      if (wasAttended !== nowAttended) {
        await updateDoc(doc(rawCol(tenantId, 'customers'), registration.customerId), {
          'stats.sessionsAttended': increment(nowAttended ? 1 : -1),
          ...(nowAttended ? { 'stats.lastVisitAt': serverTimestamp() } : {}),
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['registrations', tenantId] })
      qc.invalidateQueries({ queryKey: ['customers', tenantId] })
    },
  })
}

// ── templates ───────────────────────────────────────────────────────────────
export interface TemplateInput {
  title: string
  classTypeId: string
  defaultInstructorId?: string
  capacity: number
  durationMinutes: number
  price: number
  defaultStartTime?: string
  room?: string
  /** null = all passes/subscriptions accepted (default); a list restricts entry */
  allowedProductIds?: string[] | null
}

export function useSaveTemplate() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: TemplateInput & { id?: string }) => {
      const data = {
        title: input.title,
        classTypeId: input.classTypeId,
        defaultInstructorId: input.defaultInstructorId ?? null,
        capacity: input.capacity,
        durationMinutes: input.durationMinutes,
        price: input.price,
        defaultStartTime: input.defaultStartTime ?? null,
        room: input.room ?? '',
        allowedProductIds: input.allowedProductIds ?? null,
      }
      if (id) {
        await updateDoc(doc(rawCol(tenantId, 'classTemplates'), id), data)
        return id
      }
      const ref = await addDoc(rawCol(tenantId, 'classTemplates'), data)
      return ref.id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['classTemplates', tenantId] }),
  })
}

export function useDeleteTemplate() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(rawCol(tenantId, 'classTemplates'), id))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['classTemplates', tenantId] }),
  })
}

// ── instructors ─────────────────────────────────────────────────────────────
export interface InstructorInput {
  firstName: string
  lastName: string
  experience?: string
  allowedClassTypes: string[]
  phone?: string
}

export function useSaveInstructor() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: InstructorInput & { id?: string }) => {
      const data = {
        firstName: input.firstName,
        lastName: input.lastName,
        experience: input.experience ?? '',
        allowedClassTypes: input.allowedClassTypes,
        phone: input.phone ?? '',
        active: true,
      }
      if (id) await updateDoc(doc(rawCol(tenantId, 'instructors'), id), data)
      else await addDoc(rawCol(tenantId, 'instructors'), data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instructors', tenantId] }),
  })
}

// ── recurrences ─────────────────────────────────────────────────────────────
export interface RecurrenceInput {
  template: ClassTemplate
  weekday: number
  time: string
  startsOn: string
  endsOn?: string
}

/**
 * Creates the recurrence AND materialises its first 12 weeks immediately, so
 * the operator sees the series on the calendar without waiting for the nightly
 * job. Ids follow the `${recurrenceId}_${ymd}` scheme the Cloud Function uses,
 * so the two writers can never duplicate an occurrence.
 */
export function useCreateRecurrence() {
  const tenantId = useTenantId()
  const tenant = useTenant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ template, weekday, time, startsOn, endsOn }: RecurrenceInput) => {
      const recRef = await addDoc(rawCol(tenantId, 'recurrences'), {
        templateId: template.id,
        weekday,
        time,
        startsOn,
        endsOn: endsOn ?? null,
        exceptions: [],
      })
      const horizonEnd = addDaysKey(dateKey(new Date(), tenant.timezone), 12 * 7)
      for (let ymd = startsOn; ymd <= horizonEnd; ymd = addDaysKey(ymd, 1)) {
        if (endsOn && ymd > endsOn) break
        const wd = tzParts(zonedTimeToUtc(ymd, '12:00', tenant.timezone), tenant.timezone).weekday
        if (wd !== weekday) continue
        const startAt = zonedTimeToUtc(ymd, time, tenant.timezone)
        const endAt = new Date(startAt.getTime() + template.durationMinutes * 60_000)
        await setDoc(doc(rawCol(tenantId, 'sessions'), `${recRef.id}_${ymd}`), {
          templateId: template.id,
          recurrenceId: recRef.id,
          occurrenceDate: ymd,
          title: template.title,
          classTypeId: template.classTypeId,
          instructorId: template.defaultInstructorId ?? null,
          startAt: Timestamp.fromDate(startAt),
          endAt: Timestamp.fromDate(endAt),
          capacity: template.capacity,
          price: template.price,
          registeredCount: 0,
          status: 'scheduled',
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', tenantId] }),
  })
}

export type { Recurrence }

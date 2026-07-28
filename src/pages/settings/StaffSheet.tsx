import { useState, type FormEvent } from 'react'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Loading,
  OptionTile,
  Pill,
  Select,
  Sheet,
} from '../../components/ui'
import { he } from '../../locale/he'
import { useAuth } from '../../auth/AuthProvider'
import {
  AREAS,
  ROLE_PRESETS,
  ROLES,
  type PermissionArea,
  type PermissionLevel,
  type Permissions,
  type StaffRole,
} from '../../auth/permissions'
import {
  useCreateStaff,
  useResetStaffPassword,
  useSetStaffActive,
  useStaff,
  useUpdateStaff,
} from '../../data/staff'
import { useInstructors } from '../../data/calendar'
import type { StaffMember } from '../../types/models'

const AREA_LABELS: Record<PermissionArea, string> = {
  payments: he.permissions.areaPayments,
  customers: he.permissions.areaCustomers,
  calendar: he.permissions.areaCalendar,
  analytics: he.permissions.areaAnalytics,
  finance: he.permissions.areaFinance,
  settings: he.permissions.areaSettings,
}

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  none: he.permissions.levelNone,
  view: he.permissions.levelView,
  edit: he.permissions.levelEdit,
}

const ROLE_SUBS: Record<StaffRole, string> = {
  owner: he.roles.ownerSub,
  manager: he.roles.managerSub,
  staff: he.roles.staffSub,
}

const LEVELS: PermissionLevel[] = ['none', 'view', 'edit']

/**
 * Staff list → editor. Every mutation goes through an owner-gated callable;
 * the staff collection is write-denied in firestore.rules because these docs
 * drive the custom claims that rules enforce.
 *
 * The owner row is read-only: exactly one owner per tenant, permissions locked
 * to the preset, and no self-editing of your own role (the callables reject all
 * three regardless of what this UI offers).
 */
export function StaffSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, role: myRole } = useAuth()
  const staff = useStaff()
  const instructors = useInstructors()
  const createStaff = useCreateStaff()
  const updateStaff = useUpdateStaff()
  const setActive = useSetStaffActive()
  const resetPassword = useResetStaffPassword()

  const isOwner = myRole === 'owner'
  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** shown once, right after creation or a reset — never retrievable again */
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState<StaffMember | null>(null)
  const [confirmReset, setConfirmReset] = useState<StaffMember | null>(null)

  const emptyForm = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'staff' as StaffRole,
    permissions: { ...ROLE_PRESETS.staff } as Permissions,
    instructorId: '' as string,
  }
  const [form, setForm] = useState(emptyForm)

  function startEdit(member: StaffMember | null) {
    setError(null)
    if (member) {
      setEditing(member)
      setForm({
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        phone: member.phone ?? '',
        role: member.role,
        permissions: { ...member.permissions },
        instructorId: member.instructorId ?? '',
      })
    } else {
      setEditing('new')
      setForm(emptyForm)
    }
  }

  /** Picking a role reseeds the matrix; individual areas stay overridable. */
  function pickRole(role: StaffRole) {
    setForm((f) => ({ ...f, role, permissions: { ...ROLE_PRESETS[role] } }))
  }

  function setLevel(area: PermissionArea, level: PermissionLevel) {
    setForm((f) => ({ ...f, permissions: { ...f.permissions, [area]: level } }))
  }

  const isSelf = editing !== null && editing !== 'new' && editing.id === user?.uid
  const isOwnerRow = editing !== null && editing !== 'new' && editing.role === 'owner'
  const permissionsLocked = isOwnerRow || isSelf || !isOwner

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (editing === 'new') {
        const result = await createStaff.mutateAsync({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          role: form.role,
          permissions: form.permissions,
          instructorId: form.instructorId || null,
        })
        setTempPassword(result.tempPassword)
        setCopied(false)
      } else if (editing) {
        await updateStaff.mutateAsync({
          uid: editing.id,
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          instructorId: form.instructorId || null,
          // role/permissions are omitted when locked so the callable never
          // sees a no-op change it would have to reject
          ...(permissionsLocked ? {} : { role: form.role, permissions: form.permissions }),
        })
      }
      setEditing(null)
    } catch {
      setError(editing === 'new' ? he.staff.createError : he.staff.saveError)
    }
  }

  const busy = createStaff.isPending || updateStaff.isPending

  // ── one-time password reveal ──────────────────────────────────────────────
  if (tempPassword) {
    return (
      <Sheet
        open={open}
        onClose={() => setTempPassword(null)}
        title={he.staff.passwordTitle}
        subtitle={he.staff.passwordHint}
        footer={
          <Button onClick={() => setTempPassword(null)}>{he.staff.passwordDone}</Button>
        }
      >
        <div className="flex items-center gap-3 rounded-field border border-line bg-page p-3">
          <code dir="ltr" className="min-w-0 flex-1 truncate text-base font-bold tnum">
            {tempPassword}
          </code>
          <Button
            variant="ghost"
            className="shrink-0"
            onClick={() => {
              void navigator.clipboard?.writeText(tempPassword)
              setCopied(true)
            }}
          >
            {copied ? he.staff.passwordCopied : he.staff.passwordCopy}
          </Button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet
      open={open}
      onClose={editing ? () => setEditing(null) : onClose}
      title={he.staff.title}
    >
      {editing === null ? (
        <>
          {staff.isLoading ? (
            <Loading />
          ) : (staff.data ?? []).length === 0 ? (
            <EmptyState title={he.staff.empty} />
          ) : (
            <div className="flex flex-col">
              {(staff.data ?? []).map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => startEdit(member)}
                  className="flex min-h-14 items-center gap-3 border-b border-hair py-3 text-start last:border-0"
                >
                  <span
                    aria-hidden="true"
                    className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      member.active ? 'bg-accent/10 text-accent' : 'bg-muted/10 text-muted'
                    }`}
                  >
                    {member.firstName.charAt(0)}
                    {member.lastName.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {member.firstName} {member.lastName}
                    </span>
                    <span className="block truncate text-xs text-faint" dir="ltr">
                      {member.email}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Pill tone={member.role === 'owner' ? 'accent' : 'muted'}>
                      {he.roles[member.role]}
                    </Pill>
                    {!member.active && <Pill tone="crit">{he.staff.inactive}</Pill>}
                  </span>
                </button>
              ))}
            </div>
          )}
          {isOwner && <Button onClick={() => startEdit(null)}>{he.staff.add}</Button>}
        </>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={he.staff.firstName}>
              <Input
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </Field>
            <Field label={he.staff.lastName}>
              <Input
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </Field>
          </div>

          <Field
            label={he.staff.email}
            hint={editing === 'new' ? he.staff.emailHint : undefined}
          >
            <Input
              required
              type="email"
              dir="ltr"
              className="text-end"
              // the email IS the Auth identity; changing it would orphan the login
              disabled={editing !== 'new'}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>

          <Field label={`${he.staff.phone} ${he.common.optional}`}>
            <Input
              type="tel"
              dir="ltr"
              className="text-end"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>

          <Field label={he.staff.linkedInstructor} hint={he.staff.linkedInstructorHint}>
            <Select
              value={form.instructorId}
              onChange={(e) => setForm({ ...form, instructorId: e.target.value })}
            >
              <option value="">{he.staff.linkedInstructorNone}</option>
              {(instructors.data ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.firstName} {i.lastName}
                </option>
              ))}
            </Select>
          </Field>

          {isOwnerRow ? (
            <p className="rounded-field border border-line bg-page p-3 text-xs font-semibold text-muted">
              {he.staff.ownerLocked}
            </p>
          ) : isSelf ? (
            <p className="rounded-field border border-line bg-page p-3 text-xs font-semibold text-muted">
              {he.staff.cannotEditSelf}
            </p>
          ) : (
            <>
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold">{he.staff.role}</legend>
                <div className="flex flex-col gap-1.5" role="radiogroup">
                  {ROLES.filter((r) => r !== 'owner').map((r) => (
                    <OptionTile
                      key={r}
                      selected={form.role === r}
                      onSelect={() => pickRole(r)}
                      title={he.roles[r]}
                      subtitle={ROLE_SUBS[r]}
                    />
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold">{he.permissions.title}</legend>
                <p className="mb-2 text-xs text-faint">{he.permissions.hint}</p>
                <div className="flex flex-col gap-1.5">
                  {AREAS.map((area) => (
                    <div
                      key={area}
                      className="flex min-h-12 items-center gap-2 rounded-field border border-line px-3"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {AREA_LABELS[area]}
                      </span>
                      <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={AREA_LABELS[area]}>
                        {LEVELS.map((level) => (
                          <button
                            key={level}
                            type="button"
                            role="radio"
                            aria-checked={form.permissions[area] === level}
                            onClick={() => setLevel(area, level)}
                            className={`min-h-9 rounded-md px-2 text-xs font-bold transition-colors ${
                              form.permissions[area] === level
                                ? 'bg-accent text-white'
                                : 'bg-page text-muted'
                            }`}
                          >
                            {LEVEL_LABELS[level]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {error && <p className="text-sm font-semibold text-crit">{error}</p>}

          {editing !== 'new' && isOwner && !isSelf && (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setConfirmReset(editing)}
                className="min-h-11 text-sm font-bold text-accent"
              >
                {he.staff.resetPassword}
              </button>
              {!isOwnerRow && (
                <button
                  type="button"
                  onClick={() =>
                    editing.active
                      ? setConfirmDeactivate(editing)
                      : void setActive.mutateAsync({ uid: editing.id, active: true })
                  }
                  className={`min-h-11 text-sm font-bold ${editing.active ? 'text-crit' : 'text-accent'}`}
                >
                  {editing.active ? he.staff.deactivate : he.staff.reactivate}
                </button>
              )}
            </div>
          )}

          <div className="flex gap-3 [&>*]:flex-1">
            <Button variant="ghost" onClick={() => setEditing(null)}>{he.common.cancel}</Button>
            <Button type="submit" disabled={busy}>{he.common.save}</Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirmDeactivate !== null}
        question={he.staff.deactivateConfirm}
        detail={he.staff.deactivateDetail}
        onYes={async () => {
          if (!confirmDeactivate) return
          await setActive.mutateAsync({ uid: confirmDeactivate.id, active: false })
          setConfirmDeactivate(null)
          setEditing(null)
        }}
        onNo={() => setConfirmDeactivate(null)}
      />

      <ConfirmDialog
        open={confirmReset !== null}
        question={he.staff.resetPasswordConfirm}
        danger={false}
        onYes={async () => {
          if (!confirmReset) return
          const result = await resetPassword.mutateAsync(confirmReset.id)
          setConfirmReset(null)
          setTempPassword(result.tempPassword)
          setCopied(false)
        }}
        onNo={() => setConfirmReset(null)}
      />
    </Sheet>
  )
}

/**
 * Operator authentication + the permission set the session carries.
 *
 * Tenant resolution [OPEN — spec Q1]: v1 policy is that the custom claims on
 * the operator's auth token are the SINGLE source of truth — `tenantId` for
 * which studio, `role` + `perms` for what they may do inside it. The URL
 * (subdomain / path slug) is cosmetic. Whatever is decided later must
 * implement TenantResolver only — nothing else may change.
 *
 * Claims are set exclusively by Cloud Functions (functions/src/staff.ts) and
 * are what firestore.rules enforces. The UI gating below mirrors them so the
 * app doesn't offer actions the server would reject — it is NOT the security
 * boundary.
 *
 * A signed-in user whose token carries no `perms` map (issued before roles
 * existed) resolves to 'noTenant': fail closed, never fail open.
 */
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { auth, db } from '../lib/firebase'
import {
  can as canWith,
  decodePermissions,
  isStaffRole,
  NO_PERMISSIONS,
  type PermissionArea,
  type Permissions,
  type StaffRole,
} from './permissions'

export interface ResolvedSession {
  tenantId: string
  role: StaffRole
  permissions: Permissions
}

/** [OPEN] swap-point for however tenant resolution ends up working. */
export interface TenantResolver {
  resolve(user: User, forceRefresh?: boolean): Promise<ResolvedSession | null>
}

const claimResolver: TenantResolver = {
  async resolve(user, forceRefresh = false) {
    const token = await user.getIdTokenResult(forceRefresh)
    const tenantId = token.claims.tenantId
    if (typeof tenantId !== 'string' || tenantId.length === 0) return null
    // no perms map → a pre-roles token; grant nothing rather than everything
    if (!token.claims.perms) return null
    return {
      tenantId,
      role: isStaffRole(token.claims.role) ? token.claims.role : 'staff',
      permissions: decodePermissions(token.claims.perms),
    }
  },
}

interface AuthState {
  status: 'loading' | 'signedOut' | 'noTenant' | 'ready'
  user: User | null
  tenantId: string | null
  role: StaffRole | null
  permissions: Permissions
  /** mirrors firestore.rules; gates affordances, never the data itself */
  can: (area: PermissionArea, level?: 'view' | 'edit') => boolean
  signIn: (email: string, password: string) => Promise<void>
  signOutUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<ResolvedSession | null>(null)

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null)
        setSession(null)
        setStatus('signedOut')
        return
      }
      setUser(u)
      const resolved = await claimResolver.resolve(u)
      setSession(resolved)
      setStatus(resolved ? 'ready' : 'noTenant')
    })
  }, [])

  /**
   * Custom claims only reach the client on a token refresh, which otherwise
   * happens hourly. onStaffWritten bumps `claimsUpdatedAt` after it syncs the
   * claims, so watching our own staff doc turns a permission change into a
   * forced refresh within seconds. Reads its own doc even without settings
   * access — firestore.rules allows exactly that.
   */
  useEffect(() => {
    if (!user || !session) return
    const ref = doc(db, 'tenants', session.tenantId, 'staff', user.uid)
    let first = true
    return onSnapshot(
      ref,
      async (snap) => {
        if (first) {
          first = false
          return
        }
        if (!snap.exists()) return
        const resolved = await claimResolver.resolve(user, true)
        setSession(resolved)
        setStatus(resolved ? 'ready' : 'noTenant')
      },
      () => {
        /* a member with no staff doc (or no read access) simply keeps its token */
      },
    )
  }, [user, session])

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }, [])

  const signOutUser = useCallback(async () => {
    await signOut(auth)
  }, [])

  const value = useMemo<AuthState>(() => {
    const permissions = session?.permissions ?? NO_PERMISSIONS
    return {
      status,
      user,
      tenantId: session?.tenantId ?? null,
      role: session?.role ?? null,
      permissions,
      can: (area, level = 'view') => canWith(permissions, area, level),
      signIn,
      signOutUser,
    }
  }, [status, user, session, signIn, signOutUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

/** `useCan('payments', 'edit')` — the standard gate for an affordance. */
export function useCan(area: PermissionArea, level: 'view' | 'edit' = 'view'): boolean {
  return useAuth().can(area, level)
}

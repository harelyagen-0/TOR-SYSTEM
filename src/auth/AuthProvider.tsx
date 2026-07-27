/**
 * Operator authentication.
 *
 * Tenant resolution [OPEN — spec Q1]: v1 policy is that the `tenantId` custom
 * claim on the operator's auth token is the SINGLE source of truth. The URL
 * (subdomain / path slug) is cosmetic. Whatever is decided later must
 * implement TenantResolver only — nothing else may change.
 */
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth } from '../lib/firebase'

/** [OPEN] swap-point for however tenant resolution ends up working. */
export interface TenantResolver {
  resolve(user: User): Promise<string | null>
}

const claimResolver: TenantResolver = {
  async resolve(user) {
    const token = await user.getIdTokenResult()
    const tenantId = token.claims.tenantId
    return typeof tenantId === 'string' && tenantId.length > 0 ? tenantId : null
  },
}

interface AuthState {
  status: 'loading' | 'signedOut' | 'noTenant' | 'ready'
  user: User | null
  tenantId: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOutUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null)
        setTenantId(null)
        setStatus('signedOut')
        return
      }
      setUser(u)
      const tid = await claimResolver.resolve(u)
      setTenantId(tid)
      setStatus(tid ? 'ready' : 'noTenant')
    })
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }, [])

  const signOutUser = useCallback(async () => {
    await signOut(auth)
  }, [])

  return (
    <AuthContext.Provider value={{ status, user, tenantId, signIn, signOutUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

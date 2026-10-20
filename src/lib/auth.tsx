import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { backend, type AuthSession } from './data'

interface AuthState {
  session: AuthSession | null
  /** true hasta saber si hay una sesión guardada en el dispositivo */
  loading: boolean
}

const AuthContext = createContext<AuthState>({ session: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: backend.configured })

  useEffect(() => {
    if (!backend.configured) return
    let alive = true
    backend.auth.getSession().then((session) => alive && setState({ session, loading: false }))
    const unsubscribe = backend.auth.onChange((session) => setState({ session, loading: false }))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

export const signIn = (email: string, password: string) => backend.auth.signIn(email, password)

/**
 * Crea un usuario. Devuelve true si quedó con sesión iniciada, false si primero hay que confirmar el email.
 * El nombre se guarda con el usuario y se copia al perfil en la primera carga.
 */
export async function signUp(email: string, password: string, nombre: string): Promise<boolean> {
  const { needsConfirmation } = await backend.auth.signUp(email, password, nombre)
  return !needsConfirmation
}

export const signOut = () => backend.auth.signOut()

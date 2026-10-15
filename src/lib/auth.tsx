import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Platform } from 'react-native'

import { supabase, supabaseConfigured } from './supabase'

interface AuthState {
  session: Session | null
  /** true hasta saber si hay una sesión guardada en el dispositivo */
  loading: boolean
}

const AuthContext = createContext<AuthState>({ session: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: supabaseConfigured })

  useEffect(() => {
    if (!supabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }))
    return () => data.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) {
    throw new Error(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : error.message)
  }
}

/**
 * Crea un usuario. Devuelve true si quedó con sesión iniciada, false si primero hay que confirmar el email.
 * El nombre se guarda en los metadatos y se copia al perfil en la primera carga.
 */
export async function signUp(email: string, password: string, nombre: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { nombre: nombre.trim() },
      emailRedirectTo: Platform.OS === 'web' ? window.location.origin : undefined,
    },
  })
  if (error) {
    if (/already registered/i.test(error.message)) throw new Error('Ya existe un usuario con ese email.')
    if (/signups not allowed/i.test(error.message)) throw new Error('El registro de usuarios nuevos está desactivado en Supabase.')
    if (/password/i.test(error.message)) throw new Error('La contraseña debe tener al menos 6 caracteres.')
    throw new Error(error.message)
  }
  return !!data.session
}

export const signOut = () => supabase.auth.signOut()

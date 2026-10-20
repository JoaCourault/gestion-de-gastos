// Adaptador HTTP: implementa el puerto de datos contra el backend propio (server/).
// Autenticación con access token (JWT corto) + refresh token, guardados en el dispositivo.

import '../../storage'

import type { ApiErrorBody, ApiErrorCode, ApiUser, DataResponse, SharedResponse, SignUpResponse, TokenResponse } from '@contract/api'

import { DataError, type AuthSession, type Backend, type DataErrorCode } from '../port'

interface StoredSession {
  access_token: string
  /** epoch ms */
  expires_at: number
  refresh_token: string
  user: ApiUser
}

const STORAGE_KEY = 'auth:api'

const CODE_MAP: Partial<Record<ApiErrorCode, DataErrorCode>> = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  email_taken: 'email_taken',
  signup_disabled: 'signup_disabled',
  weak_password: 'weak_password',
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  in_use: 'in_use',
}

export function createHttpBackend(baseUrl: string): Backend {
  const base = baseUrl.replace(/\/+$/, '')
  const configured = /^https?:\/\//.test(base)
  const listeners = new Set<(s: AuthSession | null) => void>()

  const read = (): StoredSession | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as StoredSession) : null
    } catch {
      return null
    }
  }
  const toSession = (s: StoredSession | null): AuthSession | null => (s ? { user: s.user } : null)
  const write = (s: StoredSession | null) => {
    try {
      if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // almacenamiento no disponible: la sesión dura lo que dure la app abierta
    }
    for (const l of listeners) l(toSession(s))
  }
  const fromTokens = (t: TokenResponse): StoredSession => ({
    access_token: t.access_token,
    expires_at: Date.now() + t.expires_in * 1000,
    refresh_token: t.refresh_token,
    user: t.user,
  })

  async function raw(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) }
    if (token) headers.Authorization = `Bearer ${token}`
    try {
      return await fetch(`${base}${path}`, { ...init, headers })
    } catch (e) {
      throw new DataError('network', (e as Error).message)
    }
  }

  async function fail(res: Response): Promise<never> {
    let body: ApiErrorBody | null = null
    try {
      body = (await res.json()) as ApiErrorBody
    } catch {
      // respuesta sin JSON
    }
    const code = body?.error.code
    throw new DataError((code && CODE_MAP[code]) || 'unknown', body?.error.message ?? `HTTP ${res.status}`)
  }

  // Un solo refresh a la vez aunque varias pantallas pidan datos juntas.
  let refreshing: Promise<StoredSession | null> | null = null
  function refresh(): Promise<StoredSession | null> {
    refreshing ??= (async () => {
      const current = read()
      if (!current) return null
      const res = await raw('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: current.refresh_token }) })
      if (!res.ok) {
        // refresh vencido o revocado: hay que volver a ingresar
        if (res.status === 401) write(null)
        return null
      }
      const next = fromTokens((await res.json()) as TokenResponse)
      write(next)
      return next
    })().finally(() => {
      refreshing = null
    })
    return refreshing
  }

  async function validToken(): Promise<string> {
    let s = read()
    if (s && s.expires_at - 30_000 < Date.now()) s = await refresh()
    if (!s) throw new DataError('unauthorized')
    return s.access_token
  }

  /** Request autenticado: renueva el token si venció y reintenta una vez ante 401. */
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res = await raw(path, init, await validToken())
    if (res.status === 401) {
      const s = await refresh()
      if (!s) throw new DataError('unauthorized')
      res = await raw(path, init, s.access_token)
    }
    if (!res.ok) return fail(res)
    return (res.status === 204 ? undefined : await res.json()) as T
  }

  const put = (path: string, body: unknown) => call<void>(path, { method: 'PUT', body: JSON.stringify(body) })
  const del = (path: string) => call<void>(path, { method: 'DELETE' })

  return {
    kind: 'api',
    configured,
    setupHint: 'Creá el archivo .env.local con EXPO_PUBLIC_BACKEND=api y EXPO_PUBLIC_API_URL (ver README) y reiniciá con: npx expo start --clear',

    auth: {
      getSession: async () => toSession(read()),
      onChange: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      signIn: async (email, password) => {
        const res = await raw('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) })
        if (!res.ok) return fail(res)
        write(fromTokens((await res.json()) as TokenResponse))
      },
      signUp: async (email, password, nombre) => {
        const res = await raw('/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), password, nombre: nombre.trim() }),
        })
        if (!res.ok) return fail(res)
        const { session } = (await res.json()) as SignUpResponse
        if (session) write(fromTokens(session))
        return { needsConfirmation: !session }
      },
      signOut: async () => {
        const s = read()
        if (s) await raw('/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: s.refresh_token }) }).catch(() => undefined)
        write(null)
      },
    },

    data: {
      loadOwn: async () => call<DataResponse>('/data'),
      loadShared: async () => call<SharedResponse>('/shared'),
      upsert: async (table, row) => put(`/${table}/${encodeURIComponent((row as { id: string }).id)}`, row),
      remove: async (table, id) => del(`/${table}/${encodeURIComponent(id)}`),
      upsertCycles: async (rows) => {
        if (rows.length) await put('/card_cycles', rows)
      },
      removeCycle: async (cardId, periodo) => del(`/card_cycles/${encodeURIComponent(cardId)}/${encodeURIComponent(periodo)}`),
      saveSettings: async (row) => put('/settings', row),
      saveProfile: async (nombre) => put('/profile', { nombre }),
      restore: async (payload) => call<void>('/restore', { method: 'POST', body: JSON.stringify(payload) }),
    },
  }
}

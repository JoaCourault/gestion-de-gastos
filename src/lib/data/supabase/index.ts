// Adaptador Supabase: implementa el puerto de datos con supabase-js (Postgres + RLS + Supabase Auth).
// Es el único archivo de la app que importa @supabase/supabase-js.

import '../../storage'
import { createClient, type Session } from '@supabase/supabase-js'
import { AppState, Platform } from 'react-native'

import type { CardExpenseRow, CardRow, CycleRow, ExpenseRow, PersonRow, ProfileRow, SettingsRow, TypeRow } from '@contract/rows'

import { DataError, type AuthSession, type Backend } from '../port'

interface PgError {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}

function toDataError(e: PgError): DataError {
  console.error('[Supabase]', e)
  // 42703/PGRST204/PGRST205 = columna o tabla inexistente: la base no tiene las últimas migraciones
  if (e.code === '42703' || e.code === 'PGRST204' || e.code === 'PGRST205') {
    return new DataError('outdated_schema', `A tu base de Supabase le falta una actualización (${e.message}). Corré los archivos supabase/migracion-*.sql en el SQL Editor.`)
  }
  // 23503 = clave foránea: se intenta borrar algo que está en uso
  if (e.code === '23503') return new DataError('in_use', e.message)
  if (e.code === '42501') return new DataError('forbidden', e.message)
  if (/fetch|network/i.test(e.message)) return new DataError('network', e.message)
  const extra = [e.details, e.hint].filter(Boolean).join(' · ')
  return new DataError('unknown', `${e.message}${e.code ? ` (${e.code})` : ''}${extra ? `\n${extra}` : ''}`)
}

function check<T>(res: { data: T; error: PgError | null }): T {
  if (res.error) throw toDataError(res.error)
  return res.data
}

const toSession = (s: Session | null): AuthSession | null =>
  s
    ? {
        user: {
          id: s.user.id,
          email: s.user.email ?? '',
          nombre: typeof s.user.user_metadata?.nombre === 'string' ? s.user.user_metadata.nombre.trim() || null : null,
        },
      }
    : null

export function createSupabaseBackend(url: string, key: string): Backend {
  const configured = /^https?:\/\//.test(url) && key.length > 20
  const supabase = createClient(configured ? url : 'http://localhost', configured ? key : 'sin-configurar', {
    auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  })

  // En el celular, refrescar el token solo mientras la app está en primer plano.
  if (configured && Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh()
      else supabase.auth.stopAutoRefresh()
    })
  }

  const currentUserId = async () => {
    const { data } = await supabase.auth.getSession()
    const id = data.session?.user.id
    if (!id) throw new DataError('unauthorized')
    return id
  }

  return {
    kind: 'supabase',
    configured,
    setupHint:
      'Creá el archivo .env.local con EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ver README) y reiniciá con: npx expo start --clear',

    auth: {
      getSession: async () => toSession((await supabase.auth.getSession()).data.session),
      onChange: (listener) => {
        const { data } = supabase.auth.onAuthStateChange((_event, s) => listener(toSession(s)))
        return () => data.subscription.unsubscribe()
      },
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (!error) return
        if (error.message === 'Invalid login credentials') throw new DataError('invalid_credentials')
        if (/not confirmed/i.test(error.message)) throw new DataError('email_not_confirmed')
        throw new DataError('unknown', error.message)
      },
      signUp: async (email, password, nombre) => {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { nombre: nombre.trim() },
            emailRedirectTo: Platform.OS === 'web' ? window.location.origin : undefined,
          },
        })
        if (error) {
          if (/already registered/i.test(error.message)) throw new DataError('email_taken')
          if (/signups not allowed/i.test(error.message)) throw new DataError('signup_disabled')
          if (/password/i.test(error.message)) throw new DataError('weak_password')
          throw new DataError('unknown', error.message)
        }
        return { needsConfirmation: !data.session }
      },
      signOut: async () => void (await supabase.auth.signOut()),
    },

    data: {
      // Las políticas también dejan ver filas compartidas: acá se filtran solo las propias.
      loadOwn: async (userId) => {
        const [cards, cycles, people, cardExpenses, types, expenses, settings, profile] = await Promise.all([
          supabase.from('cards').select('*').eq('user_id', userId),
          supabase.from('card_cycles').select('*').eq('user_id', userId),
          supabase.from('people').select('*').eq('user_id', userId),
          supabase.from('card_expenses').select('*').eq('user_id', userId).order('fecha', { ascending: false }),
          supabase.from('expense_types').select('*').eq('user_id', userId),
          supabase.from('expenses').select('*').eq('user_id', userId).order('fecha', { ascending: false }),
          supabase.from('settings').select('*').eq('user_id', userId).maybeSingle(),
          supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
        ])
        return {
          own: {
            cards: (check(cards) ?? []) as CardRow[],
            card_cycles: (check(cycles) ?? []) as CycleRow[],
            people: (check(people) ?? []) as PersonRow[],
            card_expenses: (check(cardExpenses) ?? []) as CardExpenseRow[],
            expense_types: (check(types) ?? []) as TypeRow[],
            expenses: (check(expenses) ?? []) as ExpenseRow[],
            settings: check(settings) as SettingsRow | null,
          },
          // si falta la migración 003 no hay tabla de perfiles: se sigue sin perfil
          profile: profile.error ? null : (profile.data as ProfileRow | null),
        }
      },

      loadShared: async (userId) => {
        const [mine, profiles, cards, cycles, people, cardExpenses] = await Promise.all([
          supabase.rpc('my_person_ids'),
          supabase.from('profiles').select('*').neq('user_id', userId),
          supabase.from('cards').select('*').neq('user_id', userId),
          supabase.from('card_cycles').select('*').neq('user_id', userId),
          supabase.from('people').select('*').neq('user_id', userId),
          supabase.from('card_expenses').select('*').neq('user_id', userId).order('fecha', { ascending: false }),
        ])
        return {
          my_person_ids: (check(mine) as string[] | null) ?? [],
          owners: (check(profiles) ?? []) as ProfileRow[],
          cards: (check(cards) ?? []) as CardRow[],
          card_cycles: (check(cycles) ?? []) as CycleRow[],
          people: (check(people) ?? []) as PersonRow[],
          card_expenses: (check(cardExpenses) ?? []) as CardExpenseRow[],
        }
      },

      upsert: async (table, row) => void check(await supabase.from(table).upsert(row)),
      remove: async (table, id) => void check(await supabase.from(table).delete().eq('id', id)),
      upsertCycles: async (rows) => {
        if (rows.length) check(await supabase.from('card_cycles').upsert(rows))
      },
      removeCycle: async (cardId, periodo) =>
        void check(await supabase.from('card_cycles').delete().eq('card_id', cardId).eq('periodo', periodo)),
      saveSettings: async (row) =>
        void check(await supabase.from('settings').upsert({ user_id: await currentUserId(), ...row })),
      saveProfile: async (nombre) =>
        void check(await supabase.from('profiles').upsert({ user_id: await currentUserId(), nombre })),
      restore: async (payload) => void check(await supabase.rpc('restore_backup', { payload })),
    },
  }
}

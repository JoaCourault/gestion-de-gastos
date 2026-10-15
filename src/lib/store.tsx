import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useAuth } from './auth'
import { getRaw, setRaw } from './prefs'
import { api, loadAll, type BackupPayload, fromPayload, toPayload } from './repo'
import type { AppData, Card, CardExpense, Expense, ExpenseType, ISODate, Period, Person, Settings } from './types'

type Status = 'loading' | 'ready' | 'error'
type LoadResult = { data: AppData | null; offline: boolean; error: string | null }

interface Store {
  data: AppData | null
  status: Status
  error: string | null
  /** Mostrando la última copia guardada en el dispositivo porque no hubo conexión. */
  offline: boolean
  reload: () => Promise<void>
  saveCard: (c: Card) => Promise<void>
  deleteCard: (id: string) => Promise<void>
  saveCycle: (cardId: string, p: Period, cierre: ISODate, vencimiento: ISODate) => Promise<void>
  resetCycle: (cardId: string, p: Period) => Promise<void>
  /** Guarda varias fechas reales de una vez (para conservar el historial al cambiar los días habituales). */
  saveCycles: (cardId: string, cycles: Card['ciclos']) => Promise<void>
  savePerson: (p: Person) => Promise<void>
  deletePerson: (id: string) => Promise<void>
  saveCardExpense: (e: CardExpense) => Promise<void>
  deleteCardExpense: (id: string) => Promise<void>
  saveType: (t: ExpenseType) => Promise<void>
  deleteType: (id: string) => Promise<void>
  saveExpense: (e: Expense) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  saveSettings: (s: Settings) => Promise<void>
  saveProfile: (nombre: string) => Promise<void>
  restore: (payload: BackupPayload) => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list]
const without = <T extends { id: string }>(list: T[], id: string) => list.filter((x) => x.id !== id)

export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const cacheKey = userId ? `cache:data:${userId}` : null
  const rawMeta = session?.user.user_metadata?.nombre
  const metaNombre = typeof rawMeta === 'string' ? rawMeta.trim() : ''

  const [data, setData] = useState<AppData | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)

  const persistCache = useCallback(
    (d: AppData) => cacheKey && setRaw(cacheKey, JSON.stringify(toPayload(d))),
    [cacheKey],
  )

  /** Lee de Supabase; si no hay conexión, recurre a la última copia guardada en el dispositivo. */
  const fetchState = useCallback(async (): Promise<LoadResult> => {
    try {
      if (!userId) throw new Error('Sesión requerida')
      const d = await loadAll(userId)
      // Primera carga después de registrarse: copiar el nombre al perfil que ven los demás.
      if (!d.profile.nombre && metaNombre) {
        await api.saveProfile(metaNombre).then(
          () => (d.profile = { nombre: metaNombre }),
          () => undefined,
        )
      }
      persistCache(d)
      return { data: d, offline: false, error: null }
    } catch (e) {
      const cached = cacheKey ? getRaw(cacheKey) : null
      if (cached) return { data: fromPayload(JSON.parse(cached)), offline: true, error: null }
      return { data: null, offline: false, error: (e as Error).message }
    }
  }, [userId, metaNombre, cacheKey, persistCache])

  const applyState = useCallback((r: LoadResult) => {
    setData(r.data)
    setOffline(r.offline)
    setError(r.error)
    setStatus(r.data ? 'ready' : 'error')
  }, [])

  const reload = useCallback(async () => applyState(await fetchState()), [fetchState, applyState])

  useEffect(() => {
    let cancelled = false
    fetchState().then((r) => !cancelled && applyState(r))
    return () => {
      cancelled = true
    }
  }, [fetchState, applyState])

  /** Ejecuta la escritura en Supabase y, si sale bien, aplica el cambio al estado local. */
  const mutate = useCallback(
    async (write: () => Promise<void>, apply: (d: AppData) => AppData) => {
      await write()
      setOffline(false)
      setData((d) => {
        if (!d) return d
        const next = apply(d)
        persistCache(next)
        return next
      })
    },
    [persistCache],
  )

  const store = useMemo<Store>(
    () => ({
      data,
      status,
      error,
      offline,
      reload,
      saveCard: (c) =>
        mutate(
          () => api.saveCard(c),
          (d) => ({ ...d, cards: upsert(d.cards, c).sort((a, b) => a.nombre.localeCompare(b.nombre)) }),
        ),
      deleteCard: (id) => mutate(() => api.deleteCard(id), (d) => ({ ...d, cards: without(d.cards, id) })),
      saveCycle: (cardId, p, cierre, vencimiento) =>
        mutate(
          () => api.saveCycle(cardId, p, cierre, vencimiento),
          (d) => ({
            ...d,
            cards: d.cards.map((c) => (c.id === cardId ? { ...c, ciclos: { ...c.ciclos, [p]: { cierre, vencimiento } } } : c)),
          }),
        ),
      saveCycles: (cardId, cycles) =>
        mutate(
          () => api.saveCycles(cardId, cycles),
          (d) => ({
            ...d,
            cards: d.cards.map((c) => (c.id === cardId ? { ...c, ciclos: { ...c.ciclos, ...cycles } } : c)),
          }),
        ),
      resetCycle: (cardId, p) =>
        mutate(
          () => api.deleteCycle(cardId, p),
          (d) => ({
            ...d,
            cards: d.cards.map((c) => {
              if (c.id !== cardId) return c
              const { [p]: _quitado, ...ciclos } = c.ciclos
              return { ...c, ciclos }
            }),
          }),
        ),
      savePerson: (p) =>
        mutate(
          () => api.savePerson(p),
          (d) => ({ ...d, people: upsert(d.people, p).sort((a, b) => a.nombre.localeCompare(b.nombre)) }),
        ),
      deletePerson: (id) => mutate(() => api.deletePerson(id), (d) => ({ ...d, people: without(d.people, id) })),
      saveCardExpense: (e) =>
        mutate(() => api.saveCardExpense(e), (d) => ({ ...d, cardExpenses: upsert(d.cardExpenses, e) })),
      deleteCardExpense: (id) =>
        mutate(() => api.deleteCardExpense(id), (d) => ({ ...d, cardExpenses: without(d.cardExpenses, id) })),
      saveType: (t) =>
        mutate(
          () => api.saveType(t),
          (d) => ({
            ...d,
            types: upsert(d.types, t).sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nombre.localeCompare(b.nombre)),
          }),
        ),
      deleteType: (id) => mutate(() => api.deleteType(id), (d) => ({ ...d, types: without(d.types, id) })),
      saveExpense: (e) => mutate(() => api.saveExpense(e), (d) => ({ ...d, expenses: upsert(d.expenses, e) })),
      deleteExpense: (id) => mutate(() => api.deleteExpense(id), (d) => ({ ...d, expenses: without(d.expenses, id) })),
      saveSettings: (s) => mutate(() => api.saveSettings(s), (d) => ({ ...d, settings: s })),
      saveProfile: (nombre) => mutate(() => api.saveProfile(nombre), (d) => ({ ...d, profile: { nombre } })),
      restore: async (payload) => {
        await api.restore(payload)
        await reload()
      },
    }),
    [data, status, error, offline, reload, mutate],
  )

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore() {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore fuera de DataProvider')
  return s
}

/** Atajo para pantallas que solo se muestran con datos cargados. */
export function useData(): AppData {
  const { data } = useStore()
  if (!data) throw new Error('Datos no cargados')
  return data
}

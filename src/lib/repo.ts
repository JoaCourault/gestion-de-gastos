// Acceso a Supabase: carga completa, altas/bajas/modificaciones y backup.
// Convierte entre las filas de la base (snake_case) y el modelo de la app (camelCase).

import * as Crypto from 'expo-crypto'

import { supabase } from './supabase'
import {
  EMPTY_SHARED,
  ME,
  type AppData,
  type Card,
  type CardExpense,
  type Expense,
  type ExpenseType,
  type ISODate,
  type Period,
  type Person,
  type Settings,
  type SharedWithMe,
} from './types'

export const newId = () => Crypto.randomUUID()

// ───────────── Filas de la base ─────────────

interface CardRow {
  user_id?: string
  id: string
  nombre: string
  color: string
  dia_cierre: number
  dia_vencimiento: number
  activa: boolean
}
interface CycleRow {
  card_id: string
  periodo: string
  cierre: string
  vencimiento: string
}
interface PersonRow {
  id: string
  nombre: string
  email?: string | null
}
interface CardExpenseRow {
  user_id?: string
  id: string
  card_id: string
  person_id: string | null
  descripcion: string
  fijo: boolean
  fecha: string
  cuotas: number
  total: number | string
  moneda: 'ARS' | 'USD'
  partes: number
  compartido?: string[] | null
  primer_periodo_manual: string | null
  hasta: string | null
  notas: string | null
}
interface TypeRow {
  id: string
  nombre: string
  grupo: string
  clase_por_defecto: 'necesario' | 'innecesario'
}
interface ExpenseRow {
  id: string
  fecha: string
  type_id: string
  detalle: string
  monto: number | string
  clase: 'necesario' | 'innecesario'
}
interface SettingsRow {
  cotizacion_usd: number | string
  presupuesto: Settings['presupuesto']
  presupuesto_mes: Settings['presupuestoMes']
}

/** Contenido de un archivo de backup / parámetro de restore_backup(). */
export interface BackupPayload {
  cards: CardRow[]
  card_cycles: CycleRow[]
  people: PersonRow[]
  card_expenses: CardExpenseRow[]
  expense_types: TypeRow[]
  expenses: ExpenseRow[]
  settings: SettingsRow
}
export interface BackupFile {
  app: 'gestor-de-gastos'
  version: 1
  exportedAt: string
  data: BackupPayload
}

export const DEFAULT_SETTINGS: Settings = {
  cotizacionUSD: 1,
  presupuesto: { necesario: 0, innecesario: 0 },
  presupuestoMes: {},
}

// ───────────── Conversión ─────────────

const cardToRow = (c: Card): CardRow => ({
  id: c.id,
  nombre: c.nombre,
  color: c.color,
  dia_cierre: c.diaCierre,
  dia_vencimiento: c.diaVencimiento,
  activa: c.activa,
})
const cardExpenseToRow = (e: CardExpense): CardExpenseRow => ({
  id: e.id,
  card_id: e.cardId,
  person_id: e.personId === ME ? null : e.personId,
  descripcion: e.descripcion,
  fijo: e.fijo,
  fecha: e.fecha,
  cuotas: e.fijo ? 1 : e.cuotas,
  total: e.total,
  moneda: e.moneda,
  partes: e.compartido.length > 1 ? 1 : e.partes,
  compartido: e.compartido.length > 1 ? e.compartido : [],
  primer_periodo_manual: e.primerPeriodoManual,
  hasta: e.hasta,
  notas: e.notas ?? null,
})
const typeToRow = (t: ExpenseType): TypeRow => ({
  id: t.id,
  nombre: t.nombre,
  grupo: t.grupo,
  clase_por_defecto: t.clasePorDefecto,
})
const expenseToRow = (e: Expense): ExpenseRow => ({
  id: e.id,
  fecha: e.fecha,
  type_id: e.typeId,
  detalle: e.detalle,
  monto: e.monto,
  clase: e.clase,
})
const settingsToRow = (s: Settings): SettingsRow => ({
  cotizacion_usd: s.cotizacionUSD,
  presupuesto: s.presupuesto,
  presupuesto_mes: s.presupuestoMes,
})

export function fromPayload(p: BackupPayload): AppData {
  const cycles = new Map<string, Card['ciclos']>()
  for (const r of p.card_cycles) {
    const m = cycles.get(r.card_id) ?? {}
    m[r.periodo] = { cierre: r.cierre, vencimiento: r.vencimiento }
    cycles.set(r.card_id, m)
  }
  return {
    cards: p.cards
      .map((r) => ({
        id: r.id,
        nombre: r.nombre,
        color: r.color,
        diaCierre: r.dia_cierre,
        diaVencimiento: r.dia_vencimiento,
        activa: r.activa,
        ciclos: cycles.get(r.id) ?? {},
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    people: p.people
      .map((r) => ({ id: r.id, nombre: r.nombre, email: r.email ?? undefined }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    cardExpenses: p.card_expenses.map((r) => ({
      id: r.id,
      cardId: r.card_id,
      personId: r.person_id ?? ME,
      descripcion: r.descripcion,
      fijo: r.fijo,
      fecha: r.fecha,
      cuotas: r.cuotas,
      total: Number(r.total),
      moneda: r.moneda,
      partes: r.partes,
      compartido: r.compartido ?? [],
      primerPeriodoManual: r.primer_periodo_manual,
      hasta: r.hasta,
      notas: r.notas ?? undefined,
    })),
    types: p.expense_types
      .map((r) => ({ id: r.id, nombre: r.nombre, grupo: r.grupo, clasePorDefecto: r.clase_por_defecto }))
      .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nombre.localeCompare(b.nombre)),
    expenses: p.expenses.map((r) => ({
      id: r.id,
      fecha: r.fecha,
      typeId: r.type_id,
      detalle: r.detalle,
      monto: Number(r.monto),
      clase: r.clase,
    })),
    settings: p.settings
      ? {
          cotizacionUSD: Number(p.settings.cotizacion_usd),
          presupuesto: { ...DEFAULT_SETTINGS.presupuesto, ...p.settings.presupuesto },
          presupuestoMes: p.settings.presupuesto_mes ?? {},
        }
      : DEFAULT_SETTINGS,
    profile: { nombre: '' },
    shared: EMPTY_SHARED,
  }
}

export function toPayload(d: AppData): BackupPayload {
  return {
    cards: d.cards.map(cardToRow),
    card_cycles: d.cards.flatMap((c) =>
      Object.entries(c.ciclos).map(([periodo, v]) => ({ card_id: c.id, periodo, ...v })),
    ),
    people: d.people.map((p) => ({ id: p.id, nombre: p.nombre, email: p.email?.trim() || null })),
    card_expenses: d.cardExpenses.map(cardExpenseToRow),
    expense_types: d.types.map(typeToRow),
    expenses: d.expenses.map(expenseToRow),
    settings: settingsToRow(d.settings),
  }
}

export const makeBackupFile = (d: AppData): BackupFile => ({
  app: 'gestor-de-gastos',
  version: 1,
  exportedAt: new Date().toISOString(),
  data: toPayload(d),
})

/** Valida un archivo de backup leído de disco. Lanza un Error con mensaje legible si no sirve. */
export function parseBackupFile(text: string): BackupFile {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('El archivo no es un JSON válido.')
  }
  const f = json as Partial<BackupFile>
  if (f?.app !== 'gestor-de-gastos' || !f.data) throw new Error('El archivo no es un backup del Gestor de Gastos.')
  if (f.version !== 1) throw new Error(`Versión de backup no soportada (${String(f.version)}).`)
  const keys: (keyof BackupPayload)[] = ['cards', 'card_cycles', 'people', 'card_expenses', 'expense_types', 'expenses']
  for (const k of keys) if (!Array.isArray(f.data[k])) throw new Error(`Al backup le falta la sección "${k}".`)
  return f as BackupFile
}

// ───────────── Lectura / escritura ─────────────

function check<T>(res: { data: T; error: { message: string; code?: string; details?: string | null; hint?: string | null } | null }): T {
  if (res.error) {
    console.error('[Supabase]', res.error)
    // 42703 = columna inexistente: la base está desactualizada respecto de la app
    if (res.error.code === '42703') {
      throw new Error(
        `A tu base de Supabase le falta una actualización (${res.error.message}). ` +
          'Corré los archivos supabase/migracion-*.sql en el SQL Editor.',
      )
    }
    // 23503 = violación de clave foránea (se intenta borrar algo que está en uso)
    if (res.error.code === '23503' && /delete/i.test(res.error.message + (res.error.details ?? ''))) {
      throw new Error('No se puede borrar: hay registros que lo usan.')
    }
    const extra = [res.error.details, res.error.hint].filter(Boolean).join(' · ')
    throw new Error(`${res.error.message}${res.error.code ? ` (${res.error.code})` : ''}${extra ? `\n${extra}` : ''}`)
  }
  return res.data
}

/** Datos propios del usuario (las políticas de la base además dejan ver filas compartidas: se filtran acá). */
export async function loadAll(userId: string): Promise<AppData> {
  const [cards, cycles, people, cardExpenses, types, expenses, settings, shared] = await Promise.all([
    supabase.from('cards').select('*').eq('user_id', userId),
    supabase.from('card_cycles').select('*').eq('user_id', userId),
    supabase.from('people').select('*').eq('user_id', userId),
    supabase.from('card_expenses').select('*').eq('user_id', userId).order('fecha', { ascending: false }),
    supabase.from('expense_types').select('*'),
    supabase.from('expenses').select('*').order('fecha', { ascending: false }),
    supabase.from('settings').select('*').maybeSingle(),
    loadShared(userId),
  ])
  const own = fromPayload({
    cards: check(cards) as CardRow[],
    card_cycles: check(cycles) as CycleRow[],
    people: check(people) as PersonRow[],
    card_expenses: check(cardExpenses) as CardExpenseRow[],
    expense_types: check(types) as TypeRow[],
    expenses: check(expenses) as ExpenseRow[],
    settings: check(settings) as SettingsRow,
  })
  return { ...own, profile: shared.profile, shared: shared.shared }
}

/**
 * Consumos de otros usuarios donde participo (+ sus tarjetas, cierres, participantes y nombre del dueño).
 * Si la base todavía no tiene la migración 003, devuelve vacío en lugar de fallar.
 */
async function loadShared(userId: string): Promise<{ profile: AppData['profile']; shared: SharedWithMe }> {
  try {
    const [mine, profiles, cards, cycles, people, cardExpenses] = await Promise.all([
      supabase.rpc('my_person_ids'),
      supabase.from('profiles').select('*'),
      supabase.from('cards').select('*').neq('user_id', userId),
      supabase.from('card_cycles').select('*').neq('user_id', userId),
      supabase.from('people').select('*').neq('user_id', userId),
      supabase.from('card_expenses').select('*').neq('user_id', userId).order('fecha', { ascending: false }),
    ])
    const profileRows = check(profiles) as { user_id: string; nombre: string }[]
    const expenseRows = check(cardExpenses) as CardExpenseRow[]
    const cardRows = check(cards) as CardRow[]
    const parsed = fromPayload({
      cards: cardRows,
      card_cycles: check(cycles) as CycleRow[],
      people: check(people) as PersonRow[],
      card_expenses: expenseRows,
      expense_types: [],
      expenses: [],
      settings: null as unknown as SettingsRow,
    })
    const ownerOf = new Map([...cardRows, ...expenseRows].map((r) => [r.id, r.user_id ?? '']))
    const owners: Record<string, string> = {}
    for (const r of profileRows) if (r.user_id !== userId) owners[r.user_id] = r.nombre
    return {
      profile: { nombre: profileRows.find((r) => r.user_id === userId)?.nombre ?? '' },
      shared: {
        myPersonIds: (check(mine) as string[] | null) ?? [],
        owners,
        cards: parsed.cards.map((c) => ({ ...c, ownerId: ownerOf.get(c.id) ?? '' })),
        people: parsed.people,
        cardExpenses: parsed.cardExpenses.map((e) => ({ ...e, ownerId: ownerOf.get(e.id) ?? '' })),
      },
    }
  } catch (e) {
    console.warn('[Supabase] sin datos compartidos (¿falta la migración 003?)', e)
    return { profile: { nombre: '' }, shared: EMPTY_SHARED }
  }
}

export const api = {
  saveCard: async (c: Card) => void check(await supabase.from('cards').upsert(cardToRow(c))),
  deleteCard: async (id: string) => void check(await supabase.from('cards').delete().eq('id', id)),

  saveCycle: async (cardId: string, periodo: Period, cierre: ISODate, vencimiento: ISODate) =>
    void check(await supabase.from('card_cycles').upsert({ card_id: cardId, periodo, cierre, vencimiento })),
  saveCycles: async (cardId: string, cycles: Record<Period, { cierre: ISODate; vencimiento: ISODate }>) => {
    const rows = Object.entries(cycles).map(([periodo, v]) => ({ card_id: cardId, periodo, ...v }))
    if (rows.length) check(await supabase.from('card_cycles').upsert(rows))
  },
  deleteCycle: async (cardId: string, periodo: Period) =>
    void check(await supabase.from('card_cycles').delete().eq('card_id', cardId).eq('periodo', periodo)),

  savePerson: async (p: Person) =>
    void check(await supabase.from('people').upsert({ id: p.id, nombre: p.nombre, email: p.email?.trim().toLowerCase() || null })),
  deletePerson: async (id: string) => void check(await supabase.from('people').delete().eq('id', id)),

  saveCardExpense: async (e: CardExpense) => void check(await supabase.from('card_expenses').upsert(cardExpenseToRow(e))),
  deleteCardExpense: async (id: string) => void check(await supabase.from('card_expenses').delete().eq('id', id)),

  saveType: async (t: ExpenseType) => void check(await supabase.from('expense_types').upsert(typeToRow(t))),
  deleteType: async (id: string) => void check(await supabase.from('expense_types').delete().eq('id', id)),

  saveExpense: async (e: Expense) => void check(await supabase.from('expenses').upsert(expenseToRow(e))),
  deleteExpense: async (id: string) => void check(await supabase.from('expenses').delete().eq('id', id)),

  saveSettings: async (s: Settings) => {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user.id
    if (!userId) throw new Error('Sesión vencida: volvé a ingresar.')
    check(await supabase.from('settings').upsert({ user_id: userId, ...settingsToRow(s) }))
  },

  saveProfile: async (nombre: string) => {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user.id
    if (!userId) throw new Error('Sesión vencida: volvé a ingresar.')
    check(await supabase.from('profiles').upsert({ user_id: userId, nombre }))
  },

  /** Reemplaza todos los datos del usuario (transacción en la base). */
  restore: async (payload: BackupPayload) => void check(await supabase.rpc('restore_backup', { payload })),
}

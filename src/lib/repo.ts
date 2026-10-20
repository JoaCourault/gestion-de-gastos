// Repositorio de la app: convierte entre las filas del contrato (snake_case, contract/rows.ts) y el
// modelo de la app (camelCase, types.ts), y delega la lectura/escritura en el backend configurado.
// No conoce al proveedor: eso vive en lib/data/<adaptador>.

import * as Crypto from 'expo-crypto'

import type {
  BackupFile,
  BackupPayload,
  CardExpenseRow,
  CardRow,
  ExpenseRow,
  PersonRow,
  SettingsRow,
  SharedPayload,
  TypeRow,
} from '@contract/rows'

import { backend } from './data'
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

export type { BackupFile, BackupPayload }

export const newId = () => Crypto.randomUUID()

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
const personToRow = (p: Person): PersonRow => ({ id: p.id, nombre: p.nombre, email: p.email?.trim().toLowerCase() || null })
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
    people: d.people.map(personToRow),
    card_expenses: d.cardExpenses.map(cardExpenseToRow),
    expense_types: d.types.map(typeToRow),
    expenses: d.expenses.map(expenseToRow),
    settings: settingsToRow(d.settings),
  }
}

function fromShared(p: SharedPayload): SharedWithMe {
  const parsed = fromPayload({ ...p, expense_types: [], expenses: [], settings: null })
  const ownerOf = new Map([...p.cards, ...p.card_expenses].map((r) => [r.id, r.user_id ?? '']))
  return {
    myPersonIds: p.my_person_ids,
    owners: Object.fromEntries(p.owners.map((o) => [o.user_id, o.nombre])),
    ownerRates: Object.fromEntries(
      p.owners.filter((o) => Number(o.cotizacion_usd) > 0).map((o) => [o.user_id, Number(o.cotizacion_usd)]),
    ),
    cards: parsed.cards.map((c) => ({ ...c, ownerId: ownerOf.get(c.id) ?? '' })),
    people: parsed.people,
    cardExpenses: parsed.cardExpenses.map((e) => ({ ...e, ownerId: ownerOf.get(e.id) ?? '' })),
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

/** Datos propios + lo compartido conmigo. Si lo compartido falla (p. ej. base sin migrar), se sigue sin eso. */
export async function loadAll(userId: string): Promise<AppData> {
  const [{ own, profile }, shared] = await Promise.all([
    backend.data.loadOwn(userId),
    backend.data.loadShared(userId).then(fromShared, (e) => {
      console.warn('[datos] sin consumos compartidos', e)
      return EMPTY_SHARED
    }),
  ])
  return { ...fromPayload(own), profile: { nombre: profile?.nombre ?? '' }, shared }
}

const d = () => backend.data

export const api = {
  saveCard: (c: Card) => d().upsert('cards', cardToRow(c)),
  deleteCard: (id: string) => d().remove('cards', id),

  saveCycle: (cardId: string, periodo: Period, cierre: ISODate, vencimiento: ISODate) =>
    d().upsertCycles([{ card_id: cardId, periodo, cierre, vencimiento }]),
  saveCycles: (cardId: string, cycles: Record<Period, { cierre: ISODate; vencimiento: ISODate }>) =>
    d().upsertCycles(Object.entries(cycles).map(([periodo, v]) => ({ card_id: cardId, periodo, ...v }))),
  deleteCycle: (cardId: string, periodo: Period) => d().removeCycle(cardId, periodo),

  savePerson: (p: Person) => d().upsert('people', personToRow(p)),
  deletePerson: (id: string) => d().remove('people', id),

  saveCardExpense: (e: CardExpense) => d().upsert('card_expenses', cardExpenseToRow(e)),
  deleteCardExpense: (id: string) => d().remove('card_expenses', id),

  saveType: (t: ExpenseType) => d().upsert('expense_types', typeToRow(t)),
  deleteType: (id: string) => d().remove('expense_types', id),

  saveExpense: (e: Expense) => d().upsert('expenses', expenseToRow(e)),
  deleteExpense: (id: string) => d().remove('expenses', id),

  saveSettings: (s: Settings) => d().saveSettings(settingsToRow(s)),
  saveProfile: (nombre: string) => d().saveProfile(nombre),

  /** Reemplaza todos los datos del usuario (transacción en el backend). */
  restore: (payload: BackupPayload) => d().restore(payload),
}

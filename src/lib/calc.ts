import { addPeriods, dateInPeriod, diffPeriods, periodOf } from './dates'
import { ME, type AppData, type Card, type CardExpense, type Currency, type ISODate, type Period } from './types'

export interface Cycle {
  cierre: ISODate
  vencimiento: ISODate
  /** true si las fechas fueron cargadas a mano para ese período */
  ajustado: boolean
}

/** Fechas de cierre y vencimiento del resumen que cierra en el período p. */
export function cycleOf(card: Card, p: Period): Cycle {
  const manual = card.ciclos[p]
  if (manual) return { ...manual, ajustado: true }
  const cierre = dateInPeriod(p, card.diaCierre)
  const vencPeriod = card.diaVencimiento > card.diaCierre ? p : addPeriods(p, 1)
  return { cierre, vencimiento: dateInPeriod(vencPeriod, card.diaVencimiento), ajustado: false }
}

/** Resumen en el que entra una compra hecha en `fecha` (el primero cuyo cierre es >= fecha). */
export function periodForDate(card: Card, fecha: ISODate): Period {
  let p = addPeriods(periodOf(fecha), -1)
  for (let i = 0; i < 4; i++, p = addPeriods(p, 1)) {
    if (cycleOf(card, p).cierre >= fecha) return p
  }
  return addPeriods(periodOf(fecha), 1)
}

/** Período abierto hoy para la tarjeta (el próximo cierre). */
export const openPeriod = (card: Card, today: ISODate) => periodForDate(card, today)

export function firstPeriod(e: CardExpense, card: Card): Period {
  return e.primerPeriodoManual ?? periodForDate(card, e.fecha)
}

export const toARS = (monto: number, moneda: Currency, cotizacion: number) =>
  moneda === 'USD' ? monto * cotizacion : monto

/** Persona sin nombre para consumos viejos divididos con "partes". */
export const SIN_ASIGNAR = 'sin-asignar'

/**
 * A quién corresponde cada parte del consumo (fracciones que suman 1).
 * Compartido: partes iguales entre los participantes. Si no, todo es de personId.
 */
export function sharesOf(e: CardExpense): { personId: string; fraccion: number }[] {
  if (e.compartido.length > 1) return e.compartido.map((personId) => ({ personId, fraccion: 1 / e.compartido.length }))
  const partes = e.partes > 1 ? e.partes : 1
  if (partes > 1) {
    return [
      { personId: e.personId, fraccion: 1 / partes },
      { personId: SIN_ASIGNAR, fraccion: 1 - 1 / partes },
    ]
  }
  return [{ personId: e.personId, fraccion: 1 }]
}

/** Fracción del consumo que pago yo (0..1). */
export const myShare = (e: CardExpense) => sharesOf(e).reduce((a, s) => a + (s.personId === ME ? s.fraccion : 0), 0)

/** ¿La persona participa del consumo (dueña o parte de un compartido)? */
export const involves = (e: CardExpense, personId: string) => sharesOf(e).some((s) => s.personId === personId)

export interface Installment {
  /** número de cuota (1..de); en gastos fijos es 0 */
  nro: number
  de: number
  /** importe completo de la cuota en la moneda original (lo que cobra el banco) */
  monto: number
  montoARS: number
  /** parte que pago yo, en ARS */
  mioARS: number
}

/** Cuota que corresponde pagar del consumo en el resumen p (o null si no corresponde). */
export function installmentIn(e: CardExpense, card: Card, p: Period, cotizacion: number): Installment | null {
  const first = firstPeriod(e, card)
  const build = (nro: number, de: number, monto: number): Installment => {
    const montoARS = toARS(monto, e.moneda, cotizacion)
    return { nro, de, monto, montoARS, mioARS: montoARS * myShare(e) }
  }
  if (e.fijo) {
    if (p < first) return null
    if (e.hasta && p > e.hasta) return null
    return build(0, 0, e.total)
  }
  const cuotas = Math.max(1, e.cuotas)
  const nro = diffPeriods(first, p) + 1
  if (nro < 1 || nro > cuotas) return null
  return build(nro, cuotas, e.total / cuotas)
}

export type ExpenseStatus = 'pendiente' | 'en curso' | 'finalizado' | 'fijo'

/** Estado del consumo visto desde el período p: cuotas pagadas/restantes y saldo. */
export function expenseStatus(e: CardExpense, card: Card, p: Period) {
  const first = firstPeriod(e, card)
  if (e.fijo) {
    const activo = p >= first && (!e.hasta || p <= e.hasta)
    return { estado: (activo ? 'fijo' : 'finalizado') as ExpenseStatus, first, last: e.hasta, restantes: 0, saldo: 0 }
  }
  const cuotas = Math.max(1, e.cuotas)
  const last = addPeriods(first, cuotas - 1)
  const nro = diffPeriods(first, p) + 1
  // cuotas que faltan incluyendo la del período p
  const restantes = Math.min(cuotas, Math.max(0, cuotas - nro + 1))
  const saldo = (e.total / cuotas) * restantes
  const estado: ExpenseStatus = nro < 1 ? 'pendiente' : nro > cuotas ? 'finalizado' : 'en curso'
  return { estado, first, last, restantes, saldo }
}

export interface StatementLine {
  expense: CardExpense
  inst: Installment
}
export interface CardStatement {
  card: Card
  cycle: Cycle
  lines: StatementLine[]
  mio: number
  otros: number
  total: number
  /** lo que debe cada persona (sin incluirme), en ARS */
  porPersona: Map<string, number>
}

/** Resumen de cada tarjeta para el período p (montos en ARS). */
export function statements(data: AppData, p: Period, opts: { incluirInactivas?: boolean } = {}): CardStatement[] {
  const cot = data.settings.cotizacionUSD
  return data.cards
    .filter((c) => opts.incluirInactivas || c.activa)
    .map((card) => {
      const lines: StatementLine[] = []
      const porPersona = new Map<string, number>()
      let mio = 0
      let total = 0
      for (const e of data.cardExpenses) {
        if (e.cardId !== card.id) continue
        const inst = installmentIn(e, card, p, cot)
        if (!inst) continue
        lines.push({ expense: e, inst })
        total += inst.montoARS
        for (const s of sharesOf(e)) {
          const v = inst.montoARS * s.fraccion
          if (s.personId === ME) mio += v
          else porPersona.set(s.personId, (porPersona.get(s.personId) ?? 0) + v)
        }
      }
      return { card, cycle: cycleOf(card, p), lines, mio, otros: total - mio, total, porPersona }
    })
}

/** Totales de tarjetas para los próximos n períodos desde p. */
export function projection(data: AppData, from: Period, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const p = addPeriods(from, i)
    const st = statements(data, p)
    return {
      period: p,
      mio: st.reduce((a, s) => a + s.mio, 0),
      otros: st.reduce((a, s) => a + s.otros, 0),
      porTarjeta: st.map((s) => ({ card: s.card, total: s.total })),
    }
  })
}

export function budgetFor(data: AppData, month: string) {
  const o = data.settings.presupuestoMes[month] ?? {}
  return {
    necesario: o.necesario ?? data.settings.presupuesto.necesario,
    innecesario: o.innecesario ?? data.settings.presupuesto.innecesario,
  }
}

export function monthExpenses(data: AppData, month: string) {
  const list = data.expenses.filter((e) => periodOf(e.fecha) === month)
  const sum = (f: (e: (typeof list)[number]) => boolean) => list.filter(f).reduce((a, e) => a + e.monto, 0)
  const typeById = new Map(data.types.map((t) => [t.id, t]))
  const porGrupo = new Map<string, number>()
  for (const e of list) {
    const g = typeById.get(e.typeId)?.grupo || 'Sin grupo'
    porGrupo.set(g, (porGrupo.get(g) ?? 0) + e.monto)
  }
  return {
    list,
    necesario: sum((e) => e.clase === 'necesario'),
    innecesario: sum((e) => e.clase === 'innecesario'),
    porGrupo: [...porGrupo.entries()].sort((a, b) => b[1] - a[1]),
  }
}

// ───────────── Compartidos conmigo (consumos de otros usuarios) ─────────────

/** Fracción de un consumo ajeno que me corresponde, según las personas que me representan. */
export const shareFor = (e: CardExpense, personIds: string[]) =>
  sharesOf(e).reduce((a, s) => a + (personIds.includes(s.personId) ? s.fraccion : 0), 0)

export interface SharedLine {
  expense: CardExpense
  card: Card
  inst: Installment
  /** lo que me toca pagarle al dueño, en ARS */
  miParte: number
}

/** Por cada usuario dueño: lo que le debo en el resumen p por consumos donde participo. */
export function sharedDebts(data: AppData, p: Period) {
  const { shared } = data
  const cardById = new Map(shared.cards.map((c) => [c.id, c]))
  const porDueño = new Map<string, SharedLine[]>()
  for (const e of shared.cardExpenses) {
    const card = cardById.get(e.cardId)
    if (!card) continue
    const inst = installmentIn(e, card, p, data.settings.cotizacionUSD)
    if (!inst) continue
    const f = shareFor(e, shared.myPersonIds)
    if (f <= 0) continue
    porDueño.set(e.ownerId, [...(porDueño.get(e.ownerId) ?? []), { expense: e, card, inst, miParte: inst.montoARS * f }])
  }
  return [...porDueño.entries()].map(([ownerId, lines]) => ({
    ownerId,
    nombre: shared.owners[ownerId] || 'Otro usuario',
    lines,
    total: lines.reduce((a, l) => a + l.miParte, 0),
  }))
}

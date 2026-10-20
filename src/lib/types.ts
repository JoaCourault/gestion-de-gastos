// Modelo de datos de la app (camelCase). En la base las tablas usan snake_case (contract/rows.ts);
// la conversión está en repo.ts.

/** Período de resumen identificado por el MES DE CIERRE, formato 'YYYY-MM' (igual que las columnas OCT-26 del Excel). */
export type Period = string
/** Fecha local 'YYYY-MM-DD'. */
export type ISODate = string
export type Currency = 'ARS' | 'USD'
export type Clase = 'necesario' | 'innecesario'

export interface Card {
  id: string
  nombre: string
  color: string
  /** Día de cierre habitual (1-31). Se usa cuando el período no tiene fechas cargadas a mano. */
  diaCierre: number
  /** Día de vencimiento habitual. Si es <= diaCierre, vence el mes siguiente al cierre. */
  diaVencimiento: number
  activa: boolean
  /** Fechas reales por período (sobrescriben el día habitual). */
  ciclos: Record<Period, { cierre: ISODate; vencimiento: ISODate }>
}

export interface Person {
  id: string
  nombre: string
  /** Si un usuario de la app tiene este email, ve los consumos donde participa esta persona. */
  email?: string
}

/** Consumo con tarjeta de crédito (fila de la hoja TARJETAS). */
export interface CardExpense {
  id: string
  cardId: string
  /** ME ('yo') = gasto propio; otro id = gasto de un tercero hecho con mi tarjeta (ej. "VISA - Mateo"). En la base, ME es null. */
  personId: string
  descripcion: string
  /** Gasto fijo / suscripción: se cobra todos los meses por el total, sin cuotas. */
  fijo: boolean
  fecha: ISODate
  cuotas: number
  /** Monto total de la compra (o el importe mensual si es fijo). */
  total: number
  moneda: Currency
  /**
   * Consumo compartido: participantes en partes iguales (ME y/o ids de personas).
   * Vacío = el consumo es entero de personId. El banco cobra el total; cada uno debe su parte.
   */
  compartido: string[]
  /** Obsoleto (versiones anteriores): divide el importe entre N sin nombres. Se respeta si compartido está vacío. */
  partes: number
  /** Primer resumen donde entra la cuota 1. null = se calcula según fecha y cierres. */
  primerPeriodoManual: Period | null
  /** Para gastos fijos: último período en que se cobra (baja de la suscripción). */
  hasta: Period | null
  notas?: string
}

export interface ExpenseType {
  id: string
  nombre: string
  /** Agrupador para totales (ej. Víveres, Viajes). */
  grupo: string
  clasePorDefecto: Clase
}

/** Gasto que no es con tarjeta de crédito (hojas "Gastos YYYY-MM"). */
export interface Expense {
  id: string
  fecha: ISODate
  typeId: string
  detalle: string
  monto: number
  clase: Clase
}

export interface Settings {
  cotizacionUSD: number
  presupuesto: Record<Clase, number>
  /** Presupuesto específico de un mes ('YYYY-MM'). */
  presupuestoMes: Record<string, Partial<Record<Clase, number>>>
}

export interface AppData {
  cards: Card[]
  people: Person[]
  cardExpenses: CardExpense[]
  types: ExpenseType[]
  expenses: Expense[]
  settings: Settings
  /** Nombre con el que te ven los demás usuarios. */
  profile: { nombre: string }
  /** Datos de otros usuarios donde participás (solo lectura). No entran en el backup. */
  shared: SharedWithMe
}

/** Consumos de otros usuarios en los que participás, con lo necesario para calcular tus cuotas. */
export interface SharedWithMe {
  /** Personas (de otros usuarios) que te representan: tu parte es la de estos ids. */
  myPersonIds: string[]
  /** id de usuario dueño → nombre */
  owners: Record<string, string>
  /** id de usuario dueño → su cotización del dólar (si el backend la expone) */
  ownerRates: Record<string, number>
  cards: (Card & { ownerId: string })[]
  people: Person[]
  cardExpenses: (CardExpense & { ownerId: string })[]
}

export const EMPTY_SHARED: SharedWithMe = { myPersonIds: [], owners: {}, ownerRates: {}, cards: [], people: [], cardExpenses: [] }

export const ME = 'yo'

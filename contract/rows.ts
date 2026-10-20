// Contrato de datos compartido entre la app y cualquier backend (Supabase o el servidor propio).
// Son las filas tal como se guardan en Postgres (snake_case). Sin dependencias: lo importan
// tanto la app (Expo) como el servidor (Node).

export type Clase = 'necesario' | 'innecesario'
export type Moneda = 'ARS' | 'USD'

export interface CardRow {
  id: string
  user_id?: string
  nombre: string
  color: string
  dia_cierre: number
  dia_vencimiento: number
  activa: boolean
}

/** Fechas reales de un período ('YYYY-MM' = mes de cierre). */
export interface CycleRow {
  card_id: string
  periodo: string
  cierre: string
  vencimiento: string
}

export interface PersonRow {
  id: string
  nombre: string
  /** Si coincide con el email confirmado de un usuario, ese usuario ve los consumos donde participa. */
  email?: string | null
}

export interface CardExpenseRow {
  id: string
  user_id?: string
  card_id: string
  /** null = gasto propio */
  person_id: string | null
  descripcion: string
  fijo: boolean
  fecha: string
  cuotas: number
  total: number | string
  moneda: Moneda
  /** obsoleto: reemplazado por compartido */
  partes: number
  /** participantes de un consumo compartido: 'yo' o id de persona */
  compartido?: string[] | null
  primer_periodo_manual: string | null
  hasta: string | null
  notas: string | null
}

export interface TypeRow {
  id: string
  nombre: string
  grupo: string
  clase_por_defecto: Clase
}

export interface ExpenseRow {
  id: string
  fecha: string
  type_id: string
  detalle: string
  monto: number | string
  clase: Clase
}

export interface SettingsRow {
  cotizacion_usd: number | string
  presupuesto: Record<Clase, number>
  presupuesto_mes: Record<string, Partial<Record<Clase, number>>>
}

export interface ProfileRow {
  user_id: string
  nombre: string
}

/** Todos los datos propios de un usuario. Es también el contenido de un archivo de backup. */
export interface BackupPayload {
  cards: CardRow[]
  card_cycles: CycleRow[]
  people: PersonRow[]
  card_expenses: CardExpenseRow[]
  expense_types: TypeRow[]
  expenses: ExpenseRow[]
  settings: SettingsRow | null
}

export interface BackupFile {
  app: 'gestor-de-gastos'
  version: 1
  exportedAt: string
  data: BackupPayload
}

/** Lo que otros usuarios comparten conmigo (solo lectura). */
export interface SharedPayload {
  /** personas de otros usuarios que me representan (mismo email, confirmado) */
  my_person_ids: string[]
  /** dueños de esos consumos (nombre y, si el backend lo expone, su cotización del dólar) */
  owners: (ProfileRow & { cotizacion_usd?: number | string | null })[]
  cards: CardRow[]
  card_cycles: CycleRow[]
  people: PersonRow[]
  card_expenses: CardExpenseRow[]
}

/** Tablas con id propio que se editan de a una fila. */
export type EntityTable = 'cards' | 'people' | 'card_expenses' | 'expense_types' | 'expenses'

export interface EntityRows {
  cards: CardRow
  people: PersonRow
  card_expenses: CardExpenseRow
  expense_types: TypeRow
  expenses: ExpenseRow
}

export const ENTITY_TABLES: EntityTable[] = ['cards', 'people', 'card_expenses', 'expense_types', 'expenses']

// Validación de las filas que manda la app (mismas formas que contract/rows.ts).

import { z } from 'zod'

const id = z.uuid()
const period = z.string().regex(/^\d{4}-\d{2}$/, 'período YYYY-MM')
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha YYYY-MM-DD')
const clase = z.enum(['necesario', 'innecesario'])
const money = z.coerce.number().finite().min(-1e12).max(1e12)

export const cardSchema = z.object({
  id,
  nombre: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dia_cierre: z.number().int().min(1).max(31),
  dia_vencimiento: z.number().int().min(1).max(31),
  activa: z.boolean(),
})

export const personSchema = z.object({
  id,
  nombre: z.string().trim().min(1).max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email())
    .nullish()
    .or(z.literal('').transform(() => null)),
})

export const cardExpenseSchema = z.object({
  id,
  card_id: id,
  person_id: id.nullable(),
  descripcion: z.string().trim().min(1).max(200),
  fijo: z.boolean(),
  fecha: date,
  cuotas: z.number().int().min(1).max(120),
  total: money,
  moneda: z.enum(['ARS', 'USD']),
  partes: z.number().int().min(1).max(100).default(1),
  compartido: z
    .array(z.union([z.literal('yo'), id]))
    .max(50)
    .nullish()
    .transform((v) => v ?? []),
  primer_periodo_manual: period.nullable(),
  hasta: period.nullable(),
  notas: z.string().max(2000).nullish().transform((v) => v ?? null),
})

export const typeSchema = z.object({
  id,
  nombre: z.string().trim().min(1).max(80),
  grupo: z.string().trim().max(80).default(''),
  clase_por_defecto: clase,
})

export const expenseSchema = z.object({
  id,
  fecha: date,
  type_id: id,
  detalle: z.string().max(500).default(''),
  monto: money,
  clase,
})

export const cycleSchema = z
  .object({ card_id: id, periodo: period, cierre: date, vencimiento: date })
  .refine((c) => c.vencimiento >= c.cierre, 'el vencimiento no puede ser anterior al cierre')

const budget = z.object({ necesario: z.number().min(0), innecesario: z.number().min(0) })
export const settingsSchema = z.object({
  cotizacion_usd: z.coerce.number().positive().max(1e9),
  presupuesto: budget,
  presupuesto_mes: z.record(period, budget.partial()),
})

export const backupSchema = z.object({
  cards: z.array(cardSchema).max(500),
  card_cycles: z.array(cycleSchema).max(20_000),
  people: z.array(personSchema).max(500),
  card_expenses: z.array(cardExpenseSchema).max(50_000),
  expense_types: z.array(typeSchema).max(1000),
  expenses: z.array(expenseSchema).max(100_000),
  settings: settingsSchema.nullish().transform((v) => v ?? null),
})

/** Esquema y columnas editables de cada tabla con id propio. */
export const ENTITIES = {
  cards: { schema: cardSchema, columns: ['id', 'nombre', 'color', 'dia_cierre', 'dia_vencimiento', 'activa'] },
  people: { schema: personSchema, columns: ['id', 'nombre', 'email'] },
  card_expenses: {
    schema: cardExpenseSchema,
    columns: [
      'id',
      'card_id',
      'person_id',
      'descripcion',
      'fijo',
      'fecha',
      'cuotas',
      'total',
      'moneda',
      'partes',
      'compartido',
      'primer_periodo_manual',
      'hasta',
      'notas',
    ],
  },
  expense_types: { schema: typeSchema, columns: ['id', 'nombre', 'grupo', 'clase_por_defecto'] },
  expenses: { schema: expenseSchema, columns: ['id', 'fecha', 'type_id', 'detalle', 'monto', 'clase'] },
} as const

export type EntityName = keyof typeof ENTITIES
export const isEntity = (t: string): t is EntityName => t in ENTITIES

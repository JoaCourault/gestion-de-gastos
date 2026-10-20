// Acceso a los datos de un usuario. Acá viven los permisos (lo que en Supabase hacía RLS):
// toda consulta filtra por user_id y toda referencia (tarjeta, persona, tipo) se verifica como propia.

import type { BackupPayload, ProfileRow, SettingsRow } from '../../../contract/rows'
import type { Db } from '../db/pool'
import { ApiError } from '../errors'
import { backupSchema, cycleSchema, ENTITIES, settingsSchema, type EntityName } from './schemas'
import type { z } from 'zod'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Columnas que se devuelven (sin user_id ni created_at). */
const SELECT = {
  cards: 'id, nombre, color, dia_cierre, dia_vencimiento, activa',
  card_cycles: 'card_id, periodo, cierre, vencimiento',
  people: 'id, nombre, email',
  card_expenses:
    'id, card_id, person_id, descripcion, fijo, fecha, cuotas, total, moneda, partes, compartido, primer_periodo_manual, hasta, notas',
  expense_types: 'id, nombre, grupo, clase_por_defecto',
  expenses: 'id, fecha, type_id, detalle, monto, clase',
}

export async function loadOwn(db: Db, userId: string): Promise<{ own: BackupPayload; profile: ProfileRow | null }> {
  const q = (table: keyof typeof SELECT, order = '') =>
    db.query(`select ${SELECT[table]} from ${table} where user_id = $1 ${order}`, [userId])
  const [cards, card_cycles, people, card_expenses, expense_types, expenses, settings, profile] = await Promise.all([
    q('cards'),
    q('card_cycles'),
    q('people'),
    q('card_expenses', 'order by fecha desc'),
    q('expense_types'),
    q('expenses', 'order by fecha desc'),
    db.query<SettingsRow>('select cotizacion_usd, presupuesto, presupuesto_mes from settings where user_id = $1', [userId]),
    db.query<ProfileRow>('select user_id, nombre from profiles where user_id = $1', [userId]),
  ])
  return {
    own: { cards, card_cycles, people, card_expenses, expense_types, expenses, settings: settings[0] ?? null } as unknown as BackupPayload,
    profile: profile[0] ?? null,
  }
}

/** Verifica que todos los ids existan en `table` y sean del usuario. */
async function assertOwned(db: Db, table: string, userId: string, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  if (!unique.length) return
  const [{ n }] = await db.query<{ n: number }>(
    `select count(*)::int as n from ${table} where user_id = $1 and id = any($2::uuid[])`,
    [userId, unique],
  )
  if (n !== unique.length) throw new ApiError('forbidden', `Referencia inválida en ${table}.`)
}

type Row<T extends EntityName> = z.infer<(typeof ENTITIES)[T]['schema']>

async function checkReferences<T extends EntityName>(db: Db, table: T, userId: string, row: Row<T>) {
  if (table === 'card_expenses') {
    const e = row as Row<'card_expenses'>
    await assertOwned(db, 'cards', userId, [e.card_id])
    await assertOwned(db, 'people', userId, [e.person_id, ...e.compartido.filter((p) => UUID.test(p))])
  }
  if (table === 'expenses') await assertOwned(db, 'expense_types', userId, [(row as Row<'expenses'>).type_id])
}

/** Inserta o actualiza una fila propia. Si el id existe pero es de otro usuario → forbidden. */
export async function upsertEntity(db: Db, table: EntityName, userId: string, id: string, body: unknown) {
  const { schema, columns } = ENTITIES[table]
  const row = schema.parse(body) as Record<string, unknown>
  if (row.id !== id) throw new ApiError('bad_request', 'El id de la URL no coincide con el del cuerpo.')
  await checkReferences(db, table, userId, row as never)

  const cols = columns as readonly string[]
  const params = cols.map((c) => row[c])
  const placeholders = cols.map((_, i) => `$${i + 2}`).join(', ')
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')
  const done = await db.query(
    `insert into ${table} (user_id, ${cols.join(', ')}) values ($1, ${placeholders})
     on conflict (id) do update set ${updates} where ${table}.user_id = excluded.user_id
     returning id`,
    [userId, ...params],
  )
  if (!done.length) throw new ApiError('forbidden')
}

export async function deleteEntity(db: Db, table: EntityName, userId: string, id: string) {
  if (!UUID.test(id)) throw new ApiError('bad_request', 'Id inválido.')
  if (table === 'people') {
    // los participantes de un compartido no tienen clave foránea: se controla acá
    const [{ n }] = await db.query<{ n: number }>(
      'select count(*)::int as n from card_expenses where user_id = $1 and $2 = any(compartido)',
      [userId, id],
    )
    if (n > 0) throw new ApiError('in_use', 'La persona participa en consumos compartidos.')
  }
  await db.query(`delete from ${table} where id = $1 and user_id = $2`, [id, userId])
}

export async function upsertCycles(db: Db, userId: string, body: unknown) {
  const rows = cycleSchema.array().max(500).parse(body)
  await assertOwned(db, 'cards', userId, rows.map((r) => r.card_id))
  await db.tx(async (tx) => {
    for (const r of rows) {
      await tx.query(
        `insert into card_cycles (card_id, periodo, user_id, cierre, vencimiento) values ($1, $2, $3, $4, $5)
         on conflict (card_id, periodo) do update set cierre = excluded.cierre, vencimiento = excluded.vencimiento`,
        [r.card_id, r.periodo, userId, r.cierre, r.vencimiento],
      )
    }
  })
}

export async function deleteCycle(db: Db, userId: string, cardId: string, periodo: string) {
  if (!UUID.test(cardId)) throw new ApiError('bad_request', 'Id inválido.')
  await db.query('delete from card_cycles where card_id = $1 and periodo = $2 and user_id = $3', [cardId, periodo, userId])
}

export async function saveSettings(db: Db, userId: string, body: unknown) {
  const s = settingsSchema.parse(body)
  await db.query(
    `insert into settings (user_id, cotizacion_usd, presupuesto, presupuesto_mes) values ($1, $2, $3, $4)
     on conflict (user_id) do update set cotizacion_usd = excluded.cotizacion_usd,
       presupuesto = excluded.presupuesto, presupuesto_mes = excluded.presupuesto_mes`,
    [userId, s.cotizacion_usd, s.presupuesto, s.presupuesto_mes],
  )
}

export async function saveProfile(db: Db, userId: string, nombre: string) {
  await db.query(
    `insert into profiles (user_id, nombre) values ($1, $2) on conflict (user_id) do update set nombre = excluded.nombre`,
    [userId, nombre.trim().slice(0, 80)],
  )
}

/** Reemplaza TODOS los datos del usuario por los del backup, en una transacción. */
export async function restore(db: Db, userId: string, body: unknown) {
  const p = backupSchema.parse(body)

  // Las referencias tienen que apuntar a filas del mismo backup (nunca a datos de otra cuenta).
  const has = (list: { id: string }[]) => new Set(list.map((x) => x.id))
  const cards = has(p.cards)
  const people = has(p.people)
  const types = has(p.expense_types)
  const bad =
    p.card_cycles.some((c) => !cards.has(c.card_id)) ||
    p.card_expenses.some(
      (e) =>
        !cards.has(e.card_id) ||
        (e.person_id && !people.has(e.person_id)) ||
        e.compartido.some((x) => x !== 'yo' && !people.has(x)),
    ) ||
    p.expenses.some((e) => !types.has(e.type_id))
  if (bad) throw new ApiError('bad_request', 'El backup tiene referencias inconsistentes.')

  await db.tx(async (tx) => {
    for (const t of ['expenses', 'card_expenses', 'card_cycles', 'cards', 'people', 'expense_types', 'settings']) {
      await tx.query(`delete from ${t} where user_id = $1`, [userId])
    }
    const insertAll = async (table: EntityName, rows: Record<string, unknown>[]) => {
      const cols = ENTITIES[table].columns as readonly string[]
      for (const r of rows) {
        await tx.query(
          `insert into ${table} (user_id, ${cols.join(', ')}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})`,
          [userId, ...cols.map((c) => r[c])],
        )
      }
    }
    await insertAll('cards', p.cards)
    await insertAll('people', p.people)
    await insertAll('expense_types', p.expense_types)
    await insertAll('card_expenses', p.card_expenses)
    await insertAll('expenses', p.expenses)
    for (const c of p.card_cycles) {
      await tx.query(
        'insert into card_cycles (card_id, periodo, user_id, cierre, vencimiento) values ($1, $2, $3, $4, $5)',
        [c.card_id, c.periodo, userId, c.cierre, c.vencimiento],
      )
    }
    if (p.settings) await saveSettings(tx, userId, p.settings)
  })
}

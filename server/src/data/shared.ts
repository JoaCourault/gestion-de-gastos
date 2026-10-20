// Consumos de otros usuarios en los que participa el usuario actual (equivalente a las funciones
// my_person_ids/shared_* de la migración 003 de Supabase, pero en código y sin depender de RLS).
//
// Regla: una persona cargada por otro usuario "me representa" si su email es igual al mío Y mi email
// está confirmado. Veo (solo lectura) los consumos donde esa persona es dueña o participa.

import type { SharedPayload } from '../../../contract/rows'
import type { Db } from '../db/pool'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function loadShared(db: Db, userId: string): Promise<SharedPayload> {
  const mine = (
    await db.query<{ id: string }>(
      `select p.id from people p join users u on u.id = $1
       where u.email_confirmed_at is not null and p.email is not null
         and lower(p.email) = lower(u.email) and p.user_id <> u.id`,
      [userId],
    )
  ).map((r) => r.id)

  const empty: SharedPayload = { my_person_ids: mine, owners: [], cards: [], card_cycles: [], people: [], card_expenses: [] }
  if (!mine.length) return empty

  const card_expenses = await db.query<SharedPayload['card_expenses'][number]>(
    `select id, user_id, card_id, person_id, descripcion, fijo, fecha, cuotas, total, moneda, partes, compartido,
            primer_periodo_manual, hasta, notas
     from card_expenses
     where user_id <> $1 and (person_id = any($2::uuid[]) or compartido && $3::text[])
     order by fecha desc`,
    [userId, mine, mine],
  )
  if (!card_expenses.length) return empty

  const cardIds = [...new Set(card_expenses.map((e) => e.card_id))]
  const personIds = [
    ...new Set(
      card_expenses.flatMap((e) => [e.person_id, ...(e.compartido ?? [])]).filter((x): x is string => !!x && UUID.test(x)),
    ),
  ]
  const ownerIds = [...new Set(card_expenses.map((e) => e.user_id!))]

  const [cards, card_cycles, people, owners] = await Promise.all([
    db.query<SharedPayload['cards'][number]>(
      'select id, user_id, nombre, color, dia_cierre, dia_vencimiento, activa from cards where id = any($1::uuid[])',
      [cardIds],
    ),
    db.query<SharedPayload['card_cycles'][number]>(
      'select card_id, periodo, cierre, vencimiento from card_cycles where card_id = any($1::uuid[])',
      [cardIds],
    ),
    // de las personas ajenas solo se muestra el nombre (el email no se expone)
    db.query<SharedPayload['people'][number]>('select id, nombre from people where id = any($1::uuid[])', [personIds]),
    // la cotización del dueño: los consumos en USD se calculan como los ve él (no con la de quien mira)
    db.query<SharedPayload['owners'][number]>(
      `select u.id as user_id, coalesce(p.nombre, '') as nombre, s.cotizacion_usd
       from users u left join profiles p on p.user_id = u.id left join settings s on s.user_id = u.id
       where u.id = any($1::uuid[])`,
      [ownerIds],
    ),
  ])

  return { my_person_ids: mine, owners, cards, card_cycles, people, card_expenses }
}

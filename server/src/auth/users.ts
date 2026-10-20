// Operaciones sobre usuarios, compartidas por la API y la CLI de administración.

import type { Db } from '../db/pool'
import { ApiError } from '../errors'
import { hashPassword, MIN_PASSWORD } from './passwords'

export interface UserRow {
  id: string
  email: string
  password_hash: string
  email_confirmed_at: string | null
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | null> {
  const rows = await db.query<UserRow>('select * from users where lower(email) = $1', [normalizeEmail(email)])
  return rows[0] ?? null
}

export async function findUserById(db: Db, id: string): Promise<UserRow | null> {
  const rows = await db.query<UserRow>('select * from users where id = $1', [id])
  return rows[0] ?? null
}

export async function createUser(
  db: Db,
  input: { email: string; password: string; nombre: string; confirmed: boolean },
): Promise<UserRow> {
  const email = normalizeEmail(input.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError('bad_request', 'Email inválido.')
  if (input.password.length < MIN_PASSWORD) throw new ApiError('weak_password')
  if (await findUserByEmail(db, email)) throw new ApiError('email_taken')
  return db.tx(async (tx) => {
    const [user] = await tx.query<UserRow>(
      `insert into users (email, password_hash, email_confirmed_at)
       values ($1, $2, case when $3 then now() end) returning *`,
      [email, await hashPassword(input.password), input.confirmed],
    )
    await tx.query('insert into profiles (user_id, nombre) values ($1, $2)', [user.id, input.nombre.trim()])
    return user
  })
}

export async function confirmUser(db: Db, userId: string) {
  await db.query('update users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1', [userId])
}

export async function setPassword(db: Db, userId: string, password: string) {
  if (password.length < MIN_PASSWORD) throw new ApiError('weak_password')
  await db.tx(async (tx) => {
    await tx.query('update users set password_hash = $2 where id = $1', [userId, await hashPassword(password)])
    // cerrar todas las sesiones abiertas
    await tx.query('delete from refresh_tokens where user_id = $1', [userId])
  })
}

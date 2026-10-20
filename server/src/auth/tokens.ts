// Tokens: access = JWT HS256 de vida corta; refresh = valor aleatorio opaco (en la base solo su hash), rota en cada uso.

import { createHash, randomBytes } from 'node:crypto'

import { sign, verify } from 'hono/jwt'

import type { Config } from '../config'
import type { Db } from '../db/pool'

export interface AccessClaims {
  sub: string
  email: string
  exp: number
}

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')
export const randomToken = () => randomBytes(32).toString('base64url')

export async function signAccess(cfg: Config, user: { id: string; email: string }) {
  const exp = Math.floor(Date.now() / 1000) + cfg.accessTtl
  return sign({ sub: user.id, email: user.email, exp } satisfies AccessClaims, cfg.jwtSecret, 'HS256')
}

export async function verifyAccess(cfg: Config, token: string): Promise<AccessClaims | null> {
  try {
    return (await verify(token, cfg.jwtSecret, 'HS256')) as unknown as AccessClaims
  } catch {
    return null
  }
}

export async function issueRefresh(db: Db, cfg: Config, userId: string): Promise<string> {
  const token = randomToken()
  await db.query(
    `insert into refresh_tokens (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), userId, cfg.refreshTtlDays],
  )
  return token
}

/** Consume un refresh token (lo borra) y devuelve su usuario si era válido. */
export async function consumeRefresh(db: Db, token: string): Promise<string | null> {
  const rows = await db.query<{ user_id: string; expired: boolean }>(
    `delete from refresh_tokens where token_hash = $1 returning user_id, expires_at < now() as expired`,
    [sha256(token)],
  )
  return rows[0] && !rows[0].expired ? rows[0].user_id : null
}

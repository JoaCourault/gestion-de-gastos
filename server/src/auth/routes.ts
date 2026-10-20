import { Hono, type MiddlewareHandler } from 'hono'
import { z } from 'zod'

import type { ApiUser, SignUpResponse, TokenResponse } from '../../../contract/api'
import type { Config } from '../config'
import type { Db } from '../db/pool'
import { ApiError } from '../errors'
import type { Mailer } from './mailer'
import { hashPassword, needsRehash, verifyPassword } from './passwords'
import { consumeRefresh, issueRefresh, randomToken, sha256, signAccess, verifyAccess } from './tokens'
import { confirmUser, createUser, findUserByEmail, findUserById, type UserRow } from './users'

export interface AuthVars {
  Variables: { userId: string }
}

async function toApiUser(db: Db, user: UserRow): Promise<ApiUser> {
  const [p] = await db.query<{ nombre: string }>('select nombre from profiles where user_id = $1', [user.id])
  return { id: user.id, email: user.email, nombre: p?.nombre || null }
}

async function tokensFor(db: Db, cfg: Config, user: UserRow): Promise<TokenResponse> {
  return {
    access_token: await signAccess(cfg, user),
    expires_in: cfg.accessTtl,
    refresh_token: await issueRefresh(db, cfg, user.id),
    user: await toApiUser(db, user),
  }
}

/** Exige `Authorization: Bearer <access_token>` y deja el id de usuario en c.var.userId. */
export function requireAuth(cfg: Config): MiddlewareHandler<AuthVars> {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? ''
    const claims = header.startsWith('Bearer ') ? await verifyAccess(cfg, header.slice(7)) : null
    if (!claims) throw new ApiError('unauthorized')
    c.set('userId', claims.sub)
    await next()
  }
}

const credentials = z.object({ email: z.string().min(3).max(254), password: z.string().min(1).max(200) })

export function authRoutes(db: Db, cfg: Config, mailer: Mailer) {
  const app = new Hono<AuthVars>()

  app.post('/signup', async (c) => {
    if (!cfg.signupEnabled) throw new ApiError('signup_disabled')
    const body = credentials.extend({ nombre: z.string().max(80).default('') }).parse(await c.req.json())
    const user = await createUser(db, { ...body, confirmed: !cfg.requireEmailConfirmation })
    if (!cfg.requireEmailConfirmation) return c.json<SignUpResponse>({ session: await tokensFor(db, cfg, user) })

    const token = randomToken()
    await db.query(
      `insert into email_tokens (token_hash, user_id, purpose, expires_at) values ($1, $2, 'confirm', now() + interval '3 days')`,
      [sha256(token), user.id],
    )
    await mailer.send(
      user.email,
      'Confirmá tu cuenta del Gestor de Gastos',
      `Para activar tu cuenta abrí este link:\n\n${cfg.publicUrl}/auth/confirm?token=${token}\n\nVence en 3 días.`,
    )
    return c.json<SignUpResponse>({ session: null })
  })

  app.get('/confirm', async (c) => {
    const token = c.req.query('token') ?? ''
    const rows = await db.query<{ user_id: string }>(
      `delete from email_tokens where token_hash = $1 and purpose = 'confirm' and expires_at > now() returning user_id`,
      [sha256(token)],
    )
    const ok = rows.length > 0
    if (ok) await confirmUser(db, rows[0].user_id)
    return c.html(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Gestor de Gastos</title>
       <body style="font-family:system-ui;max-width:420px;margin:15vh auto;padding:0 16px;text-align:center">
       <h2>${ok ? '¡Cuenta confirmada!' : 'El link no es válido o ya venció'}</h2>
       <p>${ok ? 'Ya podés ingresar en la app.' : 'Volvé a registrarte o pedile al administrador que confirme tu cuenta.'}</p></body>`,
      ok ? 200 : 400,
    )
  })

  app.post('/login', async (c) => {
    const { email, password } = credentials.parse(await c.req.json())
    const user = await findUserByEmail(db, email)
    if (!user || !(await verifyPassword(password, user.password_hash))) throw new ApiError('invalid_credentials')
    if (!user.email_confirmed_at && cfg.requireEmailConfirmation) throw new ApiError('email_not_confirmed')
    // usuarios importados de Supabase (bcrypt): pasar a scrypt aprovechando que tenemos la contraseña
    if (needsRehash(user.password_hash)) {
      await db.query('update users set password_hash = $2 where id = $1', [user.id, await hashPassword(password)])
    }
    return c.json(await tokensFor(db, cfg, user))
  })

  app.post('/refresh', async (c) => {
    const { refresh_token } = z.object({ refresh_token: z.string().min(10) }).parse(await c.req.json())
    const userId = await consumeRefresh(db, refresh_token)
    const user = userId ? await findUserById(db, userId) : null
    if (!user) throw new ApiError('unauthorized')
    return c.json(await tokensFor(db, cfg, user))
  })

  app.post('/logout', async (c) => {
    const { refresh_token } = z.object({ refresh_token: z.string() }).parse(await c.req.json())
    await consumeRefresh(db, refresh_token)
    return c.body(null, 204)
  })

  app.get('/me', requireAuth(cfg), async (c) => {
    const user = await findUserById(db, c.var.userId)
    if (!user) throw new ApiError('unauthorized')
    return c.json(await toApiUser(db, user))
  })

  return app
}

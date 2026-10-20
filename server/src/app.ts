// Arma la aplicación HTTP a partir de sus dependencias (base, config, mailer): fácil de testear y de reemplazar piezas.

import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { ZodError } from 'zod'

import type { ApiErrorBody } from '../../contract/api'
import type { Mailer } from './auth/mailer'
import { authRoutes } from './auth/routes'
import type { Config } from './config'
import { dataRoutes } from './data/routes'
import type { Db } from './db/pool'
import { ApiError, fromPgError } from './errors'

export function createApp(db: Db, cfg: Config, mailer: Mailer) {
  const app = new Hono()

  app.use('*', logger())
  app.use('*', cors({ origin: cfg.corsOrigins.includes('*') ? '*' : cfg.corsOrigins, maxAge: 600 }))
  app.use('*', bodyLimit({ maxSize: 20 * 1024 * 1024 }))

  app.get('/health', async (c) => {
    await db.query('select 1')
    return c.json({ ok: true })
  })
  app.route('/auth', authRoutes(db, cfg, mailer))
  app.route('/', dataRoutes(db, cfg))

  app.notFound((c) => c.json<ApiErrorBody>({ error: { code: 'not_found', message: 'Ruta inexistente.' } }, 404))

  app.onError((err, c) => {
    let e: ApiError
    if (err instanceof ApiError) e = err
    else if (err instanceof ZodError) {
      e = new ApiError('bad_request', err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    } else if (err instanceof SyntaxError) e = new ApiError('bad_request', 'JSON inválido.')
    else {
      e = fromPgError(err) ?? new ApiError('internal', 'Error interno.')
      if (e.code === 'internal') console.error(err)
    }
    return c.json<ApiErrorBody>({ error: { code: e.code, message: e.message } }, e.status as 400)
  })

  return app
}

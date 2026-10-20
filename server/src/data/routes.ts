import { Hono } from 'hono'
import { z } from 'zod'

import type { DataResponse } from '../../../contract/api'
import { requireAuth, type AuthVars } from '../auth/routes'
import type { Config } from '../config'
import type { Db } from '../db/pool'
import { ApiError } from '../errors'
import * as repo from './repository'
import { isEntity } from './schemas'
import { loadShared } from './shared'

export function dataRoutes(db: Db, cfg: Config) {
  const app = new Hono<AuthVars>()
  // auth por ruta (un use('*') en un sub-app montado en '/' afectaría también a /auth y /health)
  const auth = requireAuth(cfg)

  app.get('/data', auth, async (c) => c.json<DataResponse>(await repo.loadOwn(db, c.var.userId)))
  app.get('/shared', auth, async (c) => c.json(await loadShared(db, c.var.userId)))

  app.put('/card_cycles', auth, async (c) => {
    await repo.upsertCycles(db, c.var.userId, await c.req.json())
    return c.body(null, 204)
  })
  app.delete('/card_cycles/:card/:periodo', auth, async (c) => {
    await repo.deleteCycle(db, c.var.userId, c.req.param('card'), c.req.param('periodo'))
    return c.body(null, 204)
  })

  app.put('/settings', auth, async (c) => {
    await repo.saveSettings(db, c.var.userId, await c.req.json())
    return c.body(null, 204)
  })
  app.put('/profile', auth, async (c) => {
    const { nombre } = z.object({ nombre: z.string().max(80) }).parse(await c.req.json())
    await repo.saveProfile(db, c.var.userId, nombre)
    return c.body(null, 204)
  })
  app.post('/restore', auth, async (c) => {
    await repo.restore(db, c.var.userId, await c.req.json())
    return c.body(null, 204)
  })

  app.put('/:table/:id', auth, async (c) => {
    const table = c.req.param('table')
    if (!isEntity(table)) throw new ApiError('not_found')
    await repo.upsertEntity(db, table, c.var.userId, c.req.param('id'), await c.req.json())
    return c.body(null, 204)
  })
  app.delete('/:table/:id', auth, async (c) => {
    const table = c.req.param('table')
    if (!isEntity(table)) throw new ApiError('not_found')
    await repo.deleteEntity(db, table, c.var.userId, c.req.param('id'))
    return c.body(null, 204)
  })

  return app
}

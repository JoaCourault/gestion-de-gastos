// Punto de entrada: config → base → migraciones → servidor HTTP.

import { serve } from '@hono/node-server'

import { createApp } from './app'
import { createMailer } from './auth/mailer'
import { loadConfig } from './config'
import { migrate } from './db/migrate'
import { createDb } from './db/pool'

const cfg = loadConfig()
const db = createDb(cfg.databaseUrl)

await migrate(db)

if (!cfg.requireEmailConfirmation && cfg.signupEnabled) {
  console.warn(
    '[seguridad] REQUIRE_EMAIL_CONFIRMATION=false con registro abierto: cualquiera podría registrarse con el email ' +
      'de otro y ver sus consumos compartidos. Usalo solo con SIGNUP_ENABLED=false.',
  )
}

const server = serve({ fetch: createApp(db, cfg, createMailer(cfg)).fetch, port: cfg.port }, (info) =>
  console.log(`[api] escuchando en http://localhost:${info.port}`),
)

const shutdown = async () => {
  server.close()
  await db.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

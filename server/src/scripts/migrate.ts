// Aplica las migraciones pendientes y termina (el servidor también lo hace al arrancar).

import { migrate } from '../db/migrate'
import { createDb } from '../db/pool'

const url = process.env.DATABASE_URL
if (!url) throw new Error('Falta DATABASE_URL')
const db = createDb(url)
try {
  const applied = await migrate(db)
  console.log(applied.length ? `Listo: ${applied.length} migraciones aplicadas.` : 'La base ya estaba al día.')
} finally {
  await db.close()
}

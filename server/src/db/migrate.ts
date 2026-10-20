// Aplica en orden los archivos server/db/migrations/*.sql que todavía no se aplicaron.
// Se ejecuta al arrancar el servidor (y con `npm run migrate`). Es seguro con varias instancias a la vez.

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Db } from './pool'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../db/migrations')
const LOCK_ID = 7_310_001

export async function migrate(db: Db, log = console.log): Promise<string[]> {
  return db.tx(async (tx) => {
    await tx.query('select pg_advisory_xact_lock($1)', [LOCK_ID])
    await tx.query(`create table if not exists schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`)
    const done = new Set((await tx.query<{ name: string }>('select name from schema_migrations')).map((r) => r.name))
    const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort()
    const applied: string[] = []
    for (const f of files) {
      if (done.has(f)) continue
      await tx.query(await readFile(join(DIR, f), 'utf8'))
      await tx.query('insert into schema_migrations (name) values ($1)', [f])
      applied.push(f)
      log(`[migrate] aplicada ${f}`)
    }
    return applied
  })
}

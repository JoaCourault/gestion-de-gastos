// Acceso a Postgres. Cualquier Postgres 13+ sirve: Docker propio, Neon, RDS, Supabase (como base pelada), etc.

import pg from 'pg'

// Las fechas (tipo date) se devuelven como 'YYYY-MM-DD', no como Date (evita corrimientos por zona horaria).
pg.types.setTypeParser(1082, (v) => v)

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  /** Ejecuta fn dentro de una transacción (rollback si lanza). */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>
  close(): Promise<void>
}

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>

function wrap(q: Queryable, pool: pg.Pool): Db {
  return {
    query: async <T>(sql: string, params: unknown[] = []) => (await q.query(sql, params)).rows as T[],
    tx: async (fn) => {
      // ya estamos en una transacción: se reutiliza
      if (q !== pool) return fn(wrap(q, pool))
      const client = await pool.connect()
      try {
        await client.query('begin')
        const result = await fn(wrap(client, pool))
        await client.query('commit')
        return result
      } catch (e) {
        await client.query('rollback')
        throw e
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

export function createDb(databaseUrl: string): Db {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 })
  return wrap(pool, pool)
}

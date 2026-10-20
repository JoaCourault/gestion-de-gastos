// Migra TODO desde un proyecto de Supabase al backend propio: usuarios (con sus contraseñas), perfiles y datos.
// Conserva los ids, así los consumos compartidos y los backups siguen funcionando.
//
//   SOURCE_DATABASE_URL="postgresql://postgres:<clave>@db.<proyecto>.supabase.co:5432/postgres" \
//   DATABASE_URL="postgres://gastos:<clave>@localhost:5432/gastos" \
//   npm run import:supabase              (agregar -- --dry-run para ver qué haría sin escribir)
//
// SOURCE_DATABASE_URL: Supabase → Project Settings → Database → Connection string (URI).
// Es idempotente: lo que ya existe en destino (mismo id o mismo email) se saltea.

import pg from 'pg'

import { migrate } from '../db/migrate'
import { createDb } from '../db/pool'

pg.types.setTypeParser(1082, (v) => v)

const source = process.env.SOURCE_DATABASE_URL
const target = process.env.DATABASE_URL
if (!source || !target) throw new Error('Faltan SOURCE_DATABASE_URL (Supabase) y/o DATABASE_URL (destino)')
const dryRun = process.argv.includes('--dry-run')

const src = new pg.Pool({ connectionString: source, ssl: /supabase\.(co|com)/.test(source) ? { rejectUnauthorized: false } : undefined })
const dst = createDb(target)

/** Tablas en orden de dependencias, con las columnas que se copian. */
const TABLES: [string, string[]][] = [
  ['cards', ['id', 'user_id', 'nombre', 'color', 'dia_cierre', 'dia_vencimiento', 'activa', 'created_at']],
  ['people', ['id', 'user_id', 'nombre', 'email']],
  ['expense_types', ['id', 'user_id', 'nombre', 'grupo', 'clase_por_defecto']],
  ['card_cycles', ['card_id', 'periodo', 'user_id', 'cierre', 'vencimiento']],
  [
    'card_expenses',
    ['id', 'user_id', 'card_id', 'person_id', 'descripcion', 'fijo', 'fecha', 'cuotas', 'total', 'moneda', 'partes',
      'compartido', 'primer_periodo_manual', 'hasta', 'notas', 'created_at'],
  ],
  ['expenses', ['id', 'user_id', 'fecha', 'type_id', 'detalle', 'monto', 'clase', 'created_at']],
  ['settings', ['user_id', 'cotizacion_usd', 'presupuesto', 'presupuesto_mes']],
]

async function columnsOf(table: string): Promise<Set<string>> {
  const { rows } = await src.query(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [table],
  )
  return new Set(rows.map((r) => r.column_name as string))
}

try {
  await migrate(dst)
  const report: Record<string, { leidos: number; nuevos: number }> = {}

  await dst.tx(async (tx) => {
    // ── usuarios: Supabase guarda bcrypt en auth.users.encrypted_password; el backend propio lo acepta ──
    const { rows: users } = await src.query(
      `select id, email, encrypted_password, email_confirmed_at, created_at,
              coalesce(raw_user_meta_data->>'nombre', '') as nombre
       from auth.users where deleted_at is null and email is not null and encrypted_password is not null`,
    )
    let nuevos = 0
    for (const u of users) {
      const r = await tx.query(
        `insert into users (id, email, password_hash, email_confirmed_at, created_at) values ($1, $2, $3, $4, $5)
         on conflict do nothing returning id`,
        [u.id, u.email.toLowerCase(), u.encrypted_password, u.email_confirmed_at, u.created_at],
      )
      nuevos += r.length
    }
    report.users = { leidos: users.length, nuevos }

    // ── perfiles: tabla profiles (migración 003) o, si no existe, el nombre de los metadatos ──
    const hasProfiles = (await columnsOf('profiles')).size > 0
    const profiles = hasProfiles
      ? (await src.query('select user_id, nombre from public.profiles')).rows
      : users.map((u) => ({ user_id: u.id, nombre: u.nombre }))
    nuevos = 0
    for (const p of profiles) {
      const r = await tx.query(
        `insert into profiles (user_id, nombre) select $1, $2 where exists (select 1 from users where id = $1)
         on conflict do nothing returning user_id`,
        [p.user_id, p.nombre ?? ''],
      )
      nuevos += r.length
    }
    report.profiles = { leidos: profiles.length, nuevos }

    // ── datos ──
    for (const [table, wanted] of TABLES) {
      const available = await columnsOf(table)
      const cols = wanted.filter((c) => available.has(c))
      const { rows } = await src.query(`select ${cols.join(', ')} from public.${table}`)
      nuevos = 0
      for (const row of rows) {
        const r = await tx.query(
          `insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
           on conflict do nothing returning 1`,
          cols.map((c) => (c === 'presupuesto' || c === 'presupuesto_mes' ? JSON.stringify(row[c]) : row[c])),
        )
        nuevos += r.length
      }
      report[table] = { leidos: rows.length, nuevos }
    }

    console.table(report)
    if (dryRun) throw Object.assign(new Error('dry-run'), { dryRun: true })
  })
  console.log('Migración completa. Los usuarios ingresan con su misma contraseña.')
} catch (e) {
  if ((e as { dryRun?: boolean }).dryRun) console.log('Simulación (--dry-run): no se escribió nada.')
  else {
    console.error('Error, no se escribió nada:', (e as Error).message)
    process.exitCode = 1
  }
} finally {
  await src.end()
  await dst.close()
}

// CLI de administración (sin depender de ningún panel web):
//   npm run cli -- user:create <email> <contraseña> [nombre]   crea un usuario ya confirmado
//   npm run cli -- user:confirm <email>                         confirma el email de un usuario
//   npm run cli -- user:password <email> <contraseña>           cambia la contraseña y cierra sus sesiones
//   npm run cli -- user:list                                    lista usuarios
// En Docker: docker compose exec api npm run cli -- user:list

import { confirmUser, createUser, findUserByEmail, setPassword } from './auth/users'
import { migrate } from './db/migrate'
import { createDb } from './db/pool'

const url = process.env.DATABASE_URL
if (!url) throw new Error('Falta DATABASE_URL')
const db = createDb(url)

const [cmd, ...args] = process.argv.slice(2)

async function user(email: string | undefined) {
  if (!email) throw new Error('Falta el email')
  const u = await findUserByEmail(db, email)
  if (!u) throw new Error(`No existe el usuario ${email}`)
  return u
}

try {
  await migrate(db, () => undefined)
  switch (cmd) {
    case 'user:create': {
      const [email, password, nombre = ''] = args
      const u = await createUser(db, { email: email ?? '', password: password ?? '', nombre, confirmed: true })
      console.log(`Usuario creado: ${u.email} (${u.id})`)
      break
    }
    case 'user:confirm': {
      const u = await user(args[0])
      await confirmUser(db, u.id)
      console.log(`Confirmado: ${u.email}`)
      break
    }
    case 'user:password': {
      const u = await user(args[0])
      await setPassword(db, u.id, args[1] ?? '')
      console.log(`Contraseña actualizada: ${u.email}`)
      break
    }
    case 'user:list': {
      const rows = await db.query<{ email: string; nombre: string; confirmado: boolean; creado: string }>(
        `select u.email, coalesce(p.nombre, '') as nombre, u.email_confirmed_at is not null as confirmado,
                to_char(u.created_at, 'YYYY-MM-DD') as creado
         from users u left join profiles p on p.user_id = u.id order by u.created_at`,
      )
      console.table(rows)
      break
    }
    default:
      console.log('Comandos: user:create, user:confirm, user:password, user:list')
      process.exitCode = 1
  }
} catch (e) {
  console.error((e as Error).message)
  process.exitCode = 1
} finally {
  await db.close()
}

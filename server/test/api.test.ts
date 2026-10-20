// Pruebas end-to-end contra una API corriendo (docker compose up) y su base.
//   npm run server:test   (lee server/.env; o API_URL / TEST_DATABASE_URL a mano)
// Crea usuarios con emails aleatorios: se puede correr varias veces sobre la misma base.

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, describe, test } from 'node:test'

import bcrypt from 'bcryptjs'
import pg from 'pg'

import type { TokenResponse } from '../../contract/api'
import type { BackupPayload, SharedPayload } from '../../contract/rows'

const API = process.env.API_URL ?? 'http://localhost:8787'
// Con server/.env de docker-compose el host de la base es "db": desde fuera de Docker es localhost.
const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL?.replace('@db:', '@localhost:') })
const run = randomUUID().slice(0, 8)
const emailA = `joa-${run}@test.local`
const emailB = `mateo-${run}@test.local`
const PASS = 'clave-segura-1'

async function http(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}
const confirm = (email: string) => db.query('update users set email_confirmed_at = now() where email = $1', [email])
async function login(email: string) {
  const r = await http('POST', '/auth/login', { email, password: PASS })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return r.body as TokenResponse
}

// Datos reales del Excel convertidos (datos-iniciales.json), con ids nuevos para no chocar entre corridas.
function backupFor(mateoEmail: string): BackupPayload {
  const raw = readFileSync(new URL('../../datos-iniciales.json', import.meta.url), 'utf8')
  const ids = new Map<string, string>()
  const remap = raw.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => {
    if (!ids.has(id)) ids.set(id, randomUUID())
    return ids.get(id)!
  })
  const data = JSON.parse(remap).data as BackupPayload
  for (const p of data.people) if (p.nombre === 'Mateo') p.email = mateoEmail
  return data
}

let A: TokenResponse
let B: TokenResponse
let backup: BackupPayload

before(async () => {
  assert.equal((await http('GET', '/health')).status, 200, 'la API no responde: ¿docker compose up?')
})
after(() => db.end())

describe('auth', () => {
  test('registro con confirmación obligatoria', async () => {
    const r = await http('POST', '/auth/signup', { email: emailA, password: PASS, nombre: 'Joa' })
    assert.equal(r.status, 200)
    assert.equal(r.body.session, null)
    const l = await http('POST', '/auth/login', { email: emailA, password: PASS })
    assert.equal(l.body.error.code, 'email_not_confirmed')
  })

  test('email repetido, contraseña débil y credenciales malas', async () => {
    assert.equal((await http('POST', '/auth/signup', { email: emailA.toUpperCase(), password: PASS })).body.error.code, 'email_taken')
    assert.equal((await http('POST', '/auth/signup', { email: `x-${run}@t.local`, password: '123' })).body.error.code, 'weak_password')
    await confirm(emailA)
    assert.equal((await http('POST', '/auth/login', { email: emailA, password: 'otra' })).body.error.code, 'invalid_credentials')
  })

  test('login, /me y nombre de perfil', async () => {
    A = await login(emailA)
    const me = await http('GET', '/auth/me', undefined, A.access_token)
    assert.deepEqual(me.body, { id: A.user.id, email: emailA, nombre: 'Joa' })
  })

  test('refresh rota el token: el viejo deja de servir', async () => {
    const r1 = await http('POST', '/auth/refresh', { refresh_token: A.refresh_token })
    assert.equal(r1.status, 200)
    const r2 = await http('POST', '/auth/refresh', { refresh_token: A.refresh_token })
    assert.equal(r2.status, 401)
    A = r1.body
  })

  test('sin token o con token falso: 401', async () => {
    assert.equal((await http('GET', '/data')).status, 401)
    assert.equal((await http('GET', '/data', undefined, 'falso')).status, 401)
  })

  test('link de confirmación inválido', async () => {
    const r = await fetch(`${API}/auth/confirm?token=nada`)
    assert.equal(r.status, 400)
  })

  test('usuario importado de Supabase (bcrypt) ingresa y se re-hashea a scrypt', async () => {
    const email = `importado-${run}@test.local`
    await db.query(
      `insert into users (email, password_hash, email_confirmed_at) values ($1, $2, now())`,
      [email, await bcrypt.hash(PASS, 10)],
    )
    await login(email)
    const { rows } = await db.query('select password_hash from users where email = $1', [email])
    assert.match(rows[0].password_hash, /^scrypt\$/)
    await login(email)
  })
})

describe('datos', () => {
  test('restaurar el backup del Excel y leerlo', async () => {
    backup = backupFor(emailB)
    const r = await http('POST', '/restore', backup, A.access_token)
    assert.equal(r.status, 204, JSON.stringify(r.body))
    const d = await http('GET', '/data', undefined, A.access_token)
    assert.equal(d.body.own.cards.length, backup.cards.length)
    assert.equal(d.body.own.card_expenses.length, backup.card_expenses.length)
    assert.equal(d.body.own.expenses.length, backup.expenses.length)
    assert.equal(d.body.own.people.length, backup.people.length)
    assert.equal(Number(d.body.own.settings.cotizacion_usd), 1540)
    // las fechas vuelven como texto 'YYYY-MM-DD'
    assert.match(d.body.own.card_expenses[0].fecha, /^\d{4}-\d{2}-\d{2}$/)
  })

  test('alta, edición y baja de un consumo; ciclos y ajustes', async () => {
    const card = backup.cards[0]
    const e = {
      id: randomUUID(), card_id: card.id, person_id: null, descripcion: 'Heladera', fijo: false, fecha: '2026-10-14',
      cuotas: 6, total: 600000, moneda: 'ARS', partes: 1, compartido: [], primer_periodo_manual: null, hasta: null, notas: null,
    }
    assert.equal((await http('PUT', `/card_expenses/${e.id}`, e, A.access_token)).status, 204)
    assert.equal((await http('PUT', `/card_expenses/${e.id}`, { ...e, cuotas: 12 }, A.access_token)).status, 204)
    const cyc = [{ card_id: card.id, periodo: '2026-10', cierre: '2026-10-29', vencimiento: '2026-11-10' }]
    assert.equal((await http('PUT', '/card_cycles', cyc, A.access_token)).status, 204)
    const bad = [{ ...cyc[0], vencimiento: '2026-10-01' }]
    assert.equal((await http('PUT', '/card_cycles', bad, A.access_token)).status, 400)
    const s = { cotizacion_usd: 1600, presupuesto: { necesario: 250000, innecesario: 200000 }, presupuesto_mes: {} }
    assert.equal((await http('PUT', '/settings', s, A.access_token)).status, 204)
    const d = await http('GET', '/data', undefined, A.access_token)
    assert.equal(d.body.own.card_expenses.find((x: { id: string }) => x.id === e.id).cuotas, 12)
    assert.equal(d.body.own.card_cycles[0].cierre, '2026-10-29')
    assert.equal(Number(d.body.own.settings.cotizacion_usd), 1600)
    assert.equal((await http('DELETE', `/card_expenses/${e.id}`, undefined, A.access_token)).status, 204)
  })

  test('no se puede borrar lo que está en uso', async () => {
    const card = backup.cards.find((c) => backup.card_expenses.some((e) => e.card_id === c.id))!
    assert.equal((await http('DELETE', `/cards/${card.id}`, undefined, A.access_token)).body.error.code, 'in_use')
    const celeste = backup.people.find((p) => p.nombre === 'Celeste')!
    assert.equal((await http('DELETE', `/people/${celeste.id}`, undefined, A.access_token)).body.error.code, 'in_use')
  })

  test('datos inválidos: 400 con detalle', async () => {
    const r = await http('PUT', `/cards/${randomUUID()}`, { id: 'no-uuid', nombre: '' }, A.access_token)
    assert.equal(r.status, 400)
    assert.equal(r.body.error.code, 'bad_request')
  })
})

describe('compartidos y aislamiento entre usuarios', () => {
  test('Mateo se registra y ve solo los consumos donde participa', async () => {
    await http('POST', '/auth/signup', { email: emailB, password: PASS, nombre: 'Mateo' })
    // sin confirmar no ve nada compartido
    await db.query('update users set email_confirmed_at = null where email = $1', [emailB])
    await confirm(emailB)
    B = await login(emailB)

    const mateo = backup.people.find((p) => p.nombre === 'Mateo')!
    const expected = backup.card_expenses.filter((e) => e.person_id === mateo.id || (e.compartido ?? []).includes(mateo.id))
    const s = (await http('GET', '/shared', undefined, B.access_token)).body as SharedPayload
    assert.deepEqual(s.my_person_ids, [mateo.id])
    assert.equal(s.card_expenses.length, expected.length)
    assert.ok(s.card_expenses.some((e) => e.descripcion === 'La Renga'))
    assert.equal(s.owners.length, 1)
    assert.equal(s.owners[0].user_id, A.user.id)
    assert.equal(s.owners[0].nombre, 'Joa')
    // cotización del dueño, para calcular los consumos en USD como los ve él
    assert.equal(Number(s.owners[0].cotizacion_usd), 1600)
    // no se exponen emails de las personas ajenas
    assert.ok(s.people.every((p) => p.email === undefined))
    // y Mateo no tiene datos propios
    const own = (await http('GET', '/data', undefined, B.access_token)).body.own as BackupPayload
    assert.equal(own.card_expenses.length, 0)
  })

  test('un email sin confirmar no ve lo compartido', async () => {
    await db.query('update users set email_confirmed_at = null where email = $1', [emailB])
    const s = (await http('GET', '/shared', undefined, B.access_token)).body as SharedPayload
    assert.equal(s.card_expenses.length, 0)
    await confirm(emailB)
  })

  test('Mateo no puede modificar ni borrar datos de Joa', async () => {
    const card = backup.cards[0]
    const put = await http('PUT', `/cards/${card.id}`, { ...card, nombre: 'hackeada' }, B.access_token)
    assert.equal(put.body.error.code, 'forbidden')
    const exp = backup.card_expenses[0]
    assert.equal((await http('DELETE', `/card_expenses/${exp.id}`, undefined, B.access_token)).status, 204)
    const own = (await http('GET', '/data', undefined, A.access_token)).body.own as BackupPayload
    assert.ok(own.card_expenses.some((e) => e.id === exp.id), 'el borrado de otro usuario no debe tener efecto')
    assert.ok(own.cards.some((c) => c.nombre === card.nombre))
  })

  test('Mateo no puede usar la tarjeta de Joa en un consumo propio', async () => {
    const e = {
      id: randomUUID(), card_id: backup.cards[0].id, person_id: null, descripcion: 'X', fijo: false, fecha: '2026-10-01',
      cuotas: 1, total: 1, moneda: 'ARS', partes: 1, compartido: [], primer_periodo_manual: null, hasta: null, notas: null,
    }
    assert.equal((await http('PUT', `/card_expenses/${e.id}`, e, B.access_token)).body.error.code, 'forbidden')
  })

  test('restaurar un backup con ids de otra cuenta falla sin tocar nada', async () => {
    const r = await http('POST', '/restore', backup, B.access_token)
    assert.equal(r.body.error.code, 'forbidden')
    const own = (await http('GET', '/data', undefined, A.access_token)).body.own as BackupPayload
    assert.equal(own.cards.length, backup.cards.length)
  })
})

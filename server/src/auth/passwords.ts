// Contraseñas: scrypt (node:crypto, sin dependencias nativas).
// También verifica hashes bcrypt, que es lo que usa Supabase Auth: así los usuarios importados
// desde Supabase ingresan con su misma contraseña (y se re-hashean a scrypt en ese momento).

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

import bcrypt from 'bcryptjs'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>
const N = 16384
const R = 8
const P = 1
const LEN = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, LEN, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$2')) return bcrypt.compare(password, stored)
  const [alg, n, r, p, salt, hash] = stored.split('$')
  if (alg !== 'scrypt') return false
  const expected = Buffer.from(hash, 'base64')
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +r, p: +p })
  return timingSafeEqual(key, expected)
}

/** true si el hash viene de otro sistema (bcrypt) y conviene regenerarlo. */
export const needsRehash = (stored: string) => !stored.startsWith('scrypt$')

export const MIN_PASSWORD = 6

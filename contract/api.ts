// Contrato HTTP del backend propio (server/). El adaptador http de la app lo consume.
// Todas las rutas de datos requieren `Authorization: Bearer <access_token>`.

import type { BackupPayload, ProfileRow, SharedPayload } from './rows'

export interface ApiUser {
  id: string
  email: string
  nombre: string | null
}

export interface TokenResponse {
  access_token: string
  /** segundos */
  expires_in: number
  refresh_token: string
  user: ApiUser
}

/** Códigos de error estables (la app los traduce a mensajes). */
export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'email_taken'
  | 'signup_disabled'
  | 'weak_password'
  | 'forbidden'
  | 'not_found'
  | 'in_use'
  | 'internal'

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string }
}

export interface SignUpRequest {
  email: string
  password: string
  nombre: string
}
/** session = null si hay que confirmar el email antes de ingresar. */
export interface SignUpResponse {
  session: TokenResponse | null
}

export interface DataResponse {
  own: BackupPayload
  profile: ProfileRow | null
}

export type SharedResponse = SharedPayload

/**
 * Rutas:
 *   POST   /auth/signup            SignUpRequest → SignUpResponse
 *   POST   /auth/login             {email,password} → TokenResponse
 *   POST   /auth/refresh           {refresh_token} → TokenResponse
 *   POST   /auth/logout            {refresh_token} → 204
 *   GET    /auth/me                → ApiUser
 *   GET    /auth/confirm?token=…   → página HTML
 *
 *   GET    /data                   → DataResponse
 *   GET    /shared                 → SharedResponse
 *   PUT    /:table/:id             fila → 204      (cards, people, card_expenses, expense_types, expenses)
 *   DELETE /:table/:id             → 204
 *   PUT    /card_cycles            CycleRow[] → 204
 *   DELETE /card_cycles/:card/:p   → 204
 *   PUT    /settings               SettingsRow → 204
 *   PUT    /profile                {nombre} → 204
 *   POST   /restore                BackupPayload → 204   (reemplaza todo, en una transacción)
 *   GET    /health                 → {ok:true}
 */
export const API_VERSION = 1

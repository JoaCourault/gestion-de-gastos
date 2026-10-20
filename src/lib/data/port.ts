// Puerto de datos: lo único que la app sabe del backend.
// Cada adaptador (supabase/, http/) implementa esta interfaz; el resto de la app no conoce al proveedor.

import type {
  BackupPayload,
  CycleRow,
  EntityRows,
  EntityTable,
  ProfileRow,
  SettingsRow,
  SharedPayload,
} from '@contract/rows'

export interface AuthUser {
  id: string
  email: string
  /** nombre cargado al registrarse (se copia al perfil en la primera carga) */
  nombre: string | null
}

export interface AuthSession {
  user: AuthUser
}

export interface AuthPort {
  /** Sesión guardada en el dispositivo (o null). */
  getSession(): Promise<AuthSession | null>
  /** Avisa cada vez que la sesión cambia (login, logout, vencimiento). Devuelve la función para desuscribirse. */
  onChange(listener: (session: AuthSession | null) => void): () => void
  signIn(email: string, password: string): Promise<void>
  /** needsConfirmation: hay que confirmar el email antes de ingresar. */
  signUp(email: string, password: string, nombre: string): Promise<{ needsConfirmation: boolean }>
  signOut(): Promise<void>
}

export interface DataPort {
  /** Datos propios del usuario + su perfil. */
  loadOwn(userId: string): Promise<{ own: BackupPayload; profile: ProfileRow | null }>
  /** Consumos de otros usuarios donde participa (solo lectura). */
  loadShared(userId: string): Promise<SharedPayload>
  upsert<T extends EntityTable>(table: T, row: EntityRows[T]): Promise<void>
  remove(table: EntityTable, id: string): Promise<void>
  upsertCycles(rows: CycleRow[]): Promise<void>
  removeCycle(cardId: string, periodo: string): Promise<void>
  saveSettings(row: SettingsRow): Promise<void>
  saveProfile(nombre: string): Promise<void>
  /** Reemplaza TODOS los datos del usuario por los del backup, en una sola transacción. */
  restore(payload: BackupPayload): Promise<void>
}

export interface Backend {
  /** Para mostrar en Ajustes y en los mensajes de error. */
  kind: 'supabase' | 'api'
  /** false si faltan variables de entorno: la app muestra cómo configurarlo. */
  configured: boolean
  /** Qué falta configurar (para la pantalla de configuración). */
  setupHint: string
  auth: AuthPort
  data: DataPort
}

/** Errores normalizados: los adaptadores traducen los errores del proveedor a estos códigos. */
export type DataErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'email_taken'
  | 'signup_disabled'
  | 'weak_password'
  | 'unauthorized'
  | 'forbidden'
  | 'in_use'
  | 'outdated_schema'
  | 'network'
  | 'unknown'

const MESSAGES: Partial<Record<DataErrorCode, string>> = {
  invalid_credentials: 'Email o contraseña incorrectos.',
  email_not_confirmed: 'Todavía no confirmaste tu email: revisá tu correo.',
  email_taken: 'Ya existe un usuario con ese email.',
  signup_disabled: 'El registro de usuarios nuevos está desactivado.',
  weak_password: 'La contraseña debe tener al menos 6 caracteres.',
  unauthorized: 'Sesión vencida: volvé a ingresar.',
  forbidden: 'No tenés permiso para modificar ese dato.',
  in_use: 'No se puede borrar: hay registros que lo usan.',
  network: 'No hay conexión con el servidor.',
}

export class DataError extends Error {
  constructor(
    readonly code: DataErrorCode,
    detail?: string,
  ) {
    super(MESSAGES[code] ?? detail ?? 'Error inesperado.')
    if (detail && MESSAGES[code]) this.cause = detail
  }
}

import type { ApiErrorCode } from '../../contract/api'

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  invalid_credentials: 401,
  email_not_confirmed: 403,
  email_taken: 409,
  signup_disabled: 403,
  weak_password: 400,
  forbidden: 403,
  not_found: 404,
  in_use: 409,
  internal: 500,
}

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message?: string,
  ) {
    super(message ?? code)
  }
  get status() {
    return STATUS[this.code]
  }
}

/** Traduce errores de Postgres a errores de la API. */
export function fromPgError(e: unknown): ApiError | null {
  const code = (e as { code?: string }).code
  if (code === '23503') return new ApiError('in_use', 'Hay registros que lo usan.')
  if (code === '23505') return new ApiError('forbidden', 'Ese registro pertenece a otra cuenta.')
  if (code === '23514' || code === '22P02' || code === '22007' || code === '22008')
    return new ApiError('bad_request', (e as Error).message)
  return null
}

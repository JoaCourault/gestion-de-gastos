// Configuración por variables de entorno (ver server/.env.example).

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Falta la variable de entorno ${name} (ver server/.env.example)`)
  return v
}

const bool = (v: string | undefined, def: boolean) => (v === undefined ? def : !/^(0|false|no)$/i.test(v))

export function loadConfig() {
  const port = Number(process.env.PORT ?? 8787)
  const jwtSecret = required('JWT_SECRET')
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres')
  return {
    port,
    databaseUrl: required('DATABASE_URL'),
    jwtSecret,
    /** vida del access token (segundos) */
    accessTtl: Number(process.env.ACCESS_TOKEN_TTL ?? 3600),
    /** vida del refresh token (días) */
    refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 60),
    signupEnabled: bool(process.env.SIGNUP_ENABLED, true),
    /**
     * Confirmación de email obligatoria. Es lo que garantiza que nadie vea consumos compartidos ajenos
     * registrándose con el email de otro. Desactivarla solo con SIGNUP_ENABLED=false (usuarios creados por CLI).
     */
    requireEmailConfirmation: bool(process.env.REQUIRE_EMAIL_CONFIRMATION, true),
    /** URL pública de esta API (para los links de confirmación) */
    publicUrl: (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, ''),
    /** orígenes permitidos para la versión web, separados por coma; '*' = cualquiera */
    corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()),
    /** smtp://usuario:clave@host:587 — sin esto, los links de confirmación se escriben en el log */
    smtpUrl: process.env.SMTP_URL ?? '',
    mailFrom: process.env.MAIL_FROM ?? 'Gestor de Gastos <no-reply@localhost>',
  }
}

export type Config = ReturnType<typeof loadConfig>

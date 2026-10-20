// Elige el backend según el entorno. Cambiar de proveedor = cambiar estas variables (y migrar los datos).
//
//   EXPO_PUBLIC_BACKEND=supabase   EXPO_PUBLIC_SUPABASE_URL=…  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…
//   EXPO_PUBLIC_BACKEND=api        EXPO_PUBLIC_API_URL=http://mi-servidor:8787
//
// Sin EXPO_PUBLIC_BACKEND se usa Supabase si hay URL de Supabase, si no el backend propio.

import { createHttpBackend } from './http'
import type { Backend } from './port'
import { createSupabaseBackend } from './supabase'

export * from './port'

function select(): Backend {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
  const kind = process.env.EXPO_PUBLIC_BACKEND ?? (supabaseUrl ? 'supabase' : 'api')
  if (kind === 'api') return createHttpBackend(process.env.EXPO_PUBLIC_API_URL ?? '')
  return createSupabaseBackend(supabaseUrl, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '')
}

export const backend: Backend = select()

import './storage'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AppState, Platform } from 'react-native'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

/** false si falta el .env.local: la app muestra cómo configurarlo en lugar de romperse. */
export const supabaseConfigured = /^https?:\/\//.test(url) && key.length > 20

export const supabase: SupabaseClient = createClient(
  supabaseConfigured ? url : 'http://localhost',
  supabaseConfigured ? key : 'sin-configurar',
  {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
)

// En el celular, refrescar el token solo mientras la app está en primer plano.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh()
    else supabase.auth.stopAutoRefresh()
  })
}

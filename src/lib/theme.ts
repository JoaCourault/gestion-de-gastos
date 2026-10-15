import { useColorScheme } from 'react-native'

const light = {
  bg: '#F3F6F5',
  surface: '#FFFFFF',
  surfaceAlt: '#EBF0EF',
  border: '#DCE4E2',
  text: '#13201E',
  muted: '#5C6A67',
  primary: '#0F766E',
  onPrimary: '#FFFFFF',
  primarySoft: '#D5EEEA',
  danger: '#C2410C',
  dangerSoft: '#FCE6DA',
  warn: '#B45309',
  warnSoft: '#FDF1C7',
  ok: '#15803D',
  okSoft: '#DCF3E3',
}
export type Theme = typeof light

const dark: Theme = {
  bg: '#0D1312',
  surface: '#161F1E',
  surfaceAlt: '#1F2A29',
  border: '#2A3735',
  text: '#E6EEEC',
  muted: '#93A3A0',
  primary: '#2DD4BF',
  onPrimary: '#03231F',
  primarySoft: '#113A35',
  danger: '#FB923C',
  dangerSoft: '#3A2214',
  warn: '#FBBF24',
  warnSoft: '#3A2D0E',
  ok: '#4ADE80',
  okSoft: '#12321F',
}

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light
}
export const useIsDark = () => useColorScheme() === 'dark'

export const CARD_COLORS = ['#1D4ED8', '#0F766E', '#7C3AED', '#DB2777', '#EA580C', '#CA8A04', '#059669', '#475569']

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 }
export const MAX_WIDTH = 980

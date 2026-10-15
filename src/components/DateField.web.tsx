import type { ISODate } from '@/lib/types'
import { radius, useTheme } from '@/lib/theme'

/** En web se usa el selector de fecha del navegador. */
export function DateField({ value, onChange }: { value: ISODate; onChange: (d: ISODate) => void }) {
  const t = useTheme()
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: radius.md,
        padding: '0 14px',
        minHeight: 48,
        fontSize: 16,
        background: t.surface,
        color: t.text,
        fontFamily: 'inherit',
        colorScheme: 'light dark',
        boxSizing: 'border-box',
        width: '100%',
      }}
    />
  )
}

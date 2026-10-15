import { router } from 'expo-router'

import { Badge, Empty, Fab, ListItem, Panel, Screen, Txt } from '@/components/ui'
import { cycleOf, openPeriod } from '@/lib/calc'
import { fmtDate, todayISO } from '@/lib/dates'
import { useData } from '@/lib/store'
import { space } from '@/lib/theme'

export default function Tarjetas() {
  const data = useData()
  const today = todayISO()

  return (
    <Screen fab={<Fab label="Tarjeta" onPress={() => router.push('/tarjetas/nueva')} />}>
      <Txt muted style={{ marginBottom: space.md }}>
        Cada tarjeta tiene días de cierre y vencimiento habituales; si un mes cambian, ajustá las fechas de ese período dentro de la
        tarjeta.
      </Txt>
      {data.cards.length === 0 ? (
        <Empty icon="card-outline" title="Sin tarjetas" text="Agregá tu primera tarjeta." />
      ) : (
        <Panel style={{ padding: 0 }}>
          {data.cards.map((c) => {
            const cy = cycleOf(c, openPeriod(c, today))
            return (
              <ListItem
                key={c.id}
                color={c.color}
                title={c.nombre}
                subtitle={`Próximo cierre ${fmtDate(cy.cierre)} · vence ${fmtDate(cy.vencimiento)}`}
                right={!c.activa ? <Badge label="Inactiva" /> : undefined}
                onPress={() => router.push({ pathname: '/tarjetas/[id]', params: { id: c.id } })}
              />
            )
          })}
        </Panel>
      )}
    </Screen>
  )
}

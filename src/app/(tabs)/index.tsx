import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

import { CycleSheet } from '@/components/CycleSheet'
import { AgrupacionSwitch, PeriodNav } from '@/components/PeriodNav'
import { Badge, Button, Chip, Empty, Grid, Panel, ProgressBar, Row, Screen, SectionTitle, Txt } from '@/components/ui'
import { budgetFor, cycleOf, monthExpenses, projection, sharedDebts, statementsFor } from '@/lib/calc'
import { addPeriods, currentPeriod, daysUntil, diffPeriods, fmtDate, fmtDayMonth, periodLong, periodShort, todayISO } from '@/lib/dates'
import { fmtMoney } from '@/lib/format'
import { useData } from '@/lib/store'
import { space, useTheme } from '@/lib/theme'
import type { Card, Period } from '@/lib/types'
import { useAgrupacion, usePeriodState } from '@/lib/usePeriod'

export default function Resumen() {
  const data = useData()
  const t = useTheme()
  const [modo] = useAgrupacion()
  const { period, setPeriod, today } = usePeriodState(data, undefined, modo)

  const st = useMemo(() => statementsFor(data, period, modo), [data, period, modo])
  const mio = st.reduce((a, s) => a + s.mio, 0)
  const otros = st.reduce((a, s) => a + s.otros, 0)
  // Lo que me debe cada persona en estos resúmenes
  const deudas = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of st) for (const [pid, v] of s.porPersona) m.set(pid, (m.get(pid) ?? 0) + v)
    const nombre = (pid: string) => data.people.find((p) => p.id === pid)?.nombre ?? 'Sin asignar'
    return [...m.entries()].map(([pid, v]) => ({ pid, nombre: nombre(pid), v })).sort((a, b) => b.v - a.v)
  }, [st, data.people])
  // Los gastos del mes no dependen de cierres ni vencimientos: mes calendario, que se mueve junto con la navegación.
  const mesGastos = addPeriods(currentPeriod(), diffPeriods(today, period))
  const gastos = useMemo(() => monthExpenses(data, mesGastos), [data, mesGastos])
  const budget = budgetFor(data, mesGastos)
  const proj = useMemo(() => projection(data, today, 12, modo), [data, today, modo])
  const maxProj = Math.max(1, ...proj.map((x) => x.mio))
  const eventos = useMemo(() => upcoming(data), [data])
  const compartidos = useMemo(() => sharedDebts(data, period, modo), [data, period, modo])
  const [editCycle, setEditCycle] = useState<{ card: Card; period: Period } | null>(null)

  // Al empezar cada mes: tarjetas cuyo cierre de este mes todavía es estimado.
  const mesActual = currentPeriod()
  const pendientes = data.cards.filter((c) => c.activa && !c.ciclos[mesActual])

  if (data.cards.length === 0 && data.shared.cardExpenses.length === 0) {
    return (
      <Screen>
        <Empty
          icon="card-outline"
          title="Empezá cargando una tarjeta"
          text="Configurá tus tarjetas con sus días de cierre y vencimiento, o restaurá un backup."
          action={
            <Row style={{ marginTop: space.md, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button title="Nueva tarjeta" icon="add" onPress={() => router.push('/tarjetas/nueva')} />
              <Button title="Restaurar backup" variant="secondary" icon="cloud-download-outline" onPress={() => router.push('/backup')} />
            </Row>
          }
        />
      </Screen>
    )
  }

  return (
    <Screen>
      {pendientes.length > 0 && (
        <Panel style={{ backgroundColor: t.warnSoft, borderColor: t.warn, marginBottom: space.md, gap: space.sm }}>
          <Txt style={{ fontWeight: '700' }}>Cargá las fechas de cierre de {periodLong(mesActual)}</Txt>
          <Txt v="small" muted>
            Mientras no las cargues se usan los días habituales, y las compras pueden quedar en el resumen equivocado.
          </Txt>
          <Row style={{ flexWrap: 'wrap' }}>
            {pendientes.map((c) => (
              <Chip
                key={c.id}
                color={c.color}
                icon="calendar-outline"
                label={`${c.nombre} · ${fmtDate(cycleOf(c, mesActual).cierre)}?`}
                onPress={() => setEditCycle({ card: c, period: mesActual })}
              />
            ))}
          </Row>
        </Panel>
      )}

      <AgrupacionSwitch />
      <View style={{ height: space.sm }} />
      <PeriodNav
        value={period}
        onChange={setPeriod}
        today={today}
        caption={modo === 'vencimiento' ? 'Resúmenes que vencen este mes' : 'Resúmenes que cierran este mes'}
      />

      <Panel style={{ marginTop: space.md }}>
        <Txt v="label" muted>
          Tarjetas · a pagar por mí
        </Txt>
        <Txt v="moneyLg" style={{ marginTop: 4 }}>
          {fmtMoney(mio)}
        </Txt>
        <Row style={{ marginTop: space.sm, flexWrap: 'wrap', gap: space.lg }}>
          <Txt muted>Total resúmenes {fmtMoney(mio + otros)}</Txt>
          {otros > 0 && <Txt muted>De otros {fmtMoney(otros)}</Txt>}
        </Row>
        {deudas.length > 0 && (
          <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
            {deudas.map((d) => (
              <Badge key={d.pid} label={`${d.nombre} te debe ${fmtMoney(d.v)}`} tone="primary" />
            ))}
          </Row>
        )}
      </Panel>

      {compartidos.length > 0 && (
        <Panel
          style={{ marginTop: space.md, gap: space.xs }}
          onPress={() => router.push({ pathname: '/consumos', params: { p: period, v: 'conmigo' } })}
        >
          <Txt v="label" muted>
            Compartidos conmigo
          </Txt>
          {compartidos.map((d) => (
            <Row key={d.ownerId} style={{ justifyContent: 'space-between' }}>
              <Txt>
                Le debés a {d.nombre} ({d.lines.length})
              </Txt>
              <Txt v="money">{fmtMoney(d.total)}</Txt>
            </Row>
          ))}
        </Panel>
      )}

      {st.length > 0 && <SectionTitle>Por tarjeta</SectionTitle>}
      <Grid min={260}>
        {st.map((s) => (
          <Panel
            key={`${s.card.id}-${s.period}`}
            onPress={() => router.push({ pathname: '/consumos', params: { card: s.card.id, p: period } })}
            style={{ borderLeftWidth: 5, borderLeftColor: s.card.color }}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="h2">{s.card.nombre}</Txt>
              {s.cycle.ajustado ? <Badge label="Fechas reales" tone="ok" /> : <Badge label="Estimado" />}
            </Row>
            <Txt v="small" muted style={{ marginTop: 2 }}>
              Resumen {periodShort(s.period)} · Cierra {fmtDate(s.cycle.cierre)} · Vence {fmtDate(s.cycle.vencimiento)}
            </Txt>
            <Txt v="money" style={{ marginTop: space.sm, fontSize: 20 }}>
              {fmtMoney(s.total)}
            </Txt>
            <Txt v="small" muted>
              {s.lines.length} consumos{s.otros > 0 ? ` · mío ${fmtMoney(s.mio)} · otros ${fmtMoney(s.otros)}` : ''}
            </Txt>
            <Button
              small
              variant="ghost"
              icon="calendar-outline"
              title="Editar cierre y vencimiento"
              onPress={() => setEditCycle({ card: s.card, period: s.period })}
              style={{ alignSelf: 'flex-start', paddingHorizontal: 0, marginTop: space.xs }}
            />
          </Panel>
        ))}
      </Grid>

      <Grid min={300}>
        <View>
          <SectionTitle
            right={<Button small variant="ghost" title="Ver gastos" onPress={() => router.push({ pathname: '/gastos', params: { m: mesGastos } })} />}
          >
            Otros gastos · {periodLong(mesGastos)}
          </SectionTitle>
          <Panel style={{ gap: space.md }}>
            <BudgetRow label="Necesarios" value={gastos.necesario} max={budget.necesario} />
            <BudgetRow label="Innecesarios" value={gastos.innecesario} max={budget.innecesario} />
            {gastos.porGrupo.length > 0 && (
              <Row style={{ flexWrap: 'wrap', gap: space.sm }}>
                {gastos.porGrupo.map(([g, v]) => (
                  <Badge key={g} label={`${g} ${fmtMoney(v, { compact: true })}`} />
                ))}
              </Row>
            )}
          </Panel>
        </View>

        <View>
          <SectionTitle>Próximas fechas</SectionTitle>
          <Panel style={{ gap: space.sm }}>
            {eventos.length === 0 && <Txt muted>Nada en los próximos 40 días.</Txt>}
            {eventos.map((e) => {
              const d = daysUntil(e.fecha)
              return (
                <Row key={e.key} style={{ justifyContent: 'space-between' }}>
                  <Row>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: e.color }} />
                    <Txt>
                      {e.tipo === 'cierre' ? 'Cierre' : 'Vencimiento'} {e.card}
                    </Txt>
                  </Row>
                  <Txt muted={d > 5} color={d <= 5 && e.tipo === 'vencimiento' ? t.warn : undefined}>
                    {fmtDayMonth(e.fecha)} · {d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`}
                  </Txt>
                </Row>
              )
            })}
          </Panel>
        </View>
      </Grid>

      <SectionTitle>Proyección por mes de {modo === 'vencimiento' ? 'pago' : 'cierre'} (mío)</SectionTitle>
      <Panel style={{ gap: 6 }}>
        {proj.map((x) => (
          <Pressable
            key={x.period}
            onPress={() => setPeriod(x.period)}
            accessibilityLabel={`${periodShort(x.period)}: ${fmtMoney(x.mio)}`}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 3 }, pressed && { opacity: 0.6 }]}
          >
            <Txt v="small" muted style={{ width: 54, fontVariant: ['tabular-nums'] }}>
              {periodShort(x.period)}
            </Txt>
            <View style={{ flex: 1, height: 14, justifyContent: 'center' }}>
              <View
                style={{
                  width: `${(x.mio / maxProj) * 100}%`,
                  minWidth: x.mio > 0 ? 3 : 0,
                  height: 12,
                  borderTopRightRadius: 4,
                  borderBottomRightRadius: 4,
                  backgroundColor: t.primary,
                  opacity: x.period === period ? 1 : 0.4,
                }}
              />
            </View>
            <Txt v="small" style={{ width: 92, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
              {fmtMoney(x.mio, { compact: true })}
            </Txt>
          </Pressable>
        ))}
        <Txt v="small" muted style={{ marginTop: space.xs }}>
          Incluye cuotas y gastos fijos. USD convertidos a {fmtMoney(data.settings.cotizacionUSD)}.
        </Txt>
      </Panel>
      {editCycle && <CycleSheet card={editCycle.card} period={editCycle.period} onClose={() => setEditCycle(null)} />}
    </Screen>
  )
}

function BudgetRow({ label, value, max }: { label: string; value: number; max: number }) {
  const t = useTheme()
  const resto = max - value
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt>{label}</Txt>
        <Txt v="money">
          {fmtMoney(value)}{' '}
          <Txt v="small" muted>
            / {fmtMoney(max)}
          </Txt>
        </Txt>
      </Row>
      <ProgressBar value={value} max={max} />
      <Txt v="small" color={resto < 0 ? t.danger : t.muted}>
        {resto >= 0 ? `Quedan ${fmtMoney(resto)}` : `Excedido ${fmtMoney(-resto)}`}
      </Txt>
    </View>
  )
}

function upcoming(data: ReturnType<typeof useData>) {
  const today = todayISO()
  const out: { key: string; tipo: 'cierre' | 'vencimiento'; fecha: string; card: string; color: string }[] = []
  for (const c of data.cards.filter((x) => x.activa)) {
    for (let i = -1; i <= 2; i++) {
      const p = addPeriods(today.slice(0, 7), i)
      const cy = cycleOf(c, p)
      for (const tipo of ['cierre', 'vencimiento'] as const) {
        const d = daysUntil(cy[tipo])
        if (d >= 0 && d <= 40) out.push({ key: `${c.id}-${p}-${tipo}`, tipo, fecha: cy[tipo], card: c.nombre, color: c.color })
      }
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

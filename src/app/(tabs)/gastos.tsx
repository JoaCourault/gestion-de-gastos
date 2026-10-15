import Ionicons from '@expo/vector-icons/Ionicons'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { PeriodNav } from '@/components/PeriodNav'
import { Sheet } from '@/components/Sheet'
import { Badge, Button, Empty, Fab, Field, Grid, Input, Panel, ProgressBar, Row, Screen, Segmented, Txt } from '@/components/ui'
import { budgetFor, monthExpenses } from '@/lib/calc'
import { currentPeriod, fmtDayMonth } from '@/lib/dates'
import { attempt } from '@/lib/dialog'
import { fmtMoney, parseMoney, toInput } from '@/lib/format'
import { useData, useStore } from '@/lib/store'
import { space, useTheme } from '@/lib/theme'
import type { Clase, Expense } from '@/lib/types'

type Filtro = 'todos' | Clase

export default function Gastos() {
  const data = useData()
  const t = useTheme()
  const params = useLocalSearchParams<{ m?: string }>()
  const [month, setMonth] = useState(params.m ?? currentPeriod())
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [editBudget, setEditBudget] = useState(false)

  const [prevM, setPrevM] = useState(params.m)
  if (params.m !== prevM) {
    setPrevM(params.m)
    if (params.m) setMonth(params.m)
  }

  const res = useMemo(() => monthExpenses(data, month), [data, month])
  const budget = budgetFor(data, month)
  const typeById = useMemo(() => new Map(data.types.map((x) => [x.id, x])), [data.types])
  const list = res.list
    .filter((e) => filtro === 'todos' || e.clase === filtro)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))

  const totalGastos = res.necesario + res.innecesario
  const totalBudget = budget.necesario + budget.innecesario

  return (
    <Screen fab={<Fab label="Gasto" onPress={() => router.push({ pathname: '/gasto/[id]', params: { id: 'nuevo', m: month } })} />}>
      <PeriodNav value={month} onChange={setMonth} today={currentPeriod()} />

      <Grid min={240}>
        <Panel style={{ marginTop: space.md, gap: 6 }}>
          <Txt v="label" muted>
            Total del mes
          </Txt>
          <Txt v="moneyLg">{fmtMoney(totalGastos)}</Txt>
          <Txt v="small" color={totalBudget - totalGastos < 0 ? t.danger : t.muted}>
            {totalBudget - totalGastos >= 0
              ? `Quedan ${fmtMoney(totalBudget - totalGastos)} de ${fmtMoney(totalBudget)}`
              : `Excedido ${fmtMoney(totalGastos - totalBudget)} sobre ${fmtMoney(totalBudget)}`}
          </Txt>
          <Button small variant="ghost" icon="create-outline" title="Presupuesto del mes" onPress={() => setEditBudget(true)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
        </Panel>
        <Panel style={{ marginTop: space.md, gap: space.md }}>
          {(['necesario', 'innecesario'] as const).map((c) => (
            <View key={c} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt>{c === 'necesario' ? 'Necesarios' : 'Innecesarios'}</Txt>
                <Txt v="money">
                  {fmtMoney(res[c])}{' '}
                  <Txt v="small" muted>
                    / {fmtMoney(budget[c])}
                  </Txt>
                </Txt>
              </Row>
              <ProgressBar value={res[c]} max={budget[c]} />
            </View>
          ))}
        </Panel>
      </Grid>

      {res.porGrupo.length > 0 && (
        <Row style={{ flexWrap: 'wrap', marginTop: space.md }}>
          {res.porGrupo.map(([g, v]) => (
            <Badge key={g} label={`${g}: ${fmtMoney(v)}`} />
          ))}
        </Row>
      )}

      <View style={{ marginVertical: space.md }}>
        <Segmented
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: 'todos', label: 'Todos' },
            { value: 'necesario', label: 'Necesarios' },
            { value: 'innecesario', label: 'Innecesarios' },
          ]}
        />
      </View>

      {list.length === 0 && <Empty icon="wallet-outline" title="Sin gastos este mes" text="Cargá gastos en efectivo, débito o transferencia con el botón +." />}
      <View style={{ gap: space.sm }}>
        {list.map((e) => (
          <GastoRow key={e.id} e={e} tipo={typeById.get(e.typeId)?.nombre ?? '—'} grupo={typeById.get(e.typeId)?.grupo} />
        ))}
      </View>

      {editBudget && <BudgetSheet month={month} onClose={() => setEditBudget(false)} />}
    </Screen>
  )
}

function GastoRow({ e, tipo, grupo }: { e: Expense; tipo: string; grupo?: string }) {
  const t = useTheme()
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/gasto/[id]', params: { id: e.id } })}
      style={({ pressed }) => [styles.row, { backgroundColor: t.surface, borderColor: t.border }, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.icon, { backgroundColor: e.clase === 'necesario' ? t.primarySoft : t.warnSoft }]}>
        <Ionicons name={e.clase === 'necesario' ? 'basket-outline' : 'sparkles-outline'} size={18} color={e.clase === 'necesario' ? t.primary : t.warn} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={{ fontWeight: '600' }} numberOfLines={1}>
          {tipo}
          {e.detalle ? <Txt muted> · {e.detalle}</Txt> : null}
        </Txt>
        <Txt v="small" muted>
          {fmtDayMonth(e.fecha)}
          {grupo ? ` · ${grupo}` : ''}
        </Txt>
      </View>
      <Txt v="money">{fmtMoney(e.monto)}</Txt>
    </Pressable>
  )
}

function BudgetSheet({ month, onClose }: { month: string; onClose: () => void }) {
  const data = useData()
  const { saveSettings } = useStore()
  const current = budgetFor(data, month)
  const [nec, setNec] = useState(toInput(current.necesario))
  const [inn, setInn] = useState(toInput(current.innecesario))
  const [busy, setBusy] = useState(false)

  const save = async (soloEsteMes: boolean) => {
    const n = parseMoney(nec)
    const i = parseMoney(inn)
    if (!(n >= 0) || !(i >= 0)) return
    const s = data.settings
    const next = soloEsteMes
      ? { ...s, presupuestoMes: { ...s.presupuestoMes, [month]: { necesario: n, innecesario: i } } }
      : (() => {
          const { [month]: _quitado, ...resto } = s.presupuestoMes
          return { ...s, presupuesto: { necesario: n, innecesario: i }, presupuestoMes: resto }
        })()
    setBusy(true)
    const ok = await attempt(() => saveSettings(next))
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Sheet visible title="Presupuesto" onClose={onClose}>
      <Field label="Necesarios">
        <Input value={nec} onChangeText={setNec} keyboardType="decimal-pad" inputMode="decimal" />
      </Field>
      <Field label="Innecesarios">
        <Input value={inn} onChangeText={setInn} keyboardType="decimal-pad" inputMode="decimal" />
      </Field>
      <View style={{ gap: space.sm }}>
        <Button title="Solo para este mes" onPress={() => save(true)} loading={busy} />
        <Button title="Para todos los meses" variant="secondary" onPress={() => save(false)} disabled={busy} />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
})

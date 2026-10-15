-- Migración 002: consumos compartidos entre varias personas.
-- Correr UNA vez en Supabase → SQL Editor si ya habías ejecutado schema.sql antes de esta versión.
-- (schema.sql ya incluye estos cambios para instalaciones nuevas.)

alter table public.card_expenses
  add column if not exists compartido text[] not null default '{}';

create or replace function public.restore_backup(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sesión requerida';
  end if;

  delete from expenses      where user_id = uid;
  delete from card_expenses where user_id = uid;
  delete from card_cycles   where user_id = uid;
  delete from cards         where user_id = uid;
  delete from people        where user_id = uid;
  delete from expense_types where user_id = uid;
  delete from settings      where user_id = uid;

  insert into cards (id, user_id, nombre, color, dia_cierre, dia_vencimiento, activa)
    select id, uid, nombre, color, dia_cierre, dia_vencimiento, activa
    from jsonb_populate_recordset(null::cards, coalesce(payload->'cards', '[]'));

  insert into card_cycles (card_id, periodo, user_id, cierre, vencimiento)
    select card_id, periodo, uid, cierre, vencimiento
    from jsonb_populate_recordset(null::card_cycles, coalesce(payload->'card_cycles', '[]'));

  insert into people (id, user_id, nombre)
    select id, uid, nombre
    from jsonb_populate_recordset(null::people, coalesce(payload->'people', '[]'));

  insert into expense_types (id, user_id, nombre, grupo, clase_por_defecto)
    select id, uid, nombre, grupo, clase_por_defecto
    from jsonb_populate_recordset(null::expense_types, coalesce(payload->'expense_types', '[]'));

  insert into card_expenses (id, user_id, card_id, person_id, descripcion, fijo, fecha, cuotas, total,
                             moneda, partes, compartido, primer_periodo_manual, hasta, notas)
    select id, uid, card_id, person_id, descripcion, fijo, fecha, cuotas, total,
           moneda, coalesce(partes, 1), coalesce(compartido, '{}'), primer_periodo_manual, hasta, notas
    from jsonb_populate_recordset(null::card_expenses, coalesce(payload->'card_expenses', '[]'));

  insert into expenses (id, user_id, fecha, type_id, detalle, monto, clase)
    select id, uid, fecha, type_id, detalle, monto, clase
    from jsonb_populate_recordset(null::expenses, coalesce(payload->'expenses', '[]'));

  insert into settings (user_id, cotizacion_usd, presupuesto, presupuesto_mes)
    select uid, s.cotizacion_usd, s.presupuesto, s.presupuesto_mes
    from jsonb_populate_record(null::settings, payload->'settings') s
    where payload ? 'settings';
end $$;

revoke execute on function public.restore_backup(jsonb) from public, anon;
grant  execute on function public.restore_backup(jsonb) to authenticated;

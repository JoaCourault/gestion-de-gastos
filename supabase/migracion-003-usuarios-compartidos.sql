-- Migración 003: varios usuarios, cada uno con sus datos, y consumos compartidos visibles para los participantes.
-- Correr UNA vez en Supabase → SQL Editor (después de la 002). schema.sql ya la incluye para instalaciones nuevas.
--
-- Cómo funciona: cada persona puede tener un email. Si un usuario con ese email (confirmado) existe, ve en modo
-- solo lectura los consumos donde participa (compartidos o hechos con la tarjeta de otro), la tarjeta y sus cierres
-- (para calcular las cuotas), los nombres de los otros participantes y el nombre del dueño.

-- ───────────── Columnas y tablas nuevas ─────────────

alter table public.people add column if not exists email text;
create index if not exists people_email_idx on public.people (lower(email));

create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  nombre  text not null default ''
);
alter table public.profiles enable row level security;
drop policy if exists "solo dueño" on public.profiles;
create policy "solo dueño" on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ───────────── Funciones auxiliares (security definer: leen sin RLS, solo devuelven ids) ─────────────

-- Personas (de otros usuarios) que representan al usuario actual: mismo email, y email confirmado.
create or replace function public.my_person_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id
  from people p
  join auth.users u on u.id = auth.uid()
  where u.email_confirmed_at is not null
    and p.email is not null
    and lower(p.email) = lower(u.email)
    and p.user_id <> u.id
$$;

-- Consumos de otros usuarios en los que participa el usuario actual.
create or replace function public.shared_expense_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select e.id
  from card_expenses e
  where e.person_id in (select my_person_ids())
     or exists (select 1 from my_person_ids() m where m::text = any (e.compartido))
$$;

create or replace function public.shared_card_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct e.card_id from card_expenses e where e.id in (select shared_expense_ids())
$$;

-- Personas mencionadas en esos consumos (para mostrar los nombres de los participantes).
create or replace function public.shared_people_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select e.person_id from card_expenses e where e.id in (select shared_expense_ids()) and e.person_id is not null
  union
  select x::uuid
  from card_expenses e, unnest(e.compartido) x
  where e.id in (select shared_expense_ids()) and x ~ '^[0-9a-f-]{36}$'
$$;

create or replace function public.shared_owner_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct e.user_id from card_expenses e where e.id in (select shared_expense_ids())
$$;

revoke execute on function public.my_person_ids(), public.shared_expense_ids(), public.shared_card_ids(),
  public.shared_people_ids(), public.shared_owner_ids() from public, anon;
grant execute on function public.my_person_ids(), public.shared_expense_ids(), public.shared_card_ids(),
  public.shared_people_ids(), public.shared_owner_ids() to authenticated;

-- ───────────── Políticas de lectura extra (se suman a "solo dueño") ─────────────

drop policy if exists "compartido conmigo" on public.card_expenses;
create policy "compartido conmigo" on public.card_expenses for select to authenticated
  using (id in (select public.shared_expense_ids()));

drop policy if exists "compartido conmigo" on public.cards;
create policy "compartido conmigo" on public.cards for select to authenticated
  using (id in (select public.shared_card_ids()));

drop policy if exists "compartido conmigo" on public.card_cycles;
create policy "compartido conmigo" on public.card_cycles for select to authenticated
  using (card_id in (select public.shared_card_ids()));

drop policy if exists "compartido conmigo" on public.people;
create policy "compartido conmigo" on public.people for select to authenticated
  using (id in (select public.shared_people_ids()));

drop policy if exists "compartido conmigo" on public.profiles;
create policy "compartido conmigo" on public.profiles for select to authenticated
  using (user_id in (select public.shared_owner_ids()));

-- ───────────── Restaurar backup: incluye el email de las personas ─────────────

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

  insert into people (id, user_id, nombre, email)
    select id, uid, nombre, nullif(trim(email), '')
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

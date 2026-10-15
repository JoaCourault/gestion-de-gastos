-- Gestor de Gastos — esquema para Supabase
-- Pegar completo en: Supabase → SQL Editor → New query → Run.
-- Cada fila pertenece a un usuario (user_id) y RLS garantiza que solo él pueda verla o modificarla.

-- ───────────────────────── Tablas ─────────────────────────

create table if not exists public.cards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  nombre          text not null,
  color           text not null default '#0F766E',
  dia_cierre      int  not null check (dia_cierre between 1 and 31),
  dia_vencimiento int  not null check (dia_vencimiento between 1 and 31),
  activa          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Fechas reales de cierre/vencimiento de un período (mes de cierre 'YYYY-MM').
-- Si un período no tiene fila, se usan los días habituales de la tarjeta.
create table if not exists public.card_cycles (
  card_id     uuid not null references public.cards on delete cascade,
  periodo     text not null check (periodo ~ '^\d{4}-\d{2}$'),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  cierre      date not null,
  vencimiento date not null check (vencimiento >= cierre),
  primary key (card_id, periodo)
);

create table if not exists public.people (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nombre  text not null,
  email   text -- si coincide con el de un usuario, ese usuario ve los consumos donde participa
);

create table if not exists public.card_expenses (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users on delete cascade,
  card_id               uuid not null references public.cards on delete restrict,
  person_id             uuid references public.people on delete restrict, -- null = gasto propio
  descripcion           text not null,
  fijo                  boolean not null default false,
  fecha                 date not null,
  cuotas                int  not null default 1 check (cuotas >= 1),
  total                 numeric(14,2) not null,
  moneda                text not null default 'ARS' check (moneda in ('ARS','USD')),
  partes                int  not null default 1 check (partes >= 1), -- obsoleto: reemplazado por compartido
  compartido            text[] not null default '{}', -- participantes de un consumo compartido ('yo' o id de persona)
  primer_periodo_manual text check (primer_periodo_manual ~ '^\d{4}-\d{2}$'),
  hasta                 text check (hasta ~ '^\d{4}-\d{2}$'),
  notas                 text,
  created_at            timestamptz not null default now()
);

create table if not exists public.expense_types (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users on delete cascade,
  nombre            text not null,
  grupo             text not null default '',
  clase_por_defecto text not null default 'necesario' check (clase_por_defecto in ('necesario','innecesario'))
);

create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  fecha      date not null,
  type_id    uuid not null references public.expense_types on delete restrict,
  detalle    text not null default '',
  monto      numeric(14,2) not null,
  clase      text not null default 'necesario' check (clase in ('necesario','innecesario')),
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id         uuid primary key default auth.uid() references auth.users on delete cascade,
  cotizacion_usd  numeric(14,2) not null default 1,
  presupuesto     jsonb not null default '{"necesario":0,"innecesario":0}',
  presupuesto_mes jsonb not null default '{}'
);

create index if not exists cards_user_idx          on public.cards (user_id);
create index if not exists card_cycles_user_idx    on public.card_cycles (user_id);
create index if not exists people_user_idx         on public.people (user_id);
create index if not exists card_expenses_user_idx  on public.card_expenses (user_id);
create index if not exists card_expenses_card_idx  on public.card_expenses (card_id);
create index if not exists expense_types_user_idx  on public.expense_types (user_id);
create index if not exists expenses_user_fecha_idx on public.expenses (user_id, fecha);

-- ───────────────────────── Seguridad (RLS) ─────────────────────────
-- Sin políticas para 'anon': sin sesión iniciada no se puede leer ni escribir nada.

do $$
declare t text;
begin
  foreach t in array array['cards','card_cycles','people','card_expenses','expense_types','expenses','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "solo dueño" on public.%I', t);
    execute format(
      'create policy "solo dueño" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ───────────────────────── Usuarios y consumos compartidos (migración 003) ─────────────────────────

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

-- Backend propio: esquema inicial. Postgres estándar (13+), sin extensiones ni nada propio de un proveedor.
-- Las tablas de datos son las mismas que en Supabase (mismas columnas e ids): se puede migrar en ambos sentidos.
-- Los permisos NO están en la base (no hay RLS): los aplica la API en cada consulta, filtrando por user_id.

-- ───────────── Usuarios y sesiones ─────────────

create table users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  -- scrypt (propio) o bcrypt (usuarios importados de Supabase; se re-hashea al ingresar)
  password_hash      text not null,
  email_confirmed_at timestamptz,
  created_at         timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));

-- Refresh tokens: se guarda solo el hash. Rotan en cada uso.
create table refresh_tokens (
  token_hash text primary key,
  user_id    uuid not null references users on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index refresh_tokens_user_idx on refresh_tokens (user_id);

-- Tokens de un solo uso enviados por email (confirmación de cuenta).
create table email_tokens (
  token_hash text primary key,
  user_id    uuid not null references users on delete cascade,
  purpose    text not null check (purpose in ('confirm')),
  expires_at timestamptz not null
);

create table profiles (
  user_id uuid primary key references users on delete cascade,
  nombre  text not null default ''
);

-- ───────────── Datos (idénticos a supabase/schema.sql) ─────────────

create table cards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users on delete cascade,
  nombre          text not null,
  color           text not null default '#0F766E',
  dia_cierre      int  not null check (dia_cierre between 1 and 31),
  dia_vencimiento int  not null check (dia_vencimiento between 1 and 31),
  activa          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table card_cycles (
  card_id     uuid not null references cards on delete cascade,
  periodo     text not null check (periodo ~ '^\d{4}-\d{2}$'),
  user_id     uuid not null references users on delete cascade,
  cierre      date not null,
  vencimiento date not null check (vencimiento >= cierre),
  primary key (card_id, periodo)
);

create table people (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  nombre  text not null,
  email   text
);
create index people_email_idx on people (lower(email));

create table card_expenses (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users on delete cascade,
  card_id               uuid not null references cards on delete restrict,
  person_id             uuid references people on delete restrict,
  descripcion           text not null,
  fijo                  boolean not null default false,
  fecha                 date not null,
  cuotas                int  not null default 1 check (cuotas >= 1),
  total                 numeric(14,2) not null,
  moneda                text not null default 'ARS' check (moneda in ('ARS','USD')),
  partes                int  not null default 1 check (partes >= 1),
  compartido            text[] not null default '{}',
  primer_periodo_manual text check (primer_periodo_manual ~ '^\d{4}-\d{2}$'),
  hasta                 text check (hasta ~ '^\d{4}-\d{2}$'),
  notas                 text,
  created_at            timestamptz not null default now()
);
create index card_expenses_compartido_idx on card_expenses using gin (compartido);

create table expense_types (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users on delete cascade,
  nombre            text not null,
  grupo             text not null default '',
  clase_por_defecto text not null default 'necesario' check (clase_por_defecto in ('necesario','innecesario'))
);

create table expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users on delete cascade,
  fecha      date not null,
  type_id    uuid not null references expense_types on delete restrict,
  detalle    text not null default '',
  monto      numeric(14,2) not null,
  clase      text not null default 'necesario' check (clase in ('necesario','innecesario')),
  created_at timestamptz not null default now()
);

create table settings (
  user_id         uuid primary key references users on delete cascade,
  cotizacion_usd  numeric(14,2) not null default 1,
  presupuesto     jsonb not null default '{"necesario":0,"innecesario":0}',
  presupuesto_mes jsonb not null default '{}'
);

create index cards_user_idx          on cards (user_id);
create index card_cycles_user_idx    on card_cycles (user_id);
create index people_user_idx         on people (user_id);
create index card_expenses_user_idx  on card_expenses (user_id);
create index card_expenses_card_idx  on card_expenses (card_id);
create index expense_types_user_idx  on expense_types (user_id);
create index expenses_user_fecha_idx on expenses (user_id, fecha);

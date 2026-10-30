-- Login por nick + PIN, perfiles con rol y permisos por creador.
-- OJO: borra las tablas anteriores (y las partidas de prueba).
-- Pega esto entero en Supabase → SQL Editor → Run

drop table if exists apuntados cascade;
drop table if exists partidas cascade;
drop table if exists perfiles cascade;

create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nick text not null check (nick ~ '^[A-Za-z0-9_]{3,20}$'),
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);
create unique index perfiles_nick_uq on perfiles (lower(nick));

create table partidas (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null default auth.uid() references perfiles(id) on delete cascade,
  game jsonb not null,
  date date not null,
  time time not null,
  place text not null default '',
  max int not null check (max between 2 and 20),
  created_at timestamptz not null default now()
);

create table apuntados (
  id uuid primary key default gen_random_uuid(),
  partida_id uuid not null references partidas(id) on delete cascade,
  user_id uuid not null default auth.uid() references perfiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (partida_id, user_id)
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and role = 'admin')
$$;

-- El creador queda apuntado automáticamente
create or replace function add_creator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into apuntados (partida_id, user_id) values (new.id, new.creator_id);
  return new;
end $$;
create trigger creador_apuntado after insert on partidas
  for each row execute function add_creator();

-- No se puede superar el aforo
create or replace function check_plazas() returns trigger language plpgsql as $$
begin
  if (select count(*) from apuntados where partida_id = new.partida_id)
     >= (select max from partidas where id = new.partida_id) then
    raise exception 'partida_completa';
  end if;
  return new;
end $$;
create trigger plazas before insert on apuntados
  for each row execute function check_plazas();

alter table perfiles enable row level security;
alter table partidas enable row level security;
alter table apuntados enable row level security;

-- perfiles: solo lectura desde la app (los crea el servidor; el rol solo se cambia desde Supabase)
create policy "ver perfiles" on perfiles for select to authenticated using (true);

create policy "ver partidas" on partidas for select to authenticated using (true);
create policy "crear partida propia" on partidas for insert to authenticated with check (creator_id = auth.uid());
create policy "editar partida" on partidas for update to authenticated
  using (creator_id = auth.uid() or is_admin());
create policy "cancelar partida" on partidas for delete to authenticated
  using (creator_id = auth.uid() or is_admin());

create policy "ver apuntados" on apuntados for select to authenticated using (true);
create policy "apuntarme" on apuntados for insert to authenticated with check (user_id = auth.uid());
create policy "desapuntar" on apuntados for delete to authenticated using (
  user_id = auth.uid() or is_admin()
  or exists (select 1 from partidas p where p.id = partida_id and p.creator_id = auth.uid())
);

alter publication supabase_realtime add table partidas, apuntados;

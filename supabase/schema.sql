-- Pega esto entero en Supabase → SQL Editor → Run

create table partidas (
  id uuid primary key default gen_random_uuid(),
  game jsonb not null,
  date date not null,
  time time not null,
  place text not null default '',
  max int not null check (max between 2 and 20),
  host text not null,
  created_at timestamptz not null default now()
);

create table apuntados (
  id uuid primary key default gen_random_uuid(),
  partida_id uuid not null references partidas(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (partida_id, name)
);

-- Impide apuntarse a una partida llena, aunque dos personas lo intenten a la vez
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

-- Seguridad por filas. De momento todo el mundo puede leer, crear y borrar
-- (siguiente paso: que solo el creador pueda cancelar su partida).
alter table partidas enable row level security;
alter table apuntados enable row level security;
create policy "leer partidas" on partidas for select using (true);
create policy "crear partidas" on partidas for insert with check (true);
create policy "borrar partidas" on partidas for delete using (true);
create policy "leer apuntados" on apuntados for select using (true);
create policy "apuntarse" on apuntados for insert with check (true);
create policy "desapuntarse" on apuntados for delete using (true);

-- Cambios en vivo
alter publication supabase_realtime add table partidas, apuntados;

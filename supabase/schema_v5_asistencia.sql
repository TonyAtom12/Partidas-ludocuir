-- Asistencia a las quedadas (un registro por día y persona) + estadísticas personales.
-- Solo AÑADE cosas nuevas: no toca ni borra nada de lo que ya tienes. Ejecútalo UNA vez.
-- Pega esto en Supabase → SQL Editor → Run
-- (Sin símbolos de comparación a propósito: el editor de Supabase se atraganta con ellos junto a $$.)

create table asistencias (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  nick text not null check (length(trim(nick)) between 1 and 40),
  user_id uuid references perfiles(id) on delete set null,   -- null = invitado sin cuenta
  registrado_por uuid default auth.uid() references perfiles(id) on delete set null,
  created_at timestamptz not null default now()
);
-- Una persona solo una vez por día
create unique index asistencias_dia_nick_uq on asistencias (fecha, lower(nick));
create index asistencias_user_idx on asistencias (user_id);

alter table asistencias enable row level security;
-- Solo los admins leen y escriben la asistencia (los jugadores usan mis_estadisticas(), que solo devuelve lo suyo)
create policy "admin ve asistencias"    on asistencias for select to authenticated using (is_admin());
create policy "admin crea asistencias"  on asistencias for insert to authenticated with check (is_admin());
create policy "admin borra asistencias" on asistencias for delete to authenticated using (is_admin());

-- Guarda la asistencia de un día entero (sustituye la lista anterior de ese día). Todo o nada.
-- Si el nick coincide con un usuario registrado se enlaza a su cuenta; si no, queda como invitado.
create or replace function guardar_asistencia(p_fecha date, p_nicks text[]) returns int
language plpgsql security invoker set search_path = public as $fn$
declare v_n int;
begin
  if not is_admin() then raise exception 'solo_admin'; end if;
  if array_length(p_nicks, 1) is not null and array_length(p_nicks, 1) not between 1 and 300 then
    raise exception 'demasiados';
  end if;
  delete from asistencias where fecha = p_fecha;
  insert into asistencias (fecha, nick, user_id)
  select p_fecha, coalesce(max(p.nick), min(trim(n.nick))), max(p.id::text)::uuid
  from unnest(coalesce(p_nicks, array[]::text[])) as n(nick)
  left join perfiles p on lower(p.nick) = lower(trim(n.nick))
  where length(trim(n.nick)) between 1 and 40
  group by lower(trim(n.nick));
  get diagnostics v_n = row_count;
  return v_n;
end
$fn$;
revoke execute on function guardar_asistencia(date, text[]) from public, anon;
grant execute on function guardar_asistencia(date, text[]) to authenticated;

-- Estadísticas del propio jugador (solo las suyas: se filtra por auth.uid()).
-- Un día cuenta como asistido si:
--   a) un admin pasó lista ese día y el jugador figura en ella, o
--   b) es un día ANTERIOR A HOY en el que nadie pasó lista y el jugador estaba apuntado a alguna partida.
-- "Jugó X" = ese día contó como asistido y estaba apuntado a esa partida.
create or replace function mis_estadisticas() returns jsonb
language sql stable security definer set search_path = public as $fn$
  with confirmados as (
    select fecha from asistencias where user_id = auth.uid()
  ),
  sin_lista as (
    select distinct p.date as fecha
    from apuntados a join partidas p on p.id = a.partida_id
    where a.user_id = auth.uid()
      and p.date between date '2000-01-01' and ((now() at time zone 'Europe/Madrid')::date - 1)
      and not exists (select 1 from asistencias s where s.fecha = p.date)
  ),
  d as (select fecha from confirmados union select fecha from sin_lista),
  j as (
    select jsonb_extract_path_text(p.game, 'name') as juego, count(*) as n
    from apuntados a join partidas p on p.id = a.partida_id
    where a.user_id = auth.uid() and p.date in (select fecha from d)
    group by 1
  ),
  l as (
    select p.place as lugar, count(*) as n
    from apuntados a join partidas p on p.id = a.partida_id
    where a.user_id = auth.uid() and p.date in (select fecha from d)
    group by 1
  )
  select jsonb_build_object(
    'dias', (select count(*) from d),
    'primer_dia', (select min(fecha) from d),
    'ultimo_dia', (select max(fecha) from d),
    'juegos', coalesce((select jsonb_agg(jsonb_build_object('juego', juego, 'veces', n) order by n desc, juego) from j), '[]'::jsonb),
    'lugares', coalesce((select jsonb_agg(jsonb_build_object('lugar', lugar, 'veces', n) order by n desc, lugar) from l), '[]'::jsonb)
  );
$fn$;
revoke execute on function mis_estadisticas() from public, anon;
grant execute on function mis_estadisticas() to authenticated;

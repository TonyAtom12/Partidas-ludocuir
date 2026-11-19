-- Avisos (notificaciones push) y encuestas.
-- Solo AÑADE cosas nuevas: no borra tablas ni datos. Ejecútalo UNA vez (si falla, no se aplica nada y puedes repetirlo).
-- Pega esto en Supabase → SQL Editor → Run

-- ============ AVISOS PUSH ============
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references perfiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
-- Cada usuario solo ve y gestiona sus propios dispositivos. El servidor envía con la clave secret.
create policy "ver mis suscripciones" on push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "crear mi suscripcion"  on push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "borrar mi suscripcion" on push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Marca de "ya se avisó de esta partida": evita avisos duplicados.
alter table partidas add column notified_at timestamptz;
-- Que nadie pueda reiniciar esa marca desde la app para repetir el aviso
revoke update on partidas from authenticated;
grant update (game, date, time, place, max) on partidas to authenticated;

-- ============ ENCUESTAS ============
create table encuestas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 500),
  created_by uuid not null default auth.uid() references perfiles(id) on delete cascade,
  closed boolean not null default false,
  created_at timestamptz not null default now()
);

create table encuesta_dias (
  id uuid primary key default gen_random_uuid(),
  encuesta_id uuid not null references encuestas(id) on delete cascade,
  date date not null,
  unique (encuesta_id, date)
);

create table encuesta_votos (
  id uuid primary key default gen_random_uuid(),
  dia_id uuid not null references encuesta_dias(id) on delete cascade,
  user_id uuid not null default auth.uid() references perfiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (dia_id, user_id)
);

alter table encuestas enable row level security;
alter table encuesta_dias enable row level security;
alter table encuesta_votos enable row level security;

-- Solo usuarios registrados las ven (los visitantes sin sesión, no)
create policy "ver encuestas" on encuestas     for select to authenticated using (true);
create policy "ver dias"      on encuesta_dias for select to authenticated using (true);
create policy "ver votos"     on encuesta_votos for select to authenticated using (true);

-- Solo admins crean, cierran/reabren y borran encuestas y sus días
create policy "admin crea encuestas"  on encuestas     for insert to authenticated with check (is_admin() and created_by = auth.uid());
create policy "admin edita encuestas" on encuestas     for update to authenticated using (is_admin()) with check (is_admin());
create policy "admin borra encuestas" on encuestas     for delete to authenticated using (is_admin());
create policy "admin crea dias"       on encuesta_dias for insert to authenticated with check (is_admin());
create policy "admin borra dias"      on encuesta_dias for delete to authenticated using (is_admin());

-- Cualquier registrado vota (y quita su voto) mientras la encuesta esté abierta
create policy "votar" on encuesta_votos for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from encuesta_dias d join encuestas e on e.id = d.encuesta_id where d.id = dia_id and not e.closed)
);
create policy "quitar mi voto" on encuesta_votos for delete to authenticated using (
  user_id = auth.uid()
  and exists (select 1 from encuesta_dias d join encuestas e on e.id = d.encuesta_id where d.id = dia_id and not e.closed)
);

-- Crear encuesta + días de golpe (todo o nada). Se ejecuta con los permisos de quien llama:
-- si no es admin, las políticas de arriba lo bloquean.
create or replace function crear_encuesta(p_title text, p_desc text, p_dates date[]) returns uuid
language plpgsql security invoker set search_path = public as $fn$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'solo_admin'; end if;
  if array_length(p_dates, 1) is null or array_length(p_dates, 1) not between 1 and 31 then
    raise exception 'dias_invalidos';
  end if;
  insert into encuestas (title, description) values (trim(p_title), trim(coalesce(p_desc, ''))) returning id into v_id;
  insert into encuesta_dias (encuesta_id, date) select v_id, x.d from (select distinct unnest(p_dates) as d) x;
  return v_id;
end
$fn$;
revoke execute on function crear_encuesta(text, text, date[]) from public, anon;
grant execute on function crear_encuesta(text, text, date[]) to authenticated;

-- Cambios en vivo
alter publication supabase_realtime add table encuestas, encuesta_dias, encuesta_votos;

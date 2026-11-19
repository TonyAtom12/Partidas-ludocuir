-- Lectura pública: ver partidas, quién se ha apuntado y los nicks SIN iniciar sesión.
-- Escribir (crear, apuntarse, cancelar...) sigue exigiendo login.
-- (Ya aplicado en tu Supabase; se deja aquí para que el repo tenga el historial completo.)

drop policy if exists "ver partidas" on partidas;
create policy "ver partidas" on partidas for select to anon, authenticated using (true);

drop policy if exists "ver apuntados" on apuntados;
create policy "ver apuntados" on apuntados for select to anon, authenticated using (true);

drop policy if exists "ver perfiles" on perfiles;
create policy "ver perfiles" on perfiles for select to anon, authenticated using (true);

-- Los visitantes sin sesión solo pueden leer id y nick de los perfiles (nunca el rol)
revoke select on perfiles from anon;
grant select (id, nick) on perfiles to anon;

// Envía un aviso push a quien lo haya activado cuando se crea una partida.
// Seguridad: solo el creador de la partida puede disparar el aviso, solo una vez, y solo en los
// 15 minutos siguientes a crearla (la marca notified_at se reclama de forma atómica).
import { setVapidDetails, sendNotification } from 'web-push';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildPayload({ id, game, date, time, place, creador }) {
  const when = new Date(`${date}T00:00:00Z`).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
  const nick = creador?.nick ?? 'Alguien';
  const body = `${nick} organiza ${game?.name ?? 'una partida'} · ${when}, ${String(time).slice(0, 5)}${place ? ` · ${place}` : ''}`;
  return { title: 'Nueva partida en Ludocuir', body: body.slice(0, 200), url: '/', tag: `partida-${id}` };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { VAPID_PRIVATE_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey || !VAPID_PRIVATE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(200).json({ sent: 0, skipped: 'avisos sin configurar' });
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const partidaId = req.body?.partidaId;
  if (!token || !UUID.test(partidaId || '')) return res.status(400).json({ error: 'Petición no válida' });

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return res.status(401).json({ error: 'Sesión no válida' });

    // Reclamo atómico: solo si es suya, reciente y aún sin avisar. Si dos peticiones llegan a la vez, solo una gana.
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: partida } = await admin.from('partidas')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', partidaId).eq('creator_id', u.user.id).is('notified_at', null).gte('created_at', since)
      .select('id, game, date, time, place, creador:perfiles!creator_id(nick)')
      .maybeSingle();
    if (!partida) return res.status(200).json({ sent: 0, skipped: 'ya avisada, no es tuya o ha pasado mucho tiempo' });

    // Todos los dispositivos con avisos activados, menos los del propio creador
    const { data: subs } = await admin.from('push_subscriptions')
      .select('id, endpoint, p256dh, auth').neq('user_id', u.user.id).limit(5000);
    if (!subs?.length) return res.status(200).json({ sent: 0, removed: 0 });

    setVapidDetails(process.env.VAPID_SUBJECT || 'https://partidas-neon.vercel.app', publicKey, VAPID_PRIVATE_KEY);
    const payload = JSON.stringify(buildPayload(partida));
    const results = await Promise.allSettled(subs.map((s) =>
      sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: 'normal' })));

    let sent = 0; const dead = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') sent++;
      else if ([404, 410].includes(r.reason?.statusCode)) dead.push(subs[i].id); // dispositivo que ya no existe
    });
    if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead);
    return res.status(200).json({ sent, removed: dead.length });
  } catch (e) {
    console.error('notify:', e);
    return res.status(500).json({ error: 'No se pudo enviar el aviso' });
  }
}

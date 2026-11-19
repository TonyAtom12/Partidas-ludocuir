import { supabase } from './supabase.js';

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// Si no hay clave configurada, la app no ofrece los avisos (no se rompe nada).
export const pushConfigured = !!KEY;
export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// El service worker solo se registra en producción; si no aparece, no se puede suscribir.
async function registration() {
  const timeout = new Promise((r) => setTimeout(() => r(null), 4000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

// 'unsupported' | 'denied' | 'on' | 'off'
export async function getPushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return 'off';
  // Debe existir también en la base de datos a nombre de este usuario (RLS solo deja ver las propias)
  const { data } = await supabase.from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).maybeSingle();
  return data ? 'on' : 'off';
}

// { ok: true } | { ok: false, reason: 'denied' | 'dismissed' | 'no-sw' | 'db' | 'error' }
export async function enablePush() {
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'denied') return { ok: false, reason: 'denied' };
    if (perm !== 'granted') return { ok: false, reason: 'dismissed' };
    const reg = await registration();
    if (!reg) return { ok: false, reason: 'no-sw' };
    const old = await reg.pushManager.getSubscription();
    if (old) await old.unsubscribe(); // siempre una suscripción nueva: evita choques si cambia de usuario o de clave
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(KEY) });
    const j = sub.toJSON();
    const { error } = await supabase.from('push_subscriptions').insert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
    if (error) { await sub.unsubscribe(); return { ok: false, reason: 'db' }; }
    return { ok: true };
  } catch (e) {
    console.error('push:', e);
    return { ok: false, reason: 'error' };
  }
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

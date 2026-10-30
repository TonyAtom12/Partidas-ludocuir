// Registro y reseteo de PIN. Usa la clave secreta de Supabase: solo vive en el servidor (Vercel).
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const sb = () => createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusiones
const newPin = () => Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % 32]).join('');
const emailFor = (n) => `${n.toLowerCase()}@ludocuir.app`; // inventado: nunca recibe correo
const NICK_RE = /^[A-Za-z0-9_]{3,20}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Servidor sin configurar' });
  const { action, nick } = req.body || {};
  if (!NICK_RE.test(nick || '')) return res.status(400).json({ error: 'Nick no válido (3-20 letras, números o _).' });
  const admin = sb();

  if (action === 'register') {
    const pin = newPin();
    const { data, error } = await admin.auth.admin.createUser({ email: emailFor(nick), password: pin, email_confirm: true });
    if (error) return res.status(409).json({ error: 'Ese nick ya existe.' });
    const ins = await admin.from('perfiles').insert({ id: data.user.id, nick });
    if (ins.error) {
      await admin.auth.admin.deleteUser(data.user.id);
      return res.status(409).json({ error: 'Ese nick ya existe.' });
    }
    return res.status(200).json({ pin });
  }

  if (action === 'reset') {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const { data: u } = await admin.auth.getUser(token);
    const { data: yo } = u?.user ? await admin.from('perfiles').select('role').eq('id', u.user.id).single() : { data: null };
    if (yo?.role !== 'admin') return res.status(403).json({ error: 'Solo admins.' });
    const { data: rows } = await admin.from('perfiles').select('id, nick').ilike('nick', nick);
    const target = (rows || []).find((r) => r.nick.toLowerCase() === nick.toLowerCase());
    if (!target) return res.status(404).json({ error: 'No existe ese usuario.' });
    const pin = newPin();
    const { error } = await admin.auth.admin.updateUserById(target.id, { password: pin });
    if (error) return res.status(500).json({ error: 'No se pudo cambiar el PIN.' });
    return res.status(200).json({ pin, nick: target.nick });
  }
  return res.status(400).json({ error: 'Acción desconocida' });
}

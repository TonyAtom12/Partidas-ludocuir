// Proxy a la BGG XML API2. El token vive solo aquí (variable de entorno).
import { XMLParser } from 'fast-xml-parser';

const BASE = 'https://boardgamegeek.com/xmlapi2'; // sin "www"
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

const MOCK = [
  { id: 13, name: 'Catan', year: 1995, minPlayers: 3, maxPlayers: 4, minutes: 120 },
  { id: 822, name: 'Carcassonne', year: 2000, minPlayers: 2, maxPlayers: 5, minutes: 45 },
  { id: 30549, name: 'Pandemic', year: 2008, minPlayers: 2, maxPlayers: 4, minutes: 45 },
  { id: 174430, name: 'Gloomhaven', year: 2017, minPlayers: 1, maxPlayers: 4, minutes: 120 },
  { id: 167791, name: 'Terraforming Mars', year: 2016, minPlayers: 1, maxPlayers: 5, minutes: 120 },
  { id: 266192, name: 'Wingspan', year: 2019, minPlayers: 1, maxPlayers: 5, minutes: 70 },
].map((g) => ({ ...g, thumbnail: null }));

async function bgg(path, token) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`BGG ${r.status}`);
  return parser.parse(await r.text());
}

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.status(200).json({ results: [] });

  const token = process.env.BGG_TOKEN;
  if (!token) {
    const results = MOCK.filter((g) => g.name.toLowerCase().includes(q.toLowerCase()));
    return res.status(200).json({ mock: true, results });
  }

  try {
    const s = await bgg(`/search?query=${encodeURIComponent(q)}&type=boardgame`, token);
    const ids = arr(s.items?.item).slice(0, 8).map((i) => i.id);
    if (!ids.length) return res.status(200).json({ results: [] });

    const t = await bgg(`/thing?id=${ids.join(',')}`, token);
    const results = arr(t.items?.item).map((i) => ({
      id: Number(i.id),
      name: arr(i.name).find((n) => n.type === 'primary')?.value ?? '?',
      year: Number(i.yearpublished?.value) || null,
      minPlayers: Number(i.minplayers?.value) || null,
      maxPlayers: Number(i.maxplayers?.value) || null,
      minutes: Number(i.playingtime?.value) || null,
      thumbnail: i.thumbnail || null,
    }));
    // Caché en el edge de Vercel: un día, para no machacar la BGG
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ results });
  } catch (e) {
    return res.status(502).json({ error: 'No se pudo consultar la BGG', results: [] });
  }
}

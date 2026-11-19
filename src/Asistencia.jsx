import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';

const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD en hora local
const shift = (iso, n) => { const d = new Date(`${iso}T00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const dayLong = (d) => new Date(`${d}T00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dayShort = (d) => new Date(`${d}T00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
const key = (n) => n.trim().toLowerCase();
const byNick = (a, b) => a.nick.localeCompare(b.nick, 'es');

function Seg({ value, onChange, items }) {
  return (
    <div className="seg" role="tablist">
      {items.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

// ---------- Pasar lista de un día ----------
function PasarLista() {
  const [date, setDate] = useState(today());
  const [people, setPeople] = useState([]); // { key, nick, games[] }
  const [checked, setChecked] = useState(new Set());
  const [nick, setNick] = useState('');
  const [state, setState] = useState('loading'); // loading | ok | error
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (d) => {
    setState('loading'); setMsg(''); setDirty(false);
    const [p, a] = await Promise.all([
      supabase.from('partidas').select('id, game, apuntados(user_id, perfiles(nick))').eq('date', d),
      supabase.from('asistencias').select('nick').eq('fecha', d),
    ]);
    if (p.error || a.error) { console.error('Supabase asistencia:', p.error || a.error); setState('error'); return; }
    const map = new Map();
    p.data.forEach((s) => (s.apuntados || []).forEach((x) => {
      const n = x.perfiles?.nick; if (!n) return;
      const k = key(n);
      if (!map.has(k)) map.set(k, { key: k, nick: n, games: [] });
      map.get(k).games.push(s.game?.name ?? '?');
    }));
    a.data.forEach((r) => { const k = key(r.nick); if (!map.has(k)) map.set(k, { key: k, nick: r.nick, games: [] }); });
    setPeople([...map.values()].sort(byNick));
    // Si ya se pasó lista ese día, se respeta; si no, se parte de "todos los apuntados han venido"
    setChecked(a.data.length ? new Set(a.data.map((r) => key(r.nick))) : new Set(map.keys()));
    setSaved(a.data.length > 0);
    setState('ok');
  }, []);

  useEffect(() => { if (date) load(date); }, [date, load]);

  const toggle = (k) => { setChecked((c) => { const n = new Set(c); n.has(k) ? n.delete(k) : n.add(k); return n; }); setDirty(true); setMsg(''); };
  const all = (on) => { setChecked(on ? new Set(people.map((p) => p.key)) : new Set()); setDirty(true); setMsg(''); };

  const add = () => {
    const n = nick.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!n) return;
    const k = key(n);
    setPeople((ps) => (ps.some((p) => p.key === k) ? ps : [...ps, { key: k, nick: n, games: [] }].sort(byNick)));
    setChecked((c) => new Set(c).add(k));
    setNick(''); setDirty(true); setMsg('');
  };
  const removeExtra = (k) => { setPeople((ps) => ps.filter((p) => p.key !== k)); setChecked((c) => { const n = new Set(c); n.delete(k); return n; }); setDirty(true); };

  async function save() {
    setBusy(true); setMsg('');
    const nicks = people.filter((p) => checked.has(p.key)).map((p) => p.nick);
    const { error } = await supabase.rpc('guardar_asistencia', { p_fecha: date, p_nicks: nicks });
    setBusy(false);
    if (error) { console.error(error); return setMsg(error.message.includes('solo_admin') ? 'Solo los administradores pueden pasar lista.' : 'No se pudo guardar. Inténtalo de nuevo.'); }
    setSaved(true); setDirty(false); setMsg(`Guardado: ${nicks.length} ${nicks.length === 1 ? 'asistente' : 'asistentes'}.`);
  }

  return (
    <section className="stack" aria-label="Pasar lista">
      <div className="card">
        <label htmlFor="as-day">Día de la quedada</label>
        <div className="daynav">
          <button type="button" className="btn-ghost" onClick={() => setDate(shift(date, -1))} aria-label="Día anterior">‹</button>
          <input id="as-day" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button type="button" className="btn-ghost" onClick={() => setDate(shift(date, 1))} aria-label="Día siguiente">›</button>
        </div>
        <p className="hint" style={{ textAlign: 'center' }}>{dayLong(date)}{saved && !dirty ? ' · lista guardada ✓' : ''}</p>
      </div>

      {state === 'error' && <div className="card empty"><p>No se pudo cargar. Revisa la conexión.</p><button className="btn" onClick={() => load(date)}>Reintentar</button></div>}
      {state === 'loading' && <p className="hint" style={{ textAlign: 'center' }}>Cargando…</p>}

      {state === 'ok' && (
        <div className="card">
          <h2 className="h2">Quién ha venido</h2>
          {!saved && people.length > 0 && <p className="hint">Salen marcados todos los apuntados. Desmarca a quien no haya venido.</p>}
          {!people.length && <p className="hint">Ese día no hay apuntados. Puedes añadir asistentes por su nick aquí abajo.</p>}
          {people.length > 0 && (
            <p className="mini"><button type="button" className="link" onClick={() => all(true)}>Marcar todos</button><button type="button" className="link" onClick={() => all(false)}>Ninguno</button></p>
          )}
          <ul className="chks">
            {people.map((p) => (
              <li key={p.key}>
                <label className="chk">
                  <input type="checkbox" checked={checked.has(p.key)} onChange={() => toggle(p.key)} />
                  <span><b>{p.nick}</b>{p.games.length > 0 ? <small>{[...new Set(p.games)].join(', ')}</small> : <small>Sin apuntarse</small>}</span>
                </label>
                {p.games.length === 0 && <button type="button" className="x" onClick={() => removeExtra(p.key)} aria-label={`Quitar ${p.nick}`}>✕</button>}
              </li>
            ))}
          </ul>
          <label htmlFor="as-nick">Añadir a alguien que no estaba apuntado</label>
          <div className="adddate">
            <input id="as-nick" value={nick} maxLength={40} placeholder="Nick" onChange={(e) => setNick(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
            <button type="button" className="btn-ghost" onClick={add} disabled={!nick.trim()}>Añadir</button>
          </div>
          {msg && <p className="hint" role="status" style={{ color: msg.startsWith('Guardado') ? 'var(--gold-hi)' : 'var(--danger)' }}>{msg}</p>}
          <button className="btn block" style={{ marginTop: 14 }} onClick={save} disabled={busy || !checked.size}>
            {busy ? '…' : `Guardar asistencia (${checked.size})`}
          </button>
        </div>
      )}
    </section>
  );
}

// ---------- Informe ----------
const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

function Informe() {
  const [from, setFrom] = useState(shift(today(), -90));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState([]);
  const [apuntados, setApuntados] = useState([]); // { date, k, nick }
  const [state, setState] = useState('loading');

  const load = useCallback(async () => {
    if (!from || !to) return;
    setState('loading');
    const [a, p] = await Promise.all([
      supabase.from('asistencias').select('fecha, nick, user_id').gte('fecha', from).lte('fecha', to).order('fecha').limit(5000),
      supabase.from('partidas').select('date, apuntados(perfiles(nick))').gte('date', from).lte('date', to).limit(5000),
    ]);
    if (a.error || p.error) { console.error('Supabase informe:', a.error || p.error); setState('error'); return; }
    setRows(a.data);
    setApuntados(p.data.flatMap((s) => (s.apuntados || []).map((x) => x.perfiles?.nick).filter(Boolean).map((n) => ({ date: s.date, k: key(n), nick: n }))));
    setState('ok');
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const rep = useMemo(() => {
    const days = new Map(); // fecha -> Set(k)
    const rank = new Map(); // k -> { nick, n }
    rows.forEach((r) => {
      const k = key(r.nick);
      if (!days.has(r.fecha)) days.set(r.fecha, new Set());
      days.get(r.fecha).add(k);
      const e = rank.get(k) || { nick: r.nick, n: 0 }; e.n += 1; rank.set(k, e);
    });
    const list = [...days.entries()].sort((x, y) => y[0].localeCompare(x[0])).map(([fecha, set]) => {
      const missing = new Map();
      apuntados.filter((x) => x.date === fecha && !set.has(x.k)).forEach((x) => missing.set(x.k, x.nick));
      return { fecha, n: set.size, missing: [...missing.values()].sort((a, b) => a.localeCompare(b, 'es')) };
    });
    const total = rows.length;
    return {
      list, total, quedadas: days.size,
      media: days.size ? (total / days.size).toFixed(1).replace('.', ',') : '0',
      ranking: [...rank.values()].sort((x, y) => y.n - x.n || x.nick.localeCompare(y.nick, 'es')),
    };
  }, [rows, apuntados]);

  function exportCsv() {
    const head = ['fecha', 'nick', 'usuario_registrado'];
    const lines = [head, ...rows.map((r) => [r.fecha, r.nick, r.user_id ? 'sí' : 'no'])].map((l) => l.map(csvCell).join(';'));
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `asistencia_${from}_${to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const maxRank = rep.ranking[0]?.n || 1;

  return (
    <section className="stack" aria-label="Informe de asistencia">
      <div className="card">
        <div className="range">
          <label>Desde<input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
          <label>Hasta<input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        </div>
        <p className="mini">
          <button type="button" className="link" onClick={() => { setFrom(shift(today(), -30)); setTo(today()); }}>30 días</button>
          <button type="button" className="link" onClick={() => { setFrom(shift(today(), -90)); setTo(today()); }}>90 días</button>
          <button type="button" className="link" onClick={() => { setFrom(`${new Date().getFullYear()}-01-01`); setTo(today()); }}>Este año</button>
          <button type="button" className="link" onClick={() => { setFrom('2020-01-01'); setTo(today()); }}>Todo</button>
        </p>
      </div>

      {state === 'error' && <div className="card empty"><p>No se pudo cargar el informe.</p><button className="btn" onClick={load}>Reintentar</button></div>}
      {state === 'loading' && <p className="hint" style={{ textAlign: 'center' }}>Cargando…</p>}

      {state === 'ok' && !rows.length && <div className="card empty"><p>No hay asistencia registrada en estas fechas. Pasa lista en la pestaña «Pasar lista».</p></div>}

      {state === 'ok' && rows.length > 0 && (
        <>
          <div className="stats">
            <div><b>{rep.quedadas}</b><span>quedadas</span></div>
            <div><b>{rep.total}</b><span>asistencias</span></div>
            <div><b>{rep.media}</b><span>media por día</span></div>
          </div>

          <div className="card">
            <h2 className="h2">Asistencia por persona</h2>
            <ul className="bars">
              {rep.ranking.map((r) => (
                <li key={r.nick}>
                  <span className="bar-name">{r.nick}</span>
                  <span className="bar-track"><span style={{ width: `${(r.n / maxRank) * 100}%` }} /></span>
                  <span className="bar-n">{r.n}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h2 className="h2">Por quedada</h2>
            <ul className="daylist">
              {rep.list.map((d) => (
                <li key={d.fecha}>
                  <div><b>{dayShort(d.fecha)}</b><span>{d.n} {d.n === 1 ? 'asistente' : 'asistentes'}</span></div>
                  {d.missing.length > 0 && <small>Apuntados que no vinieron: {d.missing.join(', ')}</small>}
                </li>
              ))}
            </ul>
          </div>

          <button className="btn block" onClick={exportCsv}>Descargar CSV</button>
        </>
      )}
    </section>
  );
}

export function AsistenciaView() {
  const [sec, setSec] = useState('lista');
  return (
    <>
      <Seg value={sec} onChange={setSec} items={[['lista', 'Pasar lista'], ['informe', 'Informe']]} />
      {sec === 'lista' ? <PasarLista /> : <Informe />}
    </>
  );
}

// ---------- Mi actividad (cada jugador ve solo lo suyo) ----------
export function MiActividad({ me }) {
  const [s, setS] = useState(null);
  const [state, setState] = useState('loading');

  const load = useCallback(async () => {
    setState('loading');
    const { data, error } = await supabase.rpc('mis_estadisticas');
    if (error) { console.error('Supabase mis_estadisticas:', error); setState('error'); return; }
    setS(data); setState('ok');
  }, []);
  useEffect(() => { load(); }, [load]);

  if (state === 'error') return <div className="card empty"><p>No se pudieron cargar tus estadísticas.</p><button className="btn" onClick={load}>Reintentar</button></div>;
  if (state === 'loading') return <p className="hint" style={{ textAlign: 'center' }}>Cargando…</p>;

  const maxJ = s.juegos[0]?.veces || 1;
  const maxL = s.lugares[0]?.veces || 1;
  return (
    <section className="stack" aria-label="Mi actividad">
      <div className="card">
        <p className="eyebrow">{me.nick}</p>
        {s.dias === 0
          ? <p className="hint">Todavía no tienes quedadas. Cuentan los días pasados en los que te apuntaste a alguna partida, o en los que un administrador te marcó en la lista.</p>
          : <div className="stats one"><div><b>{s.dias}</b><span>{s.dias === 1 ? 'quedada' : 'quedadas'}</span></div></div>}
        {s.dias > 0 && <p className="hint" style={{ textAlign: 'center' }}>Primera: {dayShort(s.primer_dia)} · Última: {dayShort(s.ultimo_dia)}</p>}
      </div>

      {s.juegos.length > 0 && (
        <div className="card">
          <h2 className="h2">Juegos en los que has jugado</h2>
          <ul className="bars">
            {s.juegos.map((j) => (
              <li key={j.juego}>
                <span className="bar-name">{j.juego}</span>
                <span className="bar-track"><span style={{ width: `${(j.veces / maxJ) * 100}%` }} /></span>
                <span className="bar-n">{j.veces}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.lugares.length > 0 && (
        <div className="card">
          <h2 className="h2">Dónde has jugado</h2>
          <ul className="bars">
            {s.lugares.map((l) => (
              <li key={l.lugar}>
                <span className="bar-name">{l.lugar}</span>
                <span className="bar-track"><span style={{ width: `${(l.veces / maxL) * 100}%` }} /></span>
                <span className="bar-n">{l.veces}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.dias > 0 && <p className="hint" style={{ textAlign: 'center' }}>Cuenta un juego cuando ese día cuenta como asistido y estabas apuntado a la partida. Solo tú ves esto.</p>}
    </section>
  );
}

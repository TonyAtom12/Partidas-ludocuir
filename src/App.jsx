import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';


function GameSearch({ onPick }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle');
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setState('idle'); return; }
    const mine = ++seq.current;
    setState('loading');
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        if (mine !== seq.current) return;
        setResults(d.results || []);
        setState(r.ok ? 'done' : 'error');
      } catch { if (mine === seq.current) setState('error'); }
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca un juego en la BGG…" />
      {state === 'loading' && <p className="hint">Buscando…</p>}
      {state === 'error' && <p className="hint">No se pudo buscar. Inténtalo de nuevo en un momento.</p>}
      {state === 'done' && !results.length && <p className="hint">Sin resultados para "{q}".</p>}
      <ul className="results">
        {results.map((g) => (
          <li key={g.id}>
            <button type="button" className="option-btn" onClick={() => { onPick(g); setQ(''); setResults([]); }}>
              {g.thumbnail ? <img className="thumb" src={g.thumbnail} alt="" /> : <span className="thumb" />}
              <span><b>{g.name}</b> {g.year && `(${g.year})`}<br />
                <small>{g.minPlayers}–{g.maxPlayers} jugadores · {g.minutes} min</small></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewSession({ onCreate }) {
  const [game, setGame] = useState(null);
  const [f, setF] = useState({ date: '', time: '', place: '', max: 4, host: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = game && f.date && f.time && f.host.trim();

  const submit = (e) => {
    e.preventDefault();
    onCreate({ game, ...f, host: f.host.trim(), max: Number(f.max), players: [f.host.trim()] });
    setGame(null); setF({ date: '', time: '', place: '', max: 4, host: '' });
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2 className="h2">Nueva partida</h2>
      {game
        ? <p className="picked"><span>✦ {game.name}</span> <button type="button" className="link" onClick={() => setGame(null)}>Cambiar</button></p>
        : <GameSearch onPick={(g) => { setGame(g); setF((x) => ({ ...x, max: g.maxPlayers || 4 })); }} />}
      <div className="row">
        <label>Fecha<input type="date" value={f.date} onChange={set('date')} /></label>
        <label>Hora<input type="time" value={f.time} onChange={set('time')} /></label>
      </div>
      <div className="row">
        <label>Lugar<input value={f.place} onChange={set('place')} placeholder="Local de la asociación" /></label>
        <label>Plazas<input type="number" min="2" max="20" value={f.max} onChange={set('max')} /></label>
      </div>
      <label>Tu nombre<input value={f.host} onChange={set('host')} /></label>
      <button className="btn block" disabled={!ok}>Crear partida</button>
    </form>
  );
}

function SessionCard({ s, onJoin, onLeave, onDelete }) {
  const [name, setName] = useState('');
  const full = s.players.length >= s.max;
  const when = new Date(`${s.date}T${s.time}`).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return (
    <li className="card session">
      <h3>{s.game.name}</h3>
      <p className="when">{when}</p>
      {s.place && <p className="where">{s.place}</p>}
      <div className="ornament"><div className="ornament-line" /><div className="ornament-dot" /><div className="ornament-line" /></div>
      <div className="seats"><span>{s.players.length} de {s.max} plazas</span><span>{full ? 'Completa' : `Quedan ${s.max - s.players.length}`}</span></div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${(s.players.length / s.max) * 100}%` }} /></div>
      <ul className="tags">
        {s.players.map((p) => (
          <li key={p} className="tag">{p}<button onClick={() => onLeave(s.id, p)} aria-label={`Quitar a ${p}`}>✕</button></li>
        ))}
      </ul>
      {!full && (
        <div className="join">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
          <button className="btn-ghost" disabled={!name.trim() || s.players.includes(name.trim())} onClick={() => { onJoin(s.id, name.trim()); setName(''); }}>Apuntarme</button>
        </div>
      )}
      <p className="cancel"><button className="link danger" onClick={() => onDelete(s.id)}>Cancelar partida</button></p>
    </li>
  );
}

const GameDie = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="36" height="36" rx="8" fill="#e8b86d" stroke="#c49a4a" strokeWidth="2" />
    {[[12,12],[28,12],[20,20],[12,28],[28,28]].map(([x, y]) => <circle key={x + '-' + y} cx={x} cy={y} r="3" fill="#1a1a2e" />)}
  </svg>
);

const ListIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" />
  </svg>
);
const PlusIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" /><path d="M12 8v8M8 12h8" />
  </svg>
);

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState('loading');
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('list');

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('partidas').select('*, apuntados(id, name, created_at)').order('date').order('time');
    if (error) { setStatus('error'); return; }
    setSessions(data.map((r) => ({
      id: r.id, game: r.game, date: r.date, time: r.time.slice(0, 5), place: r.place, max: r.max, host: r.host,
      players: (r.apuntados || []).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((a) => a.name),
    })));
    setStatus('ok');
  }, []);

  useEffect(() => {
    refresh();
    const ch = supabase.channel('cambios').on('postgres_changes', { event: '*', schema: 'public' }, refresh).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  const sorted = [...sessions].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const go = (t) => { setTab(t); window.scrollTo({ top: 0 }); };

  async function create(s) {
    setErr('');
    const { data, error } = await supabase.from('partidas')
      .insert({ game: s.game, date: s.date, time: s.time, place: s.place, max: s.max, host: s.host }).select('id').single();
    if (error) return setErr('No se pudo crear la partida. Inténtalo de nuevo.');
    const r = await supabase.from('apuntados').insert({ partida_id: data.id, name: s.players[0] });
    if (r.error) setErr('La partida se creó, pero no se pudo apuntar al creador.');
    await refresh();
    go('list');
  }
  async function join(id, name) {
    setErr('');
    const { error } = await supabase.from('apuntados').insert({ partida_id: id, name });
    if (error) setErr(error.message.includes('partida_completa') ? 'La partida se acaba de llenar.' : error.code === '23505' ? 'Ya estás apuntado/a.' : 'No se pudo apuntar. Inténtalo de nuevo.');
    refresh();
  }
  async function leave(id, name) {
    setErr('');
    const { error } = await supabase.from('apuntados').delete().eq('partida_id', id).eq('name', name);
    if (error) setErr('No se pudo quitar. Inténtalo de nuevo.');
    refresh();
  }
  async function remove(id) {
    setErr('');
    const { error } = await supabase.from('partidas').delete().eq('id', id);
    if (error) setErr('No se pudo cancelar la partida. Inténtalo de nuevo.');
    refresh();
  }

  return (
    <>
      <main>
        <header className="topbar">
          <GameDie />
          <div><p className="eyebrow">Asociación Ludocuir</p><h1>{tab === 'list' ? 'Próximas partidas' : 'Nueva partida'}</h1></div>
        </header>

        {err && <p className="card notice" role="alert">{err}</p>}

        {tab === 'new' && <NewSession onCreate={create} />}

        {tab === 'list' && status === 'loading' && <p className="card empty">Cargando partidas…</p>}
        {tab === 'list' && status === 'error' && (
          <div className="card empty"><p>No se pudieron cargar las partidas. Revisa la conexión.</p><button className="btn" onClick={refresh}>Reintentar</button></div>
        )}

        {tab === 'list' && status === 'ok' && (
          <section aria-label="Próximas partidas">
            {!sorted.length && (
              <div className="card empty">
                <p>Todavía no hay ninguna partida.</p>
                <button className="btn" onClick={() => go('new')}>Crear la primera</button>
              </div>
            )}
            <ul className="sessions">
              {sorted.map((s) => (
                <SessionCard key={s.id} s={s}
                  onJoin={join} onLeave={leave} onDelete={remove} />
              ))}
            </ul>
          </section>
        )}
      </main>

      <nav className="tabbar" aria-label="Navegación principal">
        <button className={tab === 'list' ? 'on' : ''} aria-current={tab === 'list' ? 'page' : undefined} onClick={() => go('list')}>
          <ListIcon /><span>Partidas{sessions.length > 0 && <b className="badge">{sessions.length}</b>}</span>
        </button>
        <button className={tab === 'new' ? 'on' : ''} aria-current={tab === 'new' ? 'page' : undefined} onClick={() => go('new')}>
          <PlusIcon /><span>Crear</span>
        </button>
      </nav>
    </>
  );
}

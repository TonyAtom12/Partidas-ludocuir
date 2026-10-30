import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';

const NICK_RE = /^[A-Za-z0-9_]{3,20}$/;
const emailFor = (n) => `${n.toLowerCase()}@ludocuir.app`;
const post = (body, token) => fetch('/api/auth', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: JSON.stringify(body),
}).then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }));

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

function AuthScreen({ onRegistered }) {
  const [mode, setMode] = useState('login');
  const [nick, setNick] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const valid = NICK_RE.test(nick) && (mode === 'register' || secret.trim());

  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg('');
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: emailFor(nick), password: secret.trim().toUpperCase() });
      if (error) setMsg('Nick o PIN incorrectos.');
    } else {
      const d = await post({ action: 'register', nick });
      if (!d.ok) setMsg(d.error || 'No se pudo crear el usuario.');
      else {
        onRegistered({ nick, pin: d.pin });
        const { error } = await supabase.auth.signInWithPassword({ email: emailFor(nick), password: d.pin });
        if (error) setMsg('Usuario creado, pero no se pudo entrar. Prueba a entrar con tu PIN.');
      }
    }
    setBusy(false);
  }
  const login = mode === 'login';
  return (
    <form className="card" onSubmit={submit}>
      <div className="center"><GameDie /></div>
      <p className="eyebrow">Asociación Ludocuir</p>
      <h1 className="title">{login ? 'Entrar' : 'Crear usuario'}</h1>
      <div className="ornament"><div className="ornament-line" /><div className="ornament-dot" /><div className="ornament-line" /></div>
      <label>Nick<input value={nick} onChange={(e) => setNick(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="Letras, números o _" /></label>
      {login && (
        <label>PIN
          <input value={secret} onChange={(e) => setSecret(e.target.value)} autoCapitalize="characters" autoCorrect="off" autoComplete="off" placeholder="Tu PIN de 8 caracteres" />
        </label>
      )}
      {!login && <p className="hint">Al crear el usuario te daremos un PIN para entrar.</p>}
      {msg && <p className="hint" role="alert" style={{ color: 'var(--danger)' }}>{msg}</p>}
      <button className="btn block" disabled={!valid || busy}>{busy ? '…' : login ? 'Entrar' : 'Crear usuario'}</button>
      <p className="cancel"><button type="button" className="link" onClick={() => { setMode(login ? 'register' : 'login'); setMsg(''); setSecret(''); }}>
        {login ? 'Soy nuevo: crear usuario' : 'Ya tengo usuario: entrar'}</button></p>
    </form>
  );
}

function PinScreen({ nick, pin, onDone }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(pin); setCopied(true); } catch {} };
  return (
    <div className="card">
      <p className="eyebrow">Bienvenido/a, {nick}</p>
      <h1 className="title">Tu PIN</h1>
      <div className="pin">{pin}</div>
      <p className="subtitle">Apúntalo ahora: <b>no se vuelve a mostrar</b>. Lo necesitas para entrar desde otro móvil. Si lo pierdes, un admin te puede generar uno nuevo.</p>
      <p className="center" style={{ margin: '16px 0 0' }}><button type="button" className="btn-ghost" onClick={copy}>{copied ? 'Copiado' : 'Copiar PIN'}</button></p>
      <label style={{ marginTop: 20 }}><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />Ya lo he guardado</label>
      <button className="btn block" disabled={!saved} onClick={onDone}>Continuar</button>
    </div>
  );
}

function AdminPanel({ session }) {
  const [nick, setNick] = useState('');
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState('');
  async function reset(e) {
    e.preventDefault(); setMsg(''); setRes(null);
    const d = await post({ action: 'reset', nick: nick.trim() }, session.access_token);
    if (d.ok) setRes(d); else setMsg(d.error || 'No se pudo.');
  }
  return (
    <form className="card" onSubmit={reset}>
      <h2 className="h2">Nuevo PIN para un socio</h2>
      <label>Nick<input value={nick} onChange={(e) => setNick(e.target.value)} autoCapitalize="none" autoCorrect="off" /></label>
      <button className="btn block" disabled={!NICK_RE.test(nick.trim())}>Generar PIN nuevo</button>
      {msg && <p className="hint" role="alert" style={{ color: 'var(--danger)' }}>{msg}</p>}
      {res && <><p className="hint">PIN nuevo de {res.nick} (pásaselo y no se vuelve a mostrar):</p><div className="pin">{res.pin}</div></>}
    </form>
  );
}

function NewSession({ onCreate }) {
  const [game, setGame] = useState(null);
  const blank = { date: '', time: '', place: '', max: 4 };
  const [f, setF] = useState(blank);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = game && f.date && f.time;
  const submit = (e) => { e.preventDefault(); onCreate({ game, ...f, max: Number(f.max) }); setGame(null); setF(blank); };
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
      <button className="btn block" disabled={!ok}>Crear partida</button>
    </form>
  );
}

function SessionCard({ s, me, onJoin, onLeave, onDelete }) {
  const full = s.players.length >= s.max;
  const joined = s.players.some((p) => p.id === me.id);
  const manage = s.creatorId === me.id || me.role === 'admin';
  const when = new Date(`${s.date}T${s.time}`).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return (
    <li className="card session">
      <h3>{s.game.name}</h3>
      <p className="when">{when}</p>
      <p className="where">{s.place && <>{s.place} · </>}Organiza {s.creatorNick}</p>
      <div className="ornament"><div className="ornament-line" /><div className="ornament-dot" /><div className="ornament-line" /></div>
      <div className="seats"><span>{s.players.length} de {s.max} plazas</span><span>{full ? 'Completa' : `Quedan ${s.max - s.players.length}`}</span></div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${(s.players.length / s.max) * 100}%` }} /></div>
      <ul className="tags">
        {s.players.map((p) => (
          <li key={p.id} className="tag">{p.nick}
            {(p.id === me.id || manage) && <button onClick={() => onLeave(s.id, p.id)} aria-label={`Quitar a ${p.nick}`}>✕</button>}
          </li>
        ))}
      </ul>
      {!joined && !full && <button className="btn-ghost" style={{ width: '100%' }} onClick={() => onJoin(s.id)}>Apuntarme</button>}
      {manage && <p className="cancel"><button className="link danger" onClick={() => onDelete(s.id)}>Cancelar partida</button></p>}
    </li>
  );
}

const GameDie = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="36" height="36" rx="8" fill="#e8b86d" stroke="#c49a4a" strokeWidth="2" />
    {[[12,12],[28,12],[20,20],[12,28],[28,28]].map(([x, y]) => <circle key={x + '-' + y} cx={x} cy={y} r="3" fill="#1a1a2e" />)}
  </svg>
);
const Icon = ({ d, extra }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d={d} />{extra}</svg>
);
const ICONS = { list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', new: 'M12 5v14M5 12h14', admin: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z' };

export default function App() {
  const [session, setSession] = useState(undefined);
  const [me, setMe] = useState(null);
  const [fresh, setFresh] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState('loading');
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('list');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) { setMe(null); return; }
    supabase.from('perfiles').select('id, nick, role').eq('id', uid).single().then(({ data }) => setMe(data));
  }, [uid]);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('partidas')
      .select('*, creador:perfiles!creator_id(nick), apuntados(user_id, created_at, perfiles(nick))').order('date').order('time');
    if (error) { console.error('Supabase:', error); setStatus('error'); return; }
    setSessions(data.map((r) => ({
      id: r.id, game: r.game, date: r.date, time: r.time.slice(0, 5), place: r.place, max: r.max,
      creatorId: r.creator_id, creatorNick: r.creador?.nick ?? '?',
      players: [...r.apuntados].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((a) => ({ id: a.user_id, nick: a.perfiles?.nick ?? '?' })),
    })));
    setStatus('ok');
  }, []);

  useEffect(() => {
    if (!me) return;
    refresh();
    const ch = supabase.channel('cambios').on('postgres_changes', { event: '*', schema: 'public' }, refresh).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, refresh]);

  const go = (t) => { setTab(t); window.scrollTo({ top: 0 }); };
  const run = async (q, msg) => { setErr(''); const { error } = await q; if (error) setErr(msg(error)); await refresh(); return !error; };

  const create = async (s) => { if (await run(supabase.from('partidas').insert(s), () => 'No se pudo crear la partida.')) go('list'); };
  const join = (id) => run(supabase.from('apuntados').insert({ partida_id: id }),
    (e) => (e.message.includes('partida_completa') ? 'La partida se acaba de llenar.' : 'No se pudo apuntar.'));
  const leave = (id, userId) => run(supabase.from('apuntados').delete().eq('partida_id', id).eq('user_id', userId), () => 'No se pudo quitar.');
  const remove = (id) => run(supabase.from('partidas').delete().eq('id', id), () => 'No se pudo cancelar la partida.');

  if (fresh) return <main><PinScreen {...fresh} onDone={() => setFresh(null)} /></main>;
  if (session === undefined) return <main><p className="card empty">Cargando…</p></main>;
  if (!session) return <main><AuthScreen onRegistered={setFresh} /></main>;
  if (!me) return <main><p className="card empty">Cargando…</p></main>;

  const tabs = [['list', 'Partidas'], ['new', 'Crear'], ...(me.role === 'admin' ? [['admin', 'Admin']] : [])];
  return (
    <>
      <main>
        <header className="topbar">
          <GameDie />
          <div><p className="eyebrow">Asociación Ludocuir</p><h1>{{ list: 'Próximas partidas', new: 'Nueva partida', admin: 'Administración' }[tab]}</h1></div>
          <div className="me">{me.nick}<br /><button className="link" onClick={() => supabase.auth.signOut()}>Salir</button></div>
        </header>

        {err && <p className="card notice" role="alert">{err}</p>}
        {tab === 'new' && <NewSession onCreate={create} />}
        {tab === 'admin' && <AdminPanel session={session} />}
        {tab === 'list' && status === 'error' && (
          <div className="card empty"><p>No se pudieron cargar las partidas. Revisa la conexión.</p><button className="btn" onClick={refresh}>Reintentar</button></div>
        )}
        {tab === 'list' && status === 'ok' && (
          <section aria-label="Próximas partidas">
            {!sessions.length && (
              <div className="card empty"><p>Todavía no hay ninguna partida.</p><button className="btn" onClick={() => go('new')}>Crear la primera</button></div>
            )}
            <ul className="sessions">
              {sessions.map((s) => <SessionCard key={s.id} s={s} me={me} onJoin={join} onLeave={leave} onDelete={remove} />)}
            </ul>
          </section>
        )}
      </main>

      <nav className="tabbar" aria-label="Navegación principal">
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}>
            <Icon d={ICONS[k]} /><span>{label}{k === 'list' && sessions.length > 0 && <b className="badge">{sessions.length}</b>}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

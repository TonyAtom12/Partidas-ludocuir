import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

const dayLabel = (d) => new Date(`${d}T00:00`)
  .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');

// Encuestas abiertas en las que este usuario aún no ha marcado ningún día (para el contador del menú)
export const pendingPolls = (polls, meId) =>
  polls.filter((p) => !p.closed && !p.days.some((d) => d.voters.some((v) => v.id === meId))).length;

export function useEncuestas(enabled) {
  const [polls, setPolls] = useState([]);
  const [status, setStatus] = useState('loading');

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('encuestas')
      .select('id, title, description, closed, created_at, creador:perfiles!created_by(nick), dias:encuesta_dias(id, date, votos:encuesta_votos(user_id, perfiles(nick)))')
      .order('created_at', { ascending: false });
    if (error) { console.error('Supabase encuestas:', error); setStatus('error'); return; }
    setPolls(data.map((p) => ({
      id: p.id, title: p.title, description: p.description, closed: p.closed, creatorNick: p.creador?.nick ?? '?',
      days: [...p.dias].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
        id: d.id, date: d.date,
        voters: d.votos.map((v) => ({ id: v.user_id, nick: v.perfiles?.nick ?? '?' })).sort((a, b) => a.nick.localeCompare(b.nick)),
      })),
    })));
    setStatus('ok');
  }, []);

  useEffect(() => {
    if (!enabled) { setPolls([]); setStatus('loading'); return; }
    refresh();
    const ch = supabase.channel('encuestas-cambios');
    ['encuestas', 'encuesta_dias', 'encuesta_votos'].forEach((table) =>
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, refresh));
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [enabled, refresh]);

  return { polls, status, refresh };
}

function NewPoll({ onCreated, onCancel }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [days, setDays] = useState([]);
  const [dayInput, setDayInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const addDay = () => {
    if (!dayInput || days.includes(dayInput) || days.length >= 31) return;
    setDays([...days, dayInput].sort());
    setDayInput('');
  };

  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg('');
    const { error } = await supabase.rpc('crear_encuesta', { p_title: title.trim(), p_desc: desc.trim(), p_dates: days });
    setBusy(false);
    if (error) return setMsg(error.message.includes('solo_admin') ? 'Solo los administradores pueden crear encuestas.' : 'No se pudo crear la encuesta. Inténtalo de nuevo.');
    onCreated();
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2 className="h2">Nueva encuesta</h2>
      <label>Pregunta o título
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="¿Qué día quedamos para la jornada de juegos?" />
      </label>
      <label>Detalles (opcional)
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} rows={2} placeholder="Lugar, hora, qué se va a jugar…" />
      </label>
      <label htmlFor="poll-day">Días entre los que se puede votar</label>
      <div className="adddate">
        <input id="poll-day" type="date" value={dayInput} onChange={(e) => setDayInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDay(); } }} />
        <button type="button" className="btn-ghost" onClick={addDay} disabled={!dayInput || days.includes(dayInput) || days.length >= 31}>Añadir</button>
      </div>
      {days.length > 0 && (
        <ul className="tags" style={{ textAlign: 'left' }}>
          {days.map((d) => (
            <li key={d} className="tag">{dayLabel(d)}
              <button type="button" onClick={() => setDays(days.filter((x) => x !== d))} aria-label={`Quitar ${dayLabel(d)}`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {!days.length && <p className="hint">Añade al menos un día.</p>}
      {msg && <p className="hint" role="alert" style={{ color: 'var(--danger)' }}>{msg}</p>}
      <button className="btn block" style={{ marginTop: 14 }} disabled={!title.trim() || !days.length || busy}>{busy ? '…' : 'Crear encuesta'}</button>
      <p className="cancel"><button type="button" className="link" onClick={onCancel}>Cancelar</button></p>
    </form>
  );
}

function PollCard({ p, me, onToggle, onClose, onDelete }) {
  const most = Math.max(0, ...p.days.map((d) => d.voters.length));
  return (
    <li className="card poll">
      <div className="poll-head"><h3>{p.title}</h3>{p.closed && <span className="tag">Cerrada</span>}</div>
      {p.description && <p className="poll-desc">{p.description}</p>}
      <p className="where">Organiza {p.creatorNick}</p>
      <p className="hint" style={{ textAlign: 'center' }}>
        {p.closed ? 'Encuesta cerrada: ya no se puede votar.' : 'Pulsa los días que te vienen bien. Puedes marcar varios.'}
      </p>
      <ul className="opts">
        {p.days.map((d) => {
          const mine = d.voters.some((v) => v.id === me.id);
          const n = d.voters.length;
          const top = p.closed && n > 0 && n === most;
          return (
            <li key={d.id}>
              <button type="button" className={`opt${mine ? ' on' : ''}${top ? ' top' : ''}`} aria-pressed={mine} disabled={p.closed} onClick={() => onToggle(d, mine)}>
                <span className="opt-main">
                  <span className="opt-day">{dayLabel(d.date)}{top && ' ★'}</span>
                  <span className="opt-n">{n} {n === 1 ? 'voto' : 'votos'}{mine && ' · tú'}</span>
                </span>
                <span className="opt-bar"><span style={{ width: `${most ? (n / most) * 100 : 0}%` }} /></span>
                {n > 0 && <span className="opt-who">{d.voters.map((v) => v.nick).join(', ')}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {me.role === 'admin' && (
        <p className="poll-admin">
          <button className="link" onClick={() => onClose(p)}>{p.closed ? 'Reabrir encuesta' : 'Cerrar encuesta'}</button>
          <button className="link danger" onClick={() => onDelete(p)}>Borrar encuesta</button>
        </p>
      )}
    </li>
  );
}

export function EncuestasView({ me, polls, status, refresh }) {
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');
  const isAdmin = me.role === 'admin';

  const act = async (q, msg) => { setErr(''); const { error } = await q; if (error) setErr(msg); await refresh(); };
  const toggle = (d, mine) => act(
    mine ? supabase.from('encuesta_votos').delete().eq('dia_id', d.id).eq('user_id', me.id) : supabase.from('encuesta_votos').insert({ dia_id: d.id }),
    'No se pudo guardar tu voto. Puede que la encuesta se haya cerrado.');
  const toggleClosed = (p) => act(supabase.from('encuestas').update({ closed: !p.closed }).eq('id', p.id), 'No se pudo cambiar el estado de la encuesta.');
  const remove = (p) => { if (window.confirm(`¿Borrar la encuesta «${p.title}» y todos sus votos?`)) act(supabase.from('encuestas').delete().eq('id', p.id), 'No se pudo borrar la encuesta.'); };

  const sorted = [...polls].sort((a, b) => Number(a.closed) - Number(b.closed)); // abiertas primero, manteniendo el orden por fecha

  return (
    <section className="stack" aria-label="Encuestas">
      {isAdmin && (creating
        ? <NewPoll onCreated={async () => { setCreating(false); await refresh(); }} onCancel={() => setCreating(false)} />
        : <button className="btn block" onClick={() => setCreating(true)}>+ Nueva encuesta</button>)}
      {err && <p className="card notice" role="alert">{err}</p>}
      {status === 'error' && (
        <div className="card empty"><p>No se pudieron cargar las encuestas. Revisa la conexión.</p><button className="btn" onClick={refresh}>Reintentar</button></div>
      )}
      {status === 'ok' && !polls.length && (
        <div className="card empty"><p>No hay encuestas ahora mismo.{isAdmin ? '' : ' Cuando los administradores abran una, saldrá aquí.'}</p></div>
      )}
      <ul className="sessions">
        {sorted.map((p) => <PollCard key={p.id} p={p} me={me} onToggle={toggle} onClose={toggleClosed} onDelete={remove} />)}
      </ul>
    </section>
  );
}

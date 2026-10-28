import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import { apiUrl, STATUSES, supabase, type Status, type Submission } from '../lib/supabase';

const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  reviewing: 'Reviewing',
  quoted: 'Quoted',
  completed: 'Completed',
  rejected: 'No better deal',
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function AdminDashboard() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Submission | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (!error && data) setRows(data as Submission[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Live updates when a customer uploads a new bill.
    const channel = supabase
      .channel('submissions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const s of STATUSES) c[s] = rows.filter((r) => r.status === s).length;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === 'all' || r.status === filter) &&
        (!q || [r.full_name, r.email, r.phone, r.postcode ?? '', r.id].some((v) => v.toLowerCase().includes(q))),
    );
  }, [rows, filter, search]);

  return (
    <>
      <Header
        right={
          <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>
            Log out
          </button>
        }
      />
      <div className="container admin">
        <div className="admin-top">
          <h1>Bill submissions</h1>
          <button className="btn btn-secondary" onClick={load}>↻ Refresh</button>
        </div>

        <div className="stats">
          {(['all', ...STATUSES] as const).map((s) => (
            <button key={s} className={`stat ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
              <span className="stat-num">{counts[s] ?? 0}</span>
              <span className="stat-label">{s === 'all' ? 'All' : STATUS_LABEL[s]}</span>
            </button>
          ))}
        </div>

        <input
          className="search"
          placeholder="Search name, email, phone, postcode or reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading && !rows.length ? (
          <div className="center"><div className="spinner" /></div>
        ) : visible.length === 0 ? (
          <div className="card center muted">No submissions yet.</div>
        ) : (
          <div className="table-wrap card">
            <table>
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r)} className={selected?.id === r.id ? 'selected' : ''}>
                    <td>{fmtDate(r.created_at)}</td>
                    <td>
                      <strong>{r.full_name}</strong>
                      <div className="muted small">#{r.id.slice(0, 8).toUpperCase()}{r.postcode ? ` · ${r.postcode}` : ''}</div>
                    </td>
                    <td>
                      {r.email}
                      <div className="muted small">{r.phone}</div>
                    </td>
                    <td className="cap">{r.bill_type}</td>
                    <td><span className={`badge badge-${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <DetailPanel
          key={selected.id}
          submission={selected}
          onClose={() => setSelected(null)}
          onSaved={(s) => {
            setRows((prev) => prev.map((r) => (r.id === s.id ? s : r)));
            setSelected(s);
          }}
          onDeleted={(id) => {
            setRows((prev) => prev.filter((r) => r.id !== id));
            setSelected(null);
          }}
        />
      )}
    </>
  );
}

function DetailPanel({
  submission,
  onClose,
  onSaved,
  onDeleted,
}: {
  submission: Submission;
  onClose: () => void;
  onSaved: (s: Submission) => void;
  onDeleted: (id: string) => void;
}) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(submission.status);
  const [notes, setNotes] = useState(submission.admin_notes ?? '');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const isPdf = /\.pdf$/i.test(submission.file_path);

  useEffect(() => {
    supabase.storage
      .from('bills')
      .createSignedUrl(submission.file_path, 60 * 60)
      .then(({ data }) => setFileUrl(data?.signedUrl ?? null));
  }, [submission.file_path]);

  const save = async () => {
    setBusy(true);
    setMsg('');
    const statusChanged = status !== submission.status;
    const { data, error } = await supabase
      .from('submissions')
      .update({ status, admin_notes: notes || null, updated_at: new Date().toISOString() })
      .eq('id', submission.id)
      .select()
      .single();
    if (error) {
      setBusy(false);
      return setMsg(`Error: ${error.message}`);
    }
    onSaved(data as Submission);

    if (statusChanged && notify && status !== 'new') {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch(apiUrl('/api/status-update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ id: submission.id }),
      }).catch(() => null);
      const out = r ? await r.json().catch(() => ({})) : {};
      setMsg(r?.ok ? `Saved. Customer email: ${out.email}, SMS: ${out.sms}` : `Saved, but notifying the customer failed${out.error ? `: ${out.error}` : ''}.`);
    } else {
      setMsg('Saved.');
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!confirm(`Delete ${submission.full_name}'s submission and bill? This can't be undone.`)) return;
    setBusy(true);
    await supabase.storage.from('bills').remove([submission.file_path]);
    const { error } = await supabase.from('submissions').delete().eq('id', submission.id);
    setBusy(false);
    if (error) return setMsg(`Error: ${error.message}`);
    onDeleted(submission.id);
  };

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <div>
            <h2>{submission.full_name}</h2>
            <span className="muted small">#{submission.id.slice(0, 8).toUpperCase()} · {fmtDate(submission.created_at)}</span>
          </div>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <dl className="details">
          <dt>Email</dt><dd><a href={`mailto:${submission.email}`}>{submission.email}</a></dd>
          <dt>Mobile</dt><dd><a href={`tel:${submission.phone}`}>{submission.phone}</a></dd>
          <dt>Postcode</dt><dd>{submission.postcode || '—'}</dd>
          <dt>Bill type</dt><dd className="cap">{submission.bill_type}</dd>
          <dt>Confirmation</dt><dd>{submission.notified_at ? `Sent ${fmtDate(submission.notified_at)}` : 'Not sent'}</dd>
          {submission.message && (<><dt>Message</dt><dd>{submission.message}</dd></>)}
        </dl>

        <div className="bill-preview">
          {!fileUrl ? (
            <div className="spinner" />
          ) : isPdf ? (
            <iframe src={fileUrl} title="Bill PDF" />
          ) : (
            <img src={fileUrl} alt="Uploaded bill" />
          )}
        </div>
        {fileUrl && (
          <a className="btn btn-secondary btn-block" href={fileUrl} target="_blank" rel="noreferrer">
            Open / download bill ({submission.file_name ?? 'file'})
          </a>
        )}

        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <span>Email + SMS the customer when the status changes</span>
        </label>
        <label>
          Internal notes
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Current retailer, rates, savings found…" />
        </label>

        {msg && <p className={msg.startsWith('Error') ? 'error' : 'success'}>{msg}</p>}

        <div className="panel-actions">
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="btn btn-danger" onClick={remove} disabled={busy}>Delete</button>
        </div>
      </aside>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { EmptyState, MetricCard, PageHeader, Panel, StatusBadge, TableShell, Td, Th } from '../components/PmsUi';

const SupervisorPanel = () => {
  const [data, setData] = useState({ cleaningTasks: [], transfers: [] });
  const [filter, setFilter] = useState('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { const res = await api.get('/management/supervisor'); setData(res.data || { cleaningTasks: [], transfers: [] }); }
    catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const tasks = Array.isArray(data.cleaningTasks) ? data.cleaningTasks : [];
  const transfers = Array.isArray(data.transfers) ? data.transfers : [];
  const critical = useMemo(() => tasks.filter((t) => t.priority === 'high' && t.status !== 'completed'), [tasks]);
  const visible = useMemo(() => tasks.filter((t) => filter === 'all' || (filter === 'open' && t.status !== 'completed') || t.status === filter), [tasks, filter]);

  return <div className="space-y-6">
    <PageHeader title="Supervisor" description="One control surface for housekeeping readiness, priority rooms and active free shuttles." actions={<button onClick={load} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">Refresh operations</button>} />
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <MetricCard label="Cleaning open" value={tasks.filter((t)=>t.status !== 'completed').length} tone="blue" />
      <MetricCard label="Priority rooms" value={critical.length} tone={critical.length ? 'amber' : 'green'} />
      <MetricCard label="Unassigned cleaning" value={tasks.filter((t)=>!t.assigned_to && t.status !== 'completed').length} tone="amber" />
      <MetricCard label="Active free shuttles" value={transfers.length} tone="blue" />
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <Panel title="Housekeeping control" description="Live task state from the cleaning workflow." action={<select value={filter} onChange={(e)=>setFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="open">Open</option><option value="all">All</option><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select>}>
        {loading ? <div className="p-8 text-sm text-slate-500">Loading supervisor data…</div> : visible.length === 0 ? <EmptyState title="No housekeeping tasks" description="Tasks will appear here as soon as the cleaning engine creates them." /> : <TableShell><thead><tr><Th>Room</Th><Th>Stay</Th><Th>Priority</Th><Th>Assigned</Th><Th>Status</Th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map((t)=><tr key={t.id}><Td><div className="font-semibold text-slate-900">{t.internal_name || `Room ${t.room_id}`}</div><div className="text-xs text-slate-500">{t.room_type || '—'}</div></Td><Td><div className="text-xs">{t.check_in_date || '—'} → {t.check_out_date || '—'}</div>{t.special_requests && <div className="mt-1 max-w-56 truncate text-xs text-amber-700">{t.special_requests}</div>}</Td><Td><StatusBadge status={t.priority || 'normal'} /></Td><Td>{t.assigned_to || <span className="text-amber-700">Unassigned</span>}</Td><Td><StatusBadge status={t.status}/></Td></tr>)}</tbody></TableShell>}
      </Panel>

      <Panel title="Free shuttle watch" description="Open routes that may affect guest arrival operations.">
        <div className="divide-y divide-slate-100">{transfers.length === 0 ? <EmptyState title="No active free shuttles" /> : transfers.slice(0,10).map((t)=><div key={t.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-slate-900">{t.guest_name}</div><div className="mt-1 text-xs text-slate-500">{t.pickup_location} → {t.destination}</div><div className="mt-1 text-xs text-slate-500">{formatDateTime(t.scheduled_at)} · {t.driver || 'No driver'}</div></div><StatusBadge status={t.status}/></div></div>)}</div>
      </Panel>
    </div>

    {critical.length > 0 && <Panel title="Priority attention" description="High-priority rooms should be coordinated before early guest arrival."><div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">{critical.map((t)=><div key={t.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="font-semibold text-amber-950">{t.internal_name || `Room ${t.room_id}`}</div><div className="mt-1 text-xs text-amber-800">{t.assigned_to ? `Cleaner: ${t.assigned_to}` : 'Needs cleaner assignment'}</div></div>)}</div></Panel>}
  </div>;
};

const formatDateTime = (v) => v ? new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(v)) : '—';
export default SupervisorPanel;

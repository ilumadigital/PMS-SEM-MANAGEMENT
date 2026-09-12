import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { EmptyState, MetricCard, PageHeader, Panel, StatusBadge, TableShell, Td, Th } from '../components/PmsUi';

const dateKey = (value) => String(value || '').slice(0, 10);
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const prettyDate = (value) => {
  const key = dateKey(value);
  if (!key) return '—';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(`${key}T12:00:00`));
};
const elapsed = (value) => {
  if (!value) return '';
  const started = new Date(value).getTime();
  if (Number.isNaN(started)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - started) / 60000));
  if (minutes < 1) return 'just started';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

const SupervisorPanel = () => {
  const [data, setData] = useState({ cleaningTasks: [], transfers: [] });
  const [filter, setFilter] = useState('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/management/supervisor');
      setData(response.data || { cleaningTasks: [], transfers: [] });
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const tasks = Array.isArray(data.cleaningTasks) ? data.cleaningTasks : [];
  const transfers = Array.isArray(data.transfers) ? data.transfers : [];
  const today = todayKey();

  const todayTasks = useMemo(() => tasks.filter((task) => dateKey(task.task_date) === today), [tasks, today]);
  const inProgress = useMemo(() => todayTasks.filter((task) => task.status === 'in_progress'), [todayTasks]);
  const assigned = useMemo(() => todayTasks.filter((task) => task.status === 'assigned'), [todayTasks]);
  const completed = useMemo(() => todayTasks.filter((task) => task.status === 'completed'), [todayTasks]);

  const visible = useMemo(() => tasks.filter((task) => {
    if (filter === 'all') return true;
    if (filter === 'today') return dateKey(task.task_date) === today;
    if (filter === 'open') return task.status !== 'completed' && dateKey(task.task_date) >= today;
    return task.status === filter;
  }), [tasks, filter, today]);

  return <div className="space-y-6">
    <PageHeader
      title="Operations Control"
      description="Live housekeeping and Free Shuttle control for Supervisors and Administrators. Cleaner progress appears here automatically as soon as Start cleaning is pressed."
      actions={<div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Live operations
        </span>
        <button onClick={load} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">Refresh</button>
      </div>}
    />

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
      <MetricCard label="Today's rooms" value={todayTasks.length} />
      <MetricCard label="In progress now" value={inProgress.length} tone={inProgress.length ? 'blue' : 'default'} helper={inProgress.length ? 'Cleaning happening now' : 'No active cleaning'} />
      <MetricCard label="Waiting to start" value={assigned.length} tone={assigned.length ? 'amber' : 'default'} />
      <MetricCard label="Completed today" value={completed.length} tone="green" />
      <MetricCard label="Active free shuttles" value={transfers.length} tone="blue" />
    </div>

    <Panel
      title="Cleaning live now"
      description="Rooms currently being cleaned. These cards update automatically from the Cleaner workflow."
      action={<span className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-black text-white">{inProgress.length} active</span>}
    >
      {loading ? <div className="p-8 text-sm text-slate-500">Loading live cleaning…</div> : inProgress.length ? (
        <div className="grid gap-4 p-5 md:grid-cols-2 2xl:grid-cols-3">
          {inProgress.map((task) => <article key={task.id} className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white p-5 shadow-[0_12px_36px_rgba(37,99,235,0.10)]">
            <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-full bg-blue-100/50" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-blue-600">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                    Cleaning in progress
                  </div>
                  <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">Room {task.room_number || task.room_id}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-600">{task.property_name || `Property ${task.property_id}`}</div>
                </div>
                <StatusBadge status="in_progress" />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-blue-100 bg-white/80 p-3">
                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Cleaner</div>
                  <div className="mt-1 text-sm font-black text-slate-900">{task.cleaner_name || 'Cleaner'}</div>
                </div>
                <div className="rounded-xl border border-blue-100 bg-white/80 p-3">
                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Running</div>
                  <div className="mt-1 text-sm font-black text-blue-700">{elapsed(task.started_at) || 'In progress'}</div>
                </div>
              </div>

              {task.notes && <div className="mt-3 rounded-xl bg-slate-950 px-3 py-2.5 text-xs leading-5 text-white/80">{task.notes}</div>}
            </div>
          </article>)}
        </div>
      ) : <EmptyState title="No rooms are being cleaned right now" description="As soon as a Cleaner presses Start cleaning, the room will appear here automatically." />}
    </Panel>

    <div className="grid gap-5 2xl:grid-cols-[1.4fr_0.6fr]">
      <Panel
        title="Housekeeping schedule"
        description="Full assignment status across cleaners, rooms and dates."
        action={<select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          <option value="open">Open & upcoming</option>
          <option value="today">Today</option>
          <option value="all">All</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
        </select>}
      >
        {loading ? <div className="p-8 text-sm text-slate-500">Loading housekeeping…</div> : visible.length ? (
          <TableShell>
            <thead><tr><Th>Date</Th><Th>Property / room</Th><Th>Cleaner</Th><Th>Status</Th><Th>Timing</Th><Th>Notes</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((task) => {
                const live = task.status === 'in_progress';
                return <tr key={task.id} className={`align-top transition ${live ? 'bg-blue-50/60' : 'hover:bg-slate-50/70'}`}>
                  <Td>
                    <div className="font-bold text-slate-950">{prettyDate(task.task_date)}</div>
                    {dateKey(task.task_date) === today && <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-blue-600">Today</div>}
                  </Td>
                  <Td>
                    <div className="font-black text-slate-950">Room {task.room_number || task.room_id}</div>
                    <div className="mt-1 text-xs text-slate-500">{task.property_name || `Property ${task.property_id}`}</div>
                  </Td>
                  <Td><div className="font-semibold text-slate-900">{task.cleaner_name || 'Cleaner'}</div></Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      {live && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />}
                      <StatusBadge status={task.status} />
                    </div>
                  </Td>
                  <Td>
                    {task.status === 'in_progress' ? <div><div className="font-black text-blue-700">{elapsed(task.started_at) || 'In progress'}</div><div className="mt-1 text-[10px] text-slate-400">Started {formatClock(task.started_at)}</div></div>
                      : task.status === 'completed' ? <div><div className="font-bold text-emerald-700">Completed</div><div className="mt-1 text-[10px] text-slate-400">{formatClock(task.completed_at)}</div></div>
                        : <span className="text-xs text-slate-400">Not started</span>}
                  </Td>
                  <Td>{task.notes ? <div className="max-w-64 whitespace-pre-wrap text-xs leading-5 text-slate-600">{task.notes}</div> : <span className="text-slate-400">—</span>}</Td>
                </tr>;
              })}
            </tbody>
          </TableShell>
        ) : <EmptyState title="No housekeeping tasks match this view" />}
      </Panel>

      <Panel title="Free Shuttle watch" description="Open airport pickups that may affect guest arrival operations.">
        <div className="divide-y divide-slate-100">
          {transfers.length === 0 ? <EmptyState title="No active free shuttles" /> : transfers.slice(0, 10).map((shuttle) => <div key={shuttle.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-black text-slate-950">{shuttle.guest_name}</div>
                <div className="mt-1 truncate text-xs text-slate-500">ATH Airport → {shuttle.destination}</div>
                <div className="mt-2 text-xs font-semibold text-slate-700">{formatDateTime(shuttle.scheduled_at)}</div>
                <div className="mt-1 text-xs text-slate-500">{shuttle.driver || 'No driver assigned'}</div>
              </div>
              <StatusBadge status={shuttle.status} />
            </div>
          </div>)}
        </div>
      </Panel>
    </div>
  </div>;
};

const formatClock = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(d);
};

const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '—';

export default SupervisorPanel;

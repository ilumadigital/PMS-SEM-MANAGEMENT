import React, { useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import { EmptyState, PageHeader, Panel, StatusBadge, TableShell, Td, Th } from '../components/PmsUi';

const dateKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dateFromKey = (key) => new Date(`${key}T12:00:00`);
const todayKey = () => dateKey(new Date());
const firstOfMonth = (key = todayKey()) => {
  const d = dateFromKey(key);
  return dateKey(new Date(d.getFullYear(), d.getMonth(), 1, 12));
};
const addMonths = (key, amount) => {
  const d = dateFromKey(key);
  return dateKey(new Date(d.getFullYear(), d.getMonth() + amount, 1, 12));
};
const addDays = (key, amount) => {
  const d = dateFromKey(key);
  d.setDate(d.getDate() + amount);
  return dateKey(d);
};
const monthDays = (monthKey) => {
  const first = dateFromKey(firstOfMonth(monthKey));
  const mondayIndex = (first.getDay() + 6) % 7;
  const start = addDays(dateKey(first), -mondayIndex);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
};
const monthLabel = (key) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(dateFromKey(key));
const prettyDate = (key) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).format(dateFromKey(key));

const assignmentDate = (row) => String(row.task_date || '').slice(0, 10);

const statusTone = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (normalized === 'in_progress') return 'border-blue-200 bg-blue-50 text-blue-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
};

const CleanerSchedulePage = () => {
  const { updateHousekeeping } = useContext(CloudbedsDataContext);
  const [view, setView] = useState('list');
  const [calendarMonth, setCalendarMonth] = useState(firstOfMonth());
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/management/housekeeping-assignments');
      setRows(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || 'Could not load your cleaning schedule.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const patch = async (row, payload) => {
    setSaving(String(row.id));
    setError('');
    try {
      await api.patch(`/management/housekeeping-assignments/${row.id}`, payload);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message);
    } finally {
      setSaving('');
    }
  };

  const markClean = async (row) => {
    setSaving(String(row.id));
    setError('');
    try {
      await updateHousekeeping(row.room_id, {
        propertyId: row.property_id,
        roomNumber: row.room_number,
        roomCondition: 'clean',
      });
      await api.patch(`/management/housekeeping-assignments/${row.id}`, { status: 'completed' });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.response?.data?.error || requestError.message);
    } finally {
      setSaving('');
    }
  };

  const filteredRows = useMemo(
    () => statusFilter === 'all' ? rows : rows.filter((row) => row.status === statusFilter),
    [rows, statusFilter]
  );

  const listRows = useMemo(
    () => filteredRows.slice().sort((a, b) => {
      const byDate = assignmentDate(a).localeCompare(assignmentDate(b));
      if (byDate) return byDate;
      return String(a.property_name || '').localeCompare(String(b.property_name || ''))
        || String(a.room_number || a.room_id).localeCompare(String(b.room_number || b.room_id), undefined, { numeric: true });
    }),
    [filteredRows]
  );

  const days = useMemo(() => monthDays(calendarMonth), [calendarMonth]);
  const calendarMonthNumber = dateFromKey(calendarMonth).getMonth();
  const today = todayKey();

  const counts = useMemo(() => ({
    total: rows.length,
    today: rows.filter((row) => assignmentDate(row) === today).length,
    inProgress: rows.filter((row) => row.status === 'in_progress').length,
    completed: rows.filter((row) => row.status === 'completed').length,
  }), [rows, today]);

  return <div className="space-y-6">
    <PageHeader
      title="My Cleaning Schedule"
      description="Only rooms assigned to you are shown. Use List for task details or Calendar for your monthly program. Marking a room Clean updates SEM PMS and Cloudbeds housekeeping."
      actions={<div className="flex flex-wrap items-center gap-2">
        <ViewToggle view={view} setView={setView} />
        <button onClick={load} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">Refresh</button>
      </div>}
    />

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <Metric label="Assigned" value={counts.total} />
      <Metric label="Today" value={counts.today} tone="blue" />
      <Metric label="In progress" value={counts.inProgress} tone="amber" />
      <Metric label="Completed" value={counts.completed} tone="green" />
    </div>

    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading your cleaning schedule…</div> : !rows.length ? (
      <EmptyState title="No rooms assigned" description="Your Cleaner Admin has not assigned any rooms to you." />
    ) : view === 'list' ? (
      <Panel
        title="My cleaning list"
        description="Your assigned rooms, current task status and cleaning actions."
        action={<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          <option value="all">All statuses</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
        </select>}
      >
        {listRows.length ? <TableShell>
          <thead><tr><Th>Date</Th><Th>Property</Th><Th>Room</Th><Th>Notes</Th><Th>Current status</Th><Th>Cleaning action</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {listRows.map((row) => {
              const actionable = assignmentDate(row) === today;
              return <tr key={row.id} className="align-top hover:bg-slate-50/70">
                <Td>
                  <div className="font-black text-slate-950">{prettyDate(assignmentDate(row))}</div>
                  {actionable && <div className="mt-1 text-[11px] font-black uppercase tracking-wide text-blue-600">Today</div>}
                </Td>
                <Td><div className="font-semibold text-slate-900">{row.property_name || `Property ${row.property_id}`}</div></Td>
                <Td>
                  <div className="text-lg font-black text-slate-950">Room {row.room_number || row.room_id}</div>
                  <div className="mt-1 text-xs text-slate-500">{row.room_type || 'Room'}</div>
                </Td>
                <Td>{row.notes ? <div className="max-w-72 whitespace-pre-wrap text-xs leading-5 text-slate-600">{row.notes}</div> : <span className="text-slate-400">—</span>}</Td>
                <Td><StatusBadge status={row.status} /></Td>
                <Td>
                  {actionable
                    ? <CleaningActions row={row} saving={saving === String(row.id)} onStart={() => patch(row, { status: 'in_progress' })} onClean={() => markClean(row)} />
                    : <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">Scheduled for {prettyDate(assignmentDate(row))}</div>}
                </Td>
              </tr>;
            })}
          </tbody>
        </TableShell> : <EmptyState title="No tasks match this status" />}
      </Panel>
    ) : (
      <Panel
        title="My cleaning calendar"
        description="Monthly calendar of your assigned rooms. Cleaning actions are enabled for today's tasks."
        action={<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          <option value="all">All statuses</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
        </select>}
      >
        <div className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-black text-slate-950">{monthLabel(calendarMonth)}</div>
            <div className="flex gap-2">
              <button onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">‹ Month</button>
              <button onClick={() => setCalendarMonth(firstOfMonth())} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">Today</button>
              <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">Month ›</button>
            </div>
          </div>

          <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="bg-slate-50 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-slate-500">{day}</div>)}
            {days.map((day) => {
              const items = filteredRows.filter((row) => assignmentDate(row) === day);
              const isToday = day === today;
              const muted = dateFromKey(day).getMonth() !== calendarMonthNumber;
              return <div key={day} className={`min-h-40 bg-white p-2 sm:min-h-52 ${muted ? 'bg-slate-50/80' : ''}`}>
                <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${isToday ? 'bg-blue-600 text-white' : muted ? 'text-slate-300' : 'text-slate-700'}`}>{dateFromKey(day).getDate()}</div>
                <div className="space-y-2">
                  {items.map((row) => <article key={row.id} className={`rounded-lg border p-2 text-[10px] ${statusTone(row.status)}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-black">Room {row.room_number || row.room_id}</div>
                        <div className="mt-1 truncate font-semibold opacity-80">{row.property_name || `Property ${row.property_id}`}</div>
                      </div>
                      <StatusBadge status={row.status} />
                    </div>
                    {row.notes && <div className="mt-2 line-clamp-2 opacity-75">{row.notes}</div>}
                    {isToday && <div className="mt-2"><CleaningActions compact row={row} saving={saving === String(row.id)} onStart={() => patch(row, { status: 'in_progress' })} onClean={() => markClean(row)} /></div>}
                  </article>)}
                </div>
              </div>;
            })}
          </div>
        </div>
      </Panel>
    )}
  </div>;
};

const ViewToggle = ({ view, setView }) => <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
  <button onClick={() => setView('list')} className={`rounded-md px-3 py-1.5 text-xs font-black transition ${view === 'list' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>List</button>
  <button onClick={() => setView('calendar')} className={`rounded-md px-3 py-1.5 text-xs font-black transition ${view === 'calendar' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Calendar</button>
</div>;

const CleaningActions = ({ row, onStart, onClean, saving, compact = false }) => {
  const status = String(row.status || '').toLowerCase();
  if (status === 'completed') return <div className="text-xs font-bold text-emerald-700">Room cleaned ✓</div>;

  if (compact) {
    return <div className="grid gap-1">
      {status === 'assigned' && <button disabled={saving} onClick={onStart} className="rounded-md bg-blue-600 px-2 py-1.5 text-[10px] font-black text-white disabled:opacity-50">Start cleaning</button>}
      <button disabled={saving} onClick={onClean} className="rounded-md bg-emerald-600 px-2 py-1.5 text-[10px] font-black text-white disabled:opacity-50">{saving ? 'Saving…' : 'Mark Clean'}</button>
    </div>;
  }

  return <div className="min-w-44 space-y-2">
    <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Update cleaning status</div>
    {status === 'assigned' && <button disabled={saving} onClick={onStart} className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50">{saving ? 'Updating…' : 'Start cleaning → In progress'}</button>}
    <button disabled={saving} onClick={onClean} className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Saving…' : 'Mark room Clean'}</button>
  </div>;
};

const Metric = ({ label, value, tone = 'default' }) => {
  const classes = {
    default: 'border-slate-200 bg-white',
    blue: 'border-blue-100 bg-blue-50',
    amber: 'border-amber-100 bg-amber-50',
    green: 'border-emerald-100 bg-emerald-50',
  };
  return <div className={`rounded-2xl border p-4 ${classes[tone] || classes.default}`}>
    <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</div>
    <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
  </div>;
};

export default CleanerSchedulePage;

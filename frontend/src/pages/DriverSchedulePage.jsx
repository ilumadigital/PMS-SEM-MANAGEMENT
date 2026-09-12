import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { EmptyState, PageHeader, Panel, StatusBadge, TableShell, Td, Th } from '../components/PmsUi';

const ATH_AIRPORT_LABEL = 'ATH Airport';
const ATH_AIRPORT_MAP_URL = 'https://maps.app.goo.gl/psJeMC1mkSGvzhML8';

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
const scheduledDate = (value) => String(value || '').slice(0, 10);
const scheduledTime = (row) => row.approximate_arrival_time_airport || String(row.scheduled_at || '').slice(11, 16) || '—';
const mapsPropertySearch = (propertyName) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(propertyName || '')}`;

const statusTone = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (normalized === 'on_the_way') return 'border-violet-200 bg-violet-50 text-violet-800';
  if (normalized === 'scheduled') return 'border-blue-200 bg-blue-50 text-blue-800';
  if (normalized === 'cancelled') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const DriverSchedulePage = () => {
  const [view, setView] = useState('list');
  const [calendarMonth, setCalendarMonth] = useState(firstOfMonth());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/management/transfers');
      setRows(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const update = async (row, status) => {
    setSaving(String(row.id));
    setError('');
    try {
      await api.patch(`/management/transfers/${row.id}`, { status });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message);
    } finally {
      setSaving('');
    }
  };

  const upcoming = useMemo(
    () => rows.slice().sort((a, b) => String(a.scheduled_at || '').localeCompare(String(b.scheduled_at || ''))),
    [rows]
  );
  const days = useMemo(() => monthDays(calendarMonth), [calendarMonth]);
  const calendarMonthNumber = dateFromKey(calendarMonth).getMonth();

  return <div className="space-y-6">
    <PageHeader
      title="My Free Shuttles"
      description="Your assigned shuttle schedule. Pickup is always ATH Airport. Use List for trip details or Calendar for your monthly program."
      actions={<div className="flex flex-wrap items-center gap-2">
        <ViewToggle view={view} setView={setView} />
        <button onClick={load} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">Refresh</button>
      </div>}
    />

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading your free shuttles…</div> : !rows.length ? (
      <EmptyState title="No free shuttles assigned" description="Your Drivers Admin has not assigned a shuttle to you." />
    ) : view === 'list' ? (
      <Panel title="My shuttle list" description="Each trip includes the fixed ATH Airport pickup, property drop-off and clear trip status actions.">
        <TableShell>
          <thead><tr><Th>Date / time</Th><Th>Guest</Th><Th>Route</Th><Th>Flight / baggage</Th><Th>Current status</Th><Th>Update trip</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {upcoming.map((row) => <tr key={row.id} className="align-top hover:bg-slate-50/70">
              <Td>
                <div className="font-black text-slate-950">{formatDate(row.scheduled_at)}</div>
                <div className="mt-1 text-lg font-black text-blue-700">{scheduledTime(row)}</div>
                <div className="mt-1 text-[11px] text-slate-500">Approx. arrival at ATH</div>
              </Td>
              <Td>
                <div className="font-bold text-slate-950">{row.guest_name}</div>
                <div className="mt-1 text-xs text-slate-500">{row.passengers || 1} guest(s) · Reservation #{row.reservation_id || '—'}</div>
              </Td>
              <Td>
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Pickup</div>
                <div className="mt-1 font-bold text-slate-900">{ATH_AIRPORT_LABEL}</div>
                <div className="mt-3 text-xs font-black uppercase tracking-wide text-slate-400">Drop-off</div>
                <div className="mt-1 font-bold text-slate-900">{row.destination || 'Property'}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={ATH_AIRPORT_MAP_URL} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">ATH pickup map ↗</a>
                  <a href={mapsPropertySearch(row.destination)} target="_blank" rel="noreferrer" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white">Search property in Google Maps ↗</a>
                </div>
              </Td>
              <Td>
                <div className="font-semibold text-slate-800">{row.flight_info || 'No flight info'}</div>
                <div className="mt-2 text-xs text-slate-500">{row.cabin_luggages || 0} cabin · {row.luggage || 0} luggage</div>
                {row.vehicle && <div className="mt-2 text-xs font-semibold text-slate-700">Vehicle: {row.vehicle}</div>}
              </Td>
              <Td><StatusBadge status={row.status} /></Td>
              <Td><DriverStatusActions row={row} saving={saving === String(row.id)} onUpdate={update} /></Td>
            </tr>)}
          </tbody>
        </TableShell>
      </Panel>
    ) : (
      <Panel title="My shuttle calendar" description="Monthly view of the trips assigned to you.">
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
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <div key={day} className="bg-slate-50 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-slate-500">{day}</div>)}
            {days.map((day) => {
              const items = upcoming.filter((row) => scheduledDate(row.scheduled_at) === day);
              const isToday = day === todayKey();
              const muted = dateFromKey(day).getMonth() !== calendarMonthNumber;
              return <div key={day} className={`min-h-40 bg-white p-2 sm:min-h-52 ${muted ? 'bg-slate-50/80' : ''}`}>
                <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${isToday ? 'bg-blue-600 text-white' : muted ? 'text-slate-300' : 'text-slate-700'}`}>{dateFromKey(day).getDate()}</div>
                <div className="space-y-2">
                  {items.map((row) => <article key={row.id} className={`rounded-lg border p-2 text-[10px] ${statusTone(row.status)}`}>
                    <div className="flex items-center justify-between gap-2"><span className="text-sm font-black">{scheduledTime(row)}</span><StatusBadge status={row.status} /></div>
                    <div className="mt-2 truncate text-xs font-black">{row.guest_name}</div>
                    <div className="mt-1 truncate opacity-80">ATH → {row.destination || 'Property'}</div>
                    <div className="mt-2 flex gap-1">
                      <a href={ATH_AIRPORT_MAP_URL} target="_blank" rel="noreferrer" className="rounded-md border border-current/20 bg-white/70 px-2 py-1 font-black">Pickup</a>
                      <a href={mapsPropertySearch(row.destination)} target="_blank" rel="noreferrer" className="rounded-md border border-current/20 bg-white/70 px-2 py-1 font-black">Property map</a>
                    </div>
                    <div className="mt-2"><DriverStatusActions compact row={row} saving={saving === String(row.id)} onUpdate={update} /></div>
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

const DriverStatusActions = ({ row, onUpdate, saving, compact = false }) => {
  const status = String(row.status || '').toLowerCase();
  if (status === 'completed') return <div className="text-xs font-bold text-emerald-700">Trip completed ✓</div>;
  if (status === 'cancelled') return <div className="text-xs font-bold text-rose-700">Trip cancelled</div>;

  if (compact) {
    return <div className="grid gap-1">
      {status === 'scheduled' && <button disabled={saving} onClick={() => onUpdate(row, 'on_the_way')} className="rounded-md bg-violet-600 px-2 py-1.5 text-[10px] font-black text-white disabled:opacity-50">Start trip</button>}
      {status === 'on_the_way' && <button disabled={saving} onClick={() => onUpdate(row, 'completed')} className="rounded-md bg-emerald-600 px-2 py-1.5 text-[10px] font-black text-white disabled:opacity-50">Complete</button>}
    </div>;
  }

  return <div className="min-w-40 space-y-2">
    <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Change trip status</div>
    {status === 'scheduled' && <button disabled={saving} onClick={() => onUpdate(row, 'on_the_way')} className="w-full rounded-lg bg-violet-600 px-3 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">{saving ? 'Updating…' : 'Start trip → On the way'}</button>}
    {status === 'on_the_way' && <button disabled={saving} onClick={() => onUpdate(row, 'completed')} className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Updating…' : 'Mark trip completed'}</button>}
    <button disabled={saving} onClick={() => onUpdate(row, 'cancelled')} className="w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50">Cancel trip</button>
  </div>;
};

const formatDate = (value) => {
  if (!value) return '—';
  const key = scheduledDate(value);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).format(dateFromKey(key));
};

export default DriverSchedulePage;

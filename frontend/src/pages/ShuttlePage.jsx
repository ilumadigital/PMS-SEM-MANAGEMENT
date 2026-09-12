import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import api from '../services/api';
import { EmptyState, MetricCard, PageHeader, Panel, StatusBadge, TableShell, Td, Th } from '../components/PmsUi';

const editRoles = ['admin', 'manager', 'management', 'reception', 'driversadmin', 'dispatcher'];
const ATH_AIRPORT_LABEL = 'ATH Airport';
const ATH_AIRPORT_MAP_URL = 'https://maps.app.goo.gl/psJeMC1mkSGvzhML8';
const initialForm = {
  reservationId: '',
  approximateArrivalTimeAirport: '',
  cabinLuggages: 0,
  luggages: 0,
  passengers: 1,
  flightInfo: '',
  driver: '',
  driverUserId: '',
  vehicle: '',
  notes: '',
};

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
const shortDate = (key) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(dateFromKey(key));
const scheduledDate = (value) => String(value || '').slice(0, 10);
const scheduledTime = (row) => row.approximate_arrival_time_airport || String(row.scheduled_at || '').slice(11, 16) || '—';

const statusTone = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (normalized === 'on_the_way') return 'border-violet-200 bg-violet-50 text-violet-800';
  if (normalized === 'scheduled') return 'border-blue-200 bg-blue-50 text-blue-800';
  if (normalized === 'cancelled') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
};

const ShuttlePage = () => {
  const { user } = useContext(AuthContext);
  const { reservations, properties } = useContext(CloudbedsDataContext);
  const role = String(user?.role || '').toLowerCase();
  const canEdit = editRoles.includes(role);

  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('list');
  const [calendarMonth, setCalendarMonth] = useState(firstOfMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [reservationSearch, setReservationSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [updatingId, setUpdatingId] = useState('');

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
  useEffect(() => {
    if (!canEdit) return;
    api.get('/management/staff', { params: { role: 'driver' } })
      .then(({ data }) => setDrivers(Array.isArray(data) ? data : []))
      .catch(() => setDrivers([]));
  }, [canEdit]);

  const activeReservations = useMemo(
    () => reservations
      .filter((reservation) => !['cancelled', 'checked_out'].includes(String(reservation.status || '')))
      .sort((a, b) => String(a.arrivalDate || '').localeCompare(String(b.arrivalDate || ''))),
    [reservations]
  );

  const usedReservationIds = useMemo(
    () => new Set(
      rows
        .filter((row) => row.free_shuttle !== 0 && row.status !== 'cancelled')
        .map((row) => String(row.reservation_id || ''))
    ),
    [rows]
  );

  const selected = activeReservations.find((reservation) => String(reservation.id) === String(form.reservationId)) || null;
  const eligibleReservations = useMemo(
    () => activeReservations.filter((reservation) =>
      !usedReservationIds.has(String(reservation.id)) || String(reservation.id) === String(form.reservationId)
    ),
    [activeReservations, usedReservationIds, form.reservationId]
  );

  const reservationMatches = useMemo(() => {
    const term = reservationSearch.trim().toLowerCase();
    if (!term) return [];
    return eligibleReservations.filter((reservation) => {
      const property = properties.find((item) => String(item.id) === String(reservation.propertyId));
      return [
        reservation.guestName,
        reservation.id,
        reservation.guestPhone,
        reservation.guestEmail,
        reservation.roomNumber,
        property?.name,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
    }).slice(0, 10);
  }, [eligibleReservations, reservationSearch, properties]);

  const filtered = useMemo(
    () => filter === 'all' ? rows : rows.filter((row) => row.status === filter),
    [rows, filter]
  );

  const counts = useMemo(() => ({
    total: rows.length,
    unassigned: rows.filter((row) => row.status === 'unassigned').length,
    active: rows.filter((row) => ['scheduled', 'on_the_way'].includes(row.status)).length,
    completed: rows.filter((row) => row.status === 'completed').length,
  }), [rows]);

  const selectReservation = (reservation) => {
    setForm((current) => ({
      ...current,
      reservationId: String(reservation.id),
      passengers: Number(reservation.guestCount || current.passengers || 1),
    }));
    setReservationSearch('');
  };

  const createTransfer = async (event) => {
    event.preventDefault();
    if (!selected) {
      setError('Search and select a Cloudbeds reservation first.');
      return;
    }
    if (!form.approximateArrivalTimeAirport) {
      setError('Approximate arrival time in Airport is required.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    const property = properties.find((item) => String(item.id) === String(selected.propertyId));
    const scheduledAt = `${selected.arrivalDate}T${form.approximateArrivalTimeAirport}:00`;

    try {
      const response = await api.post('/management/transfers', {
        reservationId: selected.id,
        propertyId: selected.propertyId,
        guestName: selected.guestName,
        guestPhone: selected.guestPhone || '',
        guestEmail: selected.guestEmail || '',
        scheduledAt,
        approximateArrivalTimeAirport: form.approximateArrivalTimeAirport,
        cabinLuggages: Number(form.cabinLuggages || 0),
        luggages: Number(form.luggages || 0),
        passengers: Number(form.passengers || 1),
        flightInfo: form.flightInfo,
        pickupLocation: ATH_AIRPORT_LABEL,
        destination: property?.name || selected.property?.name || 'Property',
        driver: form.driver,
        driverUserId: form.driverUserId || null,
        vehicle: form.vehicle,
        notes: form.notes,
      });
      const notification = response.data?.customerNotification;
      setNotice(
        notification?.sent
          ? 'Free shuttle saved and confirmation emailed to the guest.'
          : 'Free shuttle saved. Guest notification email was not sent; check the guest email / portal setup.'
      );
      setForm(initialForm);
      setReservationSearch('');
      setShowForm(false);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const update = async (id, patch) => {
    setUpdatingId(String(id));
    setError('');
    try {
      const { data } = await api.patch(`/management/transfers/${id}`, patch);
      setRows((current) => current.map((row) => String(row.id) === String(id) ? data : row));
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message);
    } finally {
      setUpdatingId('');
    }
  };

  const days = useMemo(() => monthDays(calendarMonth), [calendarMonth]);
  const calendarMonthNumber = dateFromKey(calendarMonth).getMonth();

  return <div className="space-y-6">
    <PageHeader
      title="Free Shuttle"
      description="One free ATH Airport pickup per reservation. Drivers Admin can manage the schedule in list or calendar view and assign each shuttle to a Driver."
      actions={<div className="flex flex-wrap gap-2">
        <button onClick={load} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh</button>
        {canEdit && <button onClick={() => setShowForm((value) => !value)} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">{showForm ? 'Close form' : 'Add free shuttle'}</button>}
      </div>}
    />

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
    {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <MetricCard label="Free shuttles" value={counts.total} />
      <MetricCard label="Unassigned" value={counts.unassigned} tone={counts.unassigned ? 'amber' : 'green'} />
      <MetricCard label="Active" value={counts.active} tone="blue" />
      <MetricCard label="Completed" value={counts.completed} tone="green" />
    </div>

    {showForm && canEdit && <Panel title="Add free shuttle" description="Search the Cloudbeds reservation first. The PMS allows only one active free shuttle per reservation.">
      <form onSubmit={createTransfer} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2 xl:col-span-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <span className="font-bold">Fixed pickup:</span> ATH Airport · <a href={ATH_AIRPORT_MAP_URL} target="_blank" rel="noreferrer" className="font-black underline">Open exact Google Maps location</a>
        </div>

        <div className="relative md:col-span-2 xl:col-span-4">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Search reservation</span>
          <div className="relative">
            <input
              value={reservationSearch}
              onChange={(event) => setReservationSearch(event.target.value)}
              placeholder="Search guest name, reservation ID, phone, email, room or property…"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <span className="pointer-events-none absolute right-4 top-3.5 text-slate-400">⌕</span>
          </div>

          {reservationSearch.trim() && (
            <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              {reservationMatches.length ? reservationMatches.map((reservation) => {
                const property = properties.find((item) => String(item.id) === String(reservation.propertyId));
                return <button
                  key={reservation.id}
                  type="button"
                  onClick={() => selectReservation(reservation)}
                  className="flex w-full items-start justify-between gap-4 rounded-lg px-3 py-3 text-left transition hover:bg-blue-50"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-950">{reservation.guestName}</div>
                    <div className="mt-1 text-xs text-slate-500">{property?.name || 'Property'} · Room {reservation.roomNumber || '—'} · Arrival {reservation.arrivalDate}</div>
                  </div>
                  <div className="shrink-0 font-mono text-[11px] text-slate-400">#{reservation.id}</div>
                </button>;
              }) : <div className="px-3 py-5 text-center text-sm text-slate-500">No eligible reservation found.</div>}
            </div>
          )}
        </div>

        {selected ? <div className="md:col-span-2 xl:col-span-4 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-blue-600">Selected reservation</div>
            <div className="mt-1 font-black text-blue-950">{selected.guestName}</div>
            <div className="mt-1 text-xs text-blue-800">
              {properties.find((item) => String(item.id) === String(selected.propertyId))?.name || 'Property'} · Arrival {selected.arrivalDate} · Room {selected.roomNumber || '—'} · #{selected.id}
            </div>
          </div>
          <button type="button" onClick={() => setForm((current) => ({ ...current, reservationId: '' }))} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700">Change</button>
        </div> : <div className="md:col-span-2 xl:col-span-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">Start typing above and select the reservation that receives the free shuttle.</div>}

        <Field label="Approx. arrival time at ATH Airport" type="time" required value={form.approximateArrivalTimeAirport} onChange={(value) => setForm({ ...form, approximateArrivalTimeAirport: value })} />
        <Field label="Guests" type="number" min="1" value={form.passengers} onChange={(value) => setForm({ ...form, passengers: value })} />
        <Field label="Cabin luggages" type="number" min="0" value={form.cabinLuggages} onChange={(value) => setForm({ ...form, cabinLuggages: value })} />
        <Field label="Luggages" type="number" min="0" value={form.luggages} onChange={(value) => setForm({ ...form, luggages: value })} />
        <Field label="Flight info" value={form.flightInfo} onChange={(value) => setForm({ ...form, flightInfo: value })} />

        <label>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Driver</span>
          <select
            value={form.driverUserId}
            onChange={(event) => {
              const driver = drivers.find((item) => String(item.id) === String(event.target.value));
              setForm({ ...form, driverUserId: event.target.value, driver: driver?.name || '' });
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
          >
            <option value="">Unassigned</option>
            {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
          </select>
        </label>

        <Field label="Vehicle" value={form.vehicle} onChange={(value) => setForm({ ...form, vehicle: value })} />

        <label className="md:col-span-2 xl:col-span-4">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Notes</span>
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        </label>

        <div className="md:col-span-2 xl:col-span-4 flex justify-end">
          <button disabled={saving || !selected} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : 'Save free shuttle'}</button>
        </div>
      </form>
    </Panel>}

    <Panel
      title="Free shuttle schedule"
      description="Switch between operational list and monthly calendar."
      action={<div className="flex flex-wrap items-center gap-2">
        <ViewToggle view={view} setView={setView} />
        <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          <option value="all">All statuses</option>
          <option value="unassigned">Unassigned</option>
          <option value="scheduled">Scheduled</option>
          <option value="on_the_way">On the way</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>}
    >
      {loading ? <div className="p-8 text-sm text-slate-500">Loading free shuttles…</div> : view === 'list' ? (
        filtered.length === 0 ? <EmptyState title="No free shuttles found" description="Add a free shuttle from an eligible reservation." /> :
        <TableShell>
          <thead><tr><Th>ATH arrival</Th><Th>Guest / reservation</Th><Th>Drop-off</Th><Th>Baggage</Th><Th>Flight</Th><Th>Driver / vehicle</Th><Th>Current status</Th><Th>Change status</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((row) => <tr key={row.id} className="hover:bg-slate-50/70">
              <Td><div className="font-bold text-slate-950">{formatDateTime(row.scheduled_at)}</div><div className="mt-1 text-xs text-slate-500">Airport approx. {row.approximate_arrival_time_airport || '—'}</div></Td>
              <Td><div className="font-semibold text-slate-950">{row.guest_name}</div><div className="mt-1 text-xs text-slate-500">#{row.reservation_id || '—'} · {row.passengers || 1} guest(s)</div></Td>
              <Td><div className="font-semibold text-slate-800">{row.destination || 'Property'}</div><a href={ATH_AIRPORT_MAP_URL} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-bold text-blue-700">ATH pickup map ↗</a></Td>
              <Td><div>{row.cabin_luggages || 0} cabin</div><div className="text-xs text-slate-500">{row.luggage || 0} luggage</div></Td>
              <Td>{row.flight_info || '—'}</Td>
              <Td><div className="space-y-2">
                {canEdit ? <select
                  value={row.driver_user_id ? String(row.driver_user_id) : ''}
                  onChange={(event) => {
                    const driver = drivers.find((item) => String(item.id) === String(event.target.value));
                    update(row.id, { driverUserId: event.target.value || null, driver: driver?.name || '', status: driver ? 'scheduled' : 'unassigned' });
                  }}
                  className="w-full min-w-36 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold"
                >
                  <option value="">Unassigned</option>
                  {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                </select> : <div>{row.driver || 'Unassigned'}</div>}
                <div className="text-xs text-slate-500">{row.vehicle || 'No vehicle'}</div>
              </div></Td>
              <Td><StatusBadge status={row.status} /></Td>
              <Td><StatusEditor row={row} disabled={updatingId === String(row.id)} onUpdate={update} /></Td>
            </tr>)}
          </tbody>
        </TableShell>
      ) : (
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
              const items = filtered.filter((row) => scheduledDate(row.scheduled_at) === day);
              const isToday = day === todayKey();
              const muted = dateFromKey(day).getMonth() !== calendarMonthNumber;
              return <div key={day} className={`min-h-36 bg-white p-2 sm:min-h-44 ${muted ? 'bg-slate-50/80' : ''}`}>
                <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${isToday ? 'bg-blue-600 text-white' : muted ? 'text-slate-300' : 'text-slate-700'}`}>{dateFromKey(day).getDate()}</div>
                <div className="space-y-2">
                  {items.slice(0, 4).map((row) => <div key={row.id} className={`rounded-lg border p-2 text-[10px] ${statusTone(row.status)}`}>
                    <div className="flex items-center justify-between gap-2"><span className="font-black">{scheduledTime(row)}</span><span className="font-semibold">{String(row.status || '').replaceAll('_', ' ')}</span></div>
                    <div className="mt-1 truncate font-bold">{row.guest_name}</div>
                    <div className="mt-0.5 truncate opacity-75">{row.driver || 'Unassigned'} · {row.destination || 'Property'}</div>
                    {canEdit && <div className="mt-2"><StatusEditor compact row={row} disabled={updatingId === String(row.id)} onUpdate={update} /></div>}
                  </div>)}
                  {items.length > 4 && <div className="text-center text-[10px] font-bold text-slate-500">+{items.length - 4} more</div>}
                </div>
              </div>;
            })}
          </div>
        </div>
      )}
    </Panel>
  </div>;
};

const Field = ({ label, value, onChange, type = 'text', required = false, min }) => <label>
  <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
  <input type={type} required={required} min={min} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
</label>;

const ViewToggle = ({ view, setView }) => <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
  <button onClick={() => setView('list')} className={`rounded-md px-3 py-1.5 text-xs font-black transition ${view === 'list' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>List</button>
  <button onClick={() => setView('calendar')} className={`rounded-md px-3 py-1.5 text-xs font-black transition ${view === 'calendar' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Calendar</button>
</div>;

const StatusEditor = ({ row, onUpdate, disabled, compact = false }) => (
  <label className="block">
    {!compact && <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Change status</span>}
    <select
      aria-label="Change shuttle status"
      value={row.status}
      disabled={disabled}
      onChange={(event) => onUpdate(row.id, { status: event.target.value })}
      className={`w-full rounded-lg border px-2.5 font-bold outline-none transition focus:ring-2 focus:ring-blue-100 disabled:opacity-50 ${compact ? 'py-1 text-[10px]' : 'min-w-32 py-2 text-xs'} ${statusTone(row.status)}`}
    >
      <option value="unassigned">Unassigned</option>
      <option value="scheduled">Scheduled</option>
      <option value="on_the_way">On the way</option>
      <option value="completed">Completed</option>
      <option value="cancelled">Cancelled</option>
    </select>
  </label>
);

const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '—';

export default ShuttlePage;

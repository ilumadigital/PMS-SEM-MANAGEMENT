import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import { EmptyState, MetricCard, PageHeader, Panel, StatusBadge, TableShell, Td, Th } from '../components/PmsUi';

const blankForm = { guestName: '', guestPhone: '', transferType: 'airport_pickup', pickupLocation: '', destination: '', scheduledAt: '', passengers: 1, luggage: 0, flightInfo: '', driver: '', vehicle: '', notes: '' };
const editRoles = ['admin', 'management', 'reception', 'dispatcher'];

const ShuttlePage = () => {
  const { user } = useContext(AuthContext);
  const role = String(user?.role || '').toLowerCase();
  const canEdit = editRoles.includes(role);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('/management/transfers'); setRows(Array.isArray(data) ? data : []); }
    catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => filter === 'all' ? rows : rows.filter((r) => r.status === filter), [rows, filter]);
  const counts = useMemo(() => ({
    total: rows.length,
    unassigned: rows.filter((r) => r.status === 'unassigned').length,
    active: rows.filter((r) => ['scheduled', 'on_the_way'].includes(r.status)).length,
    completed: rows.filter((r) => r.status === 'completed').length,
  }), [rows]);

  const createTransfer = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try { await api.post('/management/transfers', form); setForm(blankForm); setShowForm(false); await load(); }
    catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setSaving(false); }
  };

  const update = async (id, patch) => {
    try { const { data } = await api.patch(`/management/transfers/${id}`, patch); setRows((current) => current.map((r) => String(r.id) === String(id) ? data : r)); }
    catch (err) { setError(err.response?.data?.error || err.message); }
  };

  return <div className="space-y-6">
    <PageHeader title="Transfers" description="Airport, port and private transfers with live dispatch status, driver and vehicle assignment." actions={<div className="flex gap-2"><button onClick={load} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh</button>{canEdit && <button onClick={() => setShowForm((v) => !v)} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">{showForm ? 'Close' : 'New transfer'}</button>}</div>} />

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <MetricCard label="Total" value={counts.total} />
      <MetricCard label="Unassigned" value={counts.unassigned} tone={counts.unassigned ? 'amber' : 'green'} />
      <MetricCard label="Active" value={counts.active} tone="blue" />
      <MetricCard label="Completed" value={counts.completed} tone="green" />
    </div>

    {showForm && canEdit && <Panel title="New transfer" description="Create a booking-linked or manual transfer request."><form onSubmit={createTransfer} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
      <Field label="Guest name" required value={form.guestName} onChange={(v) => setForm({...form, guestName:v})} />
      <Field label="Phone" value={form.guestPhone} onChange={(v) => setForm({...form, guestPhone:v})} />
      <Field label="Pickup" required value={form.pickupLocation} onChange={(v) => setForm({...form, pickupLocation:v})} />
      <Field label="Destination" required value={form.destination} onChange={(v) => setForm({...form, destination:v})} />
      <Field label="Date & time" type="datetime-local" required value={form.scheduledAt} onChange={(v) => setForm({...form, scheduledAt:v})} />
      <Field label="Flight / ferry info" value={form.flightInfo} onChange={(v) => setForm({...form, flightInfo:v})} />
      <Field label="Driver" value={form.driver} onChange={(v) => setForm({...form, driver:v})} />
      <Field label="Vehicle" value={form.vehicle} onChange={(v) => setForm({...form, vehicle:v})} />
      <Field label="Passengers" type="number" min="1" value={form.passengers} onChange={(v) => setForm({...form, passengers:v})} />
      <Field label="Luggage" type="number" min="0" value={form.luggage} onChange={(v) => setForm({...form, luggage:v})} />
      <label className="md:col-span-2 xl:col-span-4"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Notes</span><textarea value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" /></label>
      <div className="md:col-span-2 xl:col-span-4 flex justify-end"><button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving…' : 'Create transfer'}</button></div>
    </form></Panel>}

    <Panel title="Dispatch board" description="Status changes are stored in MariaDB and shared between Reception, Dispatcher, Management and Drivers." action={<select value={filter} onChange={(e)=>setFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="all">All statuses</option><option value="unassigned">Unassigned</option><option value="scheduled">Scheduled</option><option value="on_the_way">On the way</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>}>
      {loading ? <div className="p-8 text-sm text-slate-500">Loading transfers…</div> : filtered.length === 0 ? <EmptyState title="No transfers found" description="Create the first transfer or change the status filter." /> : <TableShell><thead><tr><Th>When</Th><Th>Guest</Th><Th>Route</Th><Th>Flight</Th><Th>Driver / vehicle</Th><Th>Status</Th><Th>Action</Th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((r)=><tr key={r.id} className="hover:bg-slate-50/70"><Td><div className="whitespace-nowrap font-semibold text-slate-900">{formatDateTime(r.scheduled_at)}</div><div className="text-xs text-slate-500">{r.passengers} pax · {r.luggage} bags</div></Td><Td><div className="font-semibold text-slate-900">{r.guest_name}</div><div className="text-xs text-slate-500">{r.guest_phone || '—'}</div></Td><Td><div className="max-w-64 text-sm"><b>{r.pickup_location}</b><span className="mx-1 text-slate-400">→</span>{r.destination}</div></Td><Td>{r.flight_info || '—'}</Td><Td><div>{r.driver || 'Unassigned'}</div><div className="text-xs text-slate-500">{r.vehicle || 'No vehicle'}</div></Td><Td><StatusBadge status={r.status}/></Td><Td><StatusControl row={r} role={role} canEdit={canEdit} onUpdate={update}/></Td></tr>)}</tbody></TableShell>}
    </Panel>
  </div>;
};

const Field = ({ label, value, onChange, type='text', required=false, min }) => <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input type={type} required={required} min={min} value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>;
const StatusControl = ({ row, role, canEdit, onUpdate }) => {
  const driver = role === 'driver';
  if (!canEdit && !driver) return <span className="text-xs text-slate-400">Read only</span>;
  const options = driver ? ['on_the_way','completed','cancelled'] : ['unassigned','scheduled','on_the_way','completed','cancelled'];
  return <select value={row.status} onChange={(e)=>onUpdate(row.id,{status:e.target.value})} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">{options.map((s)=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select>;
};
const formatDateTime = (v) => v ? new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(v)) : '—';
export default ShuttlePage;

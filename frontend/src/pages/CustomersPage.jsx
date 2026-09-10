import React, { useContext, useEffect, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import { EmptyState, MetricCard, PageHeader, Panel, TableShell, Td, Th, initials } from '../components/PmsUi';

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500';

const CustomersPage = () => {
  const { customers, diagnostics, loading, status, error, refresh, connect, updateGuest, writeState } = useContext(CloudbedsDataContext);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', phone:'', city:'', country:'', nationality:'' });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((guest) => [guest.name, guest.email, guest.phone, guest.city, guest.country].filter(Boolean).some((value)=>String(value).toLowerCase().includes(term)));
  }, [customers, search]);

  const selected = customers.find((guest)=>String(guest.id)===String(selectedId)) || filtered[0] || null;

  useEffect(() => {
    if (!selected) return;
    const parts = String(selected.name || '').trim().split(/\s+/);
    setForm({
      firstName: selected.firstName || parts[0] || '',
      lastName: selected.lastName || parts.slice(1).join(' '),
      email: selected.email || '',
      phone: selected.phone || '',
      city: selected.city || '',
      country: selected.country || '',
      nationality: selected.nationality || '',
    });
    setNotice('');
  }, [selected?.id]);

  const repeatGuests = customers.filter((guest)=>guest.bookings>1).length;
  const withContact = customers.filter((guest)=>guest.email || guest.phone).length;

  const save = async () => {
    if (!selected?.guestId || !selected?.propertyId) return;
    setNotice('');
    try {
      await updateGuest(selected.guestId, { propertyId: selected.propertyId, ...form, cellPhone: form.phone });
      setNotice('Guest profile updated and verified against Cloudbeds.');
    } catch { /* detailed error in writeState */ }
  };

  return <div className="space-y-6">
    <PageHeader title="Guests" description="Live Cloudbeds guest directory with two-way profile editing." actions={<button onClick={status?.connected?refresh:connect} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">{status?.connected?'Refresh Cloudbeds':'Connect Cloudbeds'}</button>} />
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
    {(diagnostics?.missingScopes || []).includes('read:guest') && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Cloudbeds has not granted <strong>Guest READ</strong>. Re-authorize the app after enabling it.</div>}
    {(writeState.error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${writeState.error?'border-rose-200 bg-rose-50 text-rose-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{writeState.error || notice}</div>}

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <MetricCard label="Guests" value={loading?'…':customers.length} helper="Unique profiles" />
      <MetricCard label="Repeat guests" value={loading?'…':repeatGuests} helper="2+ reservations" tone="blue" />
      <MetricCard label="With contact details" value={loading?'…':withContact} helper="Email or phone" tone="green" />
    </div>

    <div className="grid gap-5 2xl:grid-cols-[1fr_390px]">
      <Panel title="Guest directory" description="Select a guest to edit their Cloudbeds profile.">
        <div className="border-b border-slate-100 p-4"><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search guest, email, phone, city or country…" className={inputClass}/></div>
        {filtered.length ? <TableShell><thead><tr><Th>Guest</Th><Th>Email</Th><Th>Phone</Th><Th>Location</Th><Th>Reservations</Th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((guest)=><tr key={guest.id} onClick={()=>setSelectedId(guest.id)} className={`cursor-pointer hover:bg-slate-50 ${String(selected?.id)===String(guest.id)?'bg-blue-50/60':''}`}><Td><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{initials(guest.name)}</div><div><div className="font-semibold text-slate-950">{guest.name}</div>{guest.guestId && <div className="font-mono text-[10px] text-slate-400">{guest.guestId}</div>}</div></div></Td><Td>{guest.email || '—'}</Td><Td>{guest.phone || '—'}</Td><Td>{[guest.city,guest.country].filter(Boolean).join(', ') || '—'}</Td><Td>{guest.bookings}</Td></tr>)}</tbody></TableShell> : <EmptyState title="No guests found" description={status?.connected?'Try a different search.':'Connect Cloudbeds to load guests.'}/>} 
      </Panel>

      <Panel title="Edit Cloudbeds guest" description="Changes are written to the Cloudbeds Guest profile.">{selected ? <div className="space-y-3 p-5"><div className="mb-4"><div className="text-lg font-black text-slate-950">{selected.name}</div><div className="mt-1 font-mono text-[11px] text-slate-500">{selected.guestId || 'No Cloudbeds guest ID'}</div></div><div className="grid grid-cols-2 gap-3"><Field label="First name" value={form.firstName} onChange={(v)=>setForm({...form,firstName:v})}/><Field label="Last name" value={form.lastName} onChange={(v)=>setForm({...form,lastName:v})}/></div><Field label="Email" type="email" value={form.email} onChange={(v)=>setForm({...form,email:v})}/><Field label="Phone" value={form.phone} onChange={(v)=>setForm({...form,phone:v})}/><div className="grid grid-cols-2 gap-3"><Field label="City" value={form.city} onChange={(v)=>setForm({...form,city:v})}/><Field label="Country code" value={form.country} onChange={(v)=>setForm({...form,country:v.toUpperCase().slice(0,2)})} placeholder="GR"/></div><Field label="Nationality" value={form.nationality} onChange={(v)=>setForm({...form,nationality:v.toUpperCase().slice(0,2)})} placeholder="GR"/><button onClick={save} disabled={writeState.syncing || !selected.guestId || !selected.propertyId} className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-black disabled:opacity-40">{writeState.syncing?'Syncing…':'Save guest to Cloudbeds'}</button>{(!selected.guestId || !selected.propertyId) && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">This fallback guest record does not expose the Cloudbeds identifiers required for write-back.</div>}</div> : <EmptyState title="Select a guest"/>}</Panel>
    </div>
  </div>;
};

const Field = ({ label, value, onChange, type='text', placeholder='' }) => <label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span><input type={type} value={value ?? ''} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder} className={inputClass}/></label>;

export default CustomersPage;

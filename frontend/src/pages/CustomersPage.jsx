import React, { useContext, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import { EmptyState, MetricCard, PageHeader, Panel, TableShell, Td, Th, initials } from '../components/PmsUi';

const inputClass='w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500';

const CustomersPage=()=>{
  const { customers,diagnostics,loading,status,error,refresh }=useContext(CloudbedsDataContext);
  const [search,setSearch]=useState('');
  const [selectedId,setSelectedId]=useState('');

  const filtered=useMemo(()=>{
    const term=search.trim().toLowerCase();
    if(!term)return customers;
    return customers.filter(guest=>[guest.name,guest.email,guest.phone,guest.city,guest.country].filter(Boolean).some(value=>String(value).toLowerCase().includes(term)));
  },[customers,search]);

  const selected=customers.find(guest=>String(guest.id)===String(selectedId)) || filtered[0] || null;
  const repeatGuests=customers.filter(guest=>guest.bookings>1).length;
  const withContact=customers.filter(guest=>guest.email||guest.phone).length;

  return <div className="space-y-6">
    <PageHeader title="Guests" description="Read-only Cloudbeds guest directory. Guest profile changes remain managed in Cloudbeds." actions={status?.connected?<button onClick={refresh} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">Refresh Cloudbeds</button>:<span className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-700">Administrator connection required</span>}/>
    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
    {(diagnostics?.missingScopes||[]).includes('read:guest')&&<div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Cloudbeds has not granted <strong>Guest READ</strong>. Re-authorize the app after enabling it.</div>}

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <MetricCard label="Guests" value={loading?'…':customers.length} helper="Unique profiles"/>
      <MetricCard label="Repeat guests" value={loading?'…':repeatGuests} helper="2+ reservations" tone="blue"/>
      <MetricCard label="With contact details" value={loading?'…':withContact} helper="Email or phone" tone="green"/>
    </div>

    <div className="grid gap-5 2xl:grid-cols-[1fr_390px]">
      <Panel title="Guest directory" description="Cloudbeds is the source of truth for guest profiles.">
        <div className="border-b border-slate-100 p-4"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search guest, email, phone, city or country…" className={inputClass}/></div>
        {filtered.length?<TableShell><thead><tr><Th>Guest</Th><Th>Email</Th><Th>Phone</Th><Th>Location</Th><Th>Reservations</Th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map(guest=><tr key={guest.id} onClick={()=>setSelectedId(String(guest.id))} className={`cursor-pointer hover:bg-slate-50 ${String(selected?.id)===String(guest.id)?'bg-blue-50/60':''}`}><Td><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{initials(guest.name)}</div><div><div className="font-semibold text-slate-950">{guest.name}</div>{guest.guestId&&<div className="font-mono text-[10px] text-slate-400">{guest.guestId}</div>}</div></div></Td><Td>{guest.email||'—'}</Td><Td>{guest.phone||'—'}</Td><Td>{[guest.city,guest.country].filter(Boolean).join(', ')||'—'}</Td><Td>{guest.bookings}</Td></tr>)}</tbody></TableShell>:<EmptyState title="No guests found" description={status?.connected?'Try a different search.':'Connect Cloudbeds to load guests.'}/>}
      </Panel>

      <Panel title="Guest details" description="Read-only values from Cloudbeds.">
        {selected?<div className="space-y-4 p-5">
          <div><div className="text-lg font-black text-slate-950">{selected.name}</div><div className="mt-1 font-mono text-[11px] text-slate-500">{selected.guestId||'Cloudbeds guest'}</div></div>
          <Detail label="Email" value={selected.email}/>
          <Detail label="Phone" value={selected.phone}/>
          <Detail label="City" value={selected.city}/>
          <Detail label="Country" value={selected.country}/>
          <Detail label="Reservations" value={selected.bookings}/>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-xs leading-5 text-blue-800">Edit the guest profile directly in Cloudbeds. SEM PMS will receive the updated data on the next automatic sync.</div>
        </div>:<EmptyState title="Select a guest"/>}
      </Panel>
    </div>
  </div>;
};

const Detail=({label,value})=><div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0"><span className="text-xs font-semibold text-slate-500">{label}</span><span className="max-w-[65%] break-words text-right text-sm font-semibold text-slate-900">{value||'—'}</span></div>;

export default CustomersPage;

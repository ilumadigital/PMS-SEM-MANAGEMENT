import React, { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import api from '../services/api';
import {
  EmptyState, MetricCard, PageHeader, Panel, StatusBadge, TableShell, Td, Th,
  formatDate, formatMoney, formatTime,
} from '../components/PmsUi';

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

const BookingsPage = () => {
  const navigate = useNavigate();
  const {
    reservations, properties, diagnostics, loading, status, error, refresh,
  } = useContext(CloudbedsDataContext);

  const [search,setSearch]=useState('');
  const [statusFilter,setStatusFilter]=useState('all');
  const [propertyFilter,setPropertyFilter]=useState('all');
  const [selectedId,setSelectedId]=useState('');
  const [sendingInstructions,setSendingInstructions]=useState(false);
  const [instructionResult,setInstructionResult]=useState(null);
  const [instructionError,setInstructionError]=useState('');

  const filtered=useMemo(()=>{
    const term=search.trim().toLowerCase();
    return reservations.filter((reservation)=>{
      const matchesSearch=!term || [
        reservation.id,reservation.guestName,reservation.guestEmail,reservation.guestPhone,
        reservation.roomNumber,reservation.roomType,reservation.cloudbedsSource,
      ].filter(Boolean).some(value=>String(value).toLowerCase().includes(term));
      const matchesStatus=statusFilter==='all' || String(reservation.status)===statusFilter;
      const matchesProperty=propertyFilter==='all' || String(reservation.propertyId)===String(propertyFilter);
      return matchesSearch && matchesStatus && matchesProperty;
    });
  },[reservations,search,statusFilter,propertyFilter]);

  const selected=reservations.find(r=>String(r.id)===String(selectedId)) || filtered[0] || null;
  const confirmed=reservations.filter(r=>r.status==='confirmed').length;
  const inHouse=reservations.filter(r=>r.status==='in_house').length;
  const cancelled=reservations.filter(r=>r.status==='cancelled').length;

  const sendInstructions=async()=>{
    if(!selected?.guestEmail){setInstructionError('This reservation does not have a guest email in Cloudbeds.');return;}
    setSendingInstructions(true);setInstructionResult(null);setInstructionError('');
    try{
      const response=await api.post(`/guest-portal/reservations/${selected.id}/send-instructions`);
      setInstructionResult(response.data.data);
    }catch(requestError){
      setInstructionError(requestError.response?.data?.message || 'Guest instructions could not be sent.');
    }finally{setSendingInstructions(false);}
  };

  const copyPortalLink=async()=>{
    if(!instructionResult?.portalUrl)return;
    try{await navigator.clipboard.writeText(instructionResult.portalUrl);}
    catch{window.prompt('Copy guest portal link:',instructionResult.portalUrl);}
  };

  return <div className="space-y-6">
    <PageHeader
      title="Reservations"
      description="Read-only Cloudbeds reservation feed. New reservations, dates, room assignment and guest profile changes are managed in Cloudbeds; SEM PMS keeps only local operational fields."
      actions={<div className="flex flex-wrap gap-2">
        <button onClick={()=>navigate('/calendar')} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Open read-only calendar</button>
        {status?.connected?<button onClick={refresh} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh</button>:<span className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-700">Administrator connection required</span>}
      </div>}
    />

    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"><div className="text-sm font-semibold text-rose-800">Cloudbeds sync issue</div><div className="mt-1 text-xs text-rose-700">{error}</div></div>}
    {status?.authorized&&!loading&&reservations.length===0&&!error&&<div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4"><div className="text-sm font-semibold text-amber-900">Cloudbeds is authorized but returned no reservation rows.</div><div className="mt-1 text-xs text-amber-800">{(diagnostics?.missingScopes||[]).length?`Missing permissions: ${diagnostics.missingScopes.join(', ')}.`:'Re-authorize after changing Partner App scopes.'}</div></div>}

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <MetricCard label="Total" value={loading?'…':reservations.length} helper="Cloudbeds records"/>
      <MetricCard label="Confirmed" value={loading?'…':confirmed} tone="green"/>
      <MetricCard label="In house" value={loading?'…':inHouse} tone="blue"/>
      <MetricCard label="Cancelled" value={loading?'…':cancelled} tone={cancelled?'rose':'default'}/>
    </div>

    <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
      <Panel title="Reservation list" description="Cloudbeds is the source of truth for reservation and room data.">
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_180px_220px_auto]">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search reservation, guest, email, phone or room…" className={inputClass}/>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className={inputClass}><option value="all">All statuses</option><option value="confirmed">Confirmed</option><option value="in_house">In house</option><option value="pending_confirmation">Pending</option><option value="no_show">No show</option><option value="checked_out">Checked out</option><option value="cancelled">Cancelled</option></select>
          <select value={propertyFilter} onChange={e=>setPropertyFilter(e.target.value)} className={inputClass}><option value="all">All properties</option>{properties.map(property=><option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <button onClick={()=>{setSearch('');setStatusFilter('all');setPropertyFilter('all');}} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</button>
        </div>
        {filtered.length?<TableShell><thead><tr><Th>Reservation</Th><Th>Guest</Th><Th>Check-in</Th><Th>Check-out</Th><Th>Room</Th><Th>Status</Th><Th>Source</Th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map(reservation=><tr key={reservation.id} onClick={()=>{setSelectedId(String(reservation.id));setInstructionResult(null);setInstructionError('');}} className={`cursor-pointer hover:bg-slate-50 ${String(selected?.id)===String(reservation.id)?'bg-blue-50/60':''}`}><Td className="font-mono text-xs font-semibold text-slate-800">{reservation.id}</Td><Td><div className="font-semibold text-slate-950">{reservation.guestName}</div><div className="mt-0.5 text-xs text-slate-500">{reservation.guestEmail||reservation.guestPhone||'No contact details'}</div></Td><Td>{formatDate(reservation.arrivalDate)}{reservation.actualArrivalTime&&<div className="text-xs font-semibold text-blue-700">SEM {formatTime(reservation.actualArrivalTime)}</div>}</Td><Td>{formatDate(reservation.departureDate)}{reservation.actualDepartureTime&&<div className="text-xs font-semibold text-blue-700">SEM {formatTime(reservation.actualDepartureTime)}</div>}</Td><Td><div className="font-semibold text-slate-900">{reservation.roomNumber||'Unassigned'}</div><div className="text-xs text-slate-500">{reservation.roomType||'—'}</div></Td><Td><StatusBadge status={reservation.status}/></Td><Td>{reservation.cloudbedsSource||'Cloudbeds'}</Td></tr>)}</tbody></TableShell>:<EmptyState title="No reservations found" description={status?.authorized?'Try changing the filters.':'Connect Cloudbeds to load reservations.'}/>}
      </Panel>

      <div className="space-y-5">
        <Panel title="Reservation details" description="Read-only Cloudbeds values plus SEM PMS operational information.">
          {selected?<div className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3"><div><div className="text-lg font-black text-slate-950">{selected.guestName}</div><div className="mt-1 font-mono text-xs text-slate-500">#{selected.id}</div></div><StatusBadge status={selected.status}/></div>
            <div className="grid grid-cols-2 gap-4">
              <Detail label="Property" value={selected.property?.name || properties.find(p=>String(p.id)===String(selected.propertyId))?.name || 'Cloudbeds property'}/>
              <Detail label="Room" value={selected.roomNumber || 'Unassigned'}/>
              <Detail label="Room type" value={selected.roomType || '—'}/>
              <Detail label="Guests" value={selected.guestCount || 1}/>
              <Detail label="Check-in" value={formatDate(selected.arrivalDate)}/>
              <Detail label="Check-out" value={formatDate(selected.departureDate)}/>
              <Detail label="SEM arrival time" value={formatTime(selected.actualArrivalTime)}/>
              <Detail label="SEM departure time" value={formatTime(selected.actualDepartureTime)}/>
              <Detail label="Phone" value={selected.guestPhone || '—'}/>
              <Detail label="Email" value={selected.guestEmail || '—'}/>
              <Detail label="Nights" value={selected.nights ?? '—'}/>
              <Detail label="Total" value={formatMoney(selected.totalPrice)}/>
            </div>
            {selected.guestNotes&&<div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600"><div className="mb-1 font-black uppercase tracking-wide text-slate-400">SEM notes</div>{selected.guestNotes}</div>}
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">To change reservation dates, room, guest profile or booking details, use Cloudbeds. The SEM PMS Calendar remains read-only.</div>
          </div>:<EmptyState title="Select a reservation"/>}
        </Panel>

        {selected&&<Panel title="Guest Experience" description="Guest Portal communication is managed by SEM PMS and does not modify the Cloudbeds reservation."><div className="p-5"><button onClick={sendInstructions} disabled={sendingInstructions||!selected.guestEmail||selected.status==='cancelled'} className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50">{sendingInstructions?'Sending…':'Send Guest Portal instructions'}</button>{instructionError&&<div className="mt-2 text-xs font-semibold text-rose-700">{instructionError}</div>}{instructionResult&&<div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3"><div className="text-xs font-bold text-sky-900">{instructionResult.emailSent?'Email sent successfully.':'Secure portal link created.'}</div><div className="mt-2 break-all text-[10px] text-slate-500">{instructionResult.portalUrl}</div><button onClick={copyPortalLink} className="mt-2 rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-bold text-sky-700">Copy link</button></div>}</div></Panel>}
      </div>
    </div>
  </div>;
};

const Detail=({label,value})=><div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 break-words text-sm font-semibold text-slate-900">{value || '—'}</div></div>;

export default BookingsPage;

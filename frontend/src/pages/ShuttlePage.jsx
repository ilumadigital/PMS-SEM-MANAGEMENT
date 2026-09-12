import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import api from '../services/api';
import { EmptyState, MetricCard, PageHeader, Panel, StatusBadge, TableShell, Td, Th } from '../components/PmsUi';

const editRoles = ['admin', 'management', 'reception', 'dispatcher'];
const initialForm = { reservationId:'', approximateArrivalTimeAirport:'', cabinLuggages:0, luggages:0, passengers:1, flightInfo:'', driver:'', vehicle:'', notes:'' };

const ShuttlePage = () => {
  const { user } = useContext(AuthContext);
  const { reservations, properties } = useContext(CloudbedsDataContext);
  const role = String(user?.role || '').toLowerCase();
  const canEdit = editRoles.includes(role);
  const [rows,setRows]=useState([]);
  const [filter,setFilter]=useState('all');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState(initialForm);
  const [saving,setSaving]=useState(false);

  const load=async()=>{
    setLoading(true); setError('');
    try { const {data}=await api.get('/management/transfers'); setRows(Array.isArray(data)?data:[]); }
    catch(e){ setError(e.response?.data?.error || e.message); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{ load(); },[]);

  const activeReservations=useMemo(()=>reservations
    .filter(r=>!['cancelled','checked_out'].includes(String(r.status||'')))
    .sort((a,b)=>String(a.arrivalDate||'').localeCompare(String(b.arrivalDate||''))),[reservations]);
  const usedReservationIds=useMemo(()=>new Set(rows.filter(r=>r.free_shuttle!==0 && r.status!=='cancelled').map(r=>String(r.reservation_id||''))),[rows]);
  const selected=activeReservations.find(r=>String(r.id)===String(form.reservationId)) || null;
  const eligibleReservations=activeReservations.filter(r=>!usedReservationIds.has(String(r.id)) || String(r.id)===String(form.reservationId));
  const filtered=useMemo(()=>filter==='all'?rows:rows.filter(r=>r.status===filter),[rows,filter]);
  const counts=useMemo(()=>({
    total:rows.length,
    unassigned:rows.filter(r=>r.status==='unassigned').length,
    active:rows.filter(r=>['scheduled','on_the_way'].includes(r.status)).length,
    completed:rows.filter(r=>r.status==='completed').length,
  }),[rows]);

  const createTransfer=async(e)=>{
    e.preventDefault();
    if(!selected){ setError('Select a Cloudbeds reservation.'); return; }
    if(!form.approximateArrivalTimeAirport){ setError('Approximate arrival time in Airport is required.'); return; }
    setSaving(true); setError('');
    const property=properties.find(p=>String(p.id)===String(selected.propertyId));
    const scheduledAt=`${selected.arrivalDate}T${form.approximateArrivalTimeAirport}:00`;
    try {
      await api.post('/management/transfers',{
        reservationId:selected.id,
        propertyId:selected.propertyId,
        guestName:selected.guestName,
        guestPhone:selected.guestPhone || '',
        scheduledAt,
        approximateArrivalTimeAirport:form.approximateArrivalTimeAirport,
        cabinLuggages:Number(form.cabinLuggages||0),
        luggages:Number(form.luggages||0),
        passengers:Number(form.passengers||1),
        flightInfo:form.flightInfo,
        pickupLocation:'Airport',
        destination:property?.name || selected.property?.name || 'Property',
        driver:form.driver,
        vehicle:form.vehicle,
        notes:form.notes,
      });
      setForm(initialForm); setShowForm(false); await load();
    } catch(err){ setError(err.response?.data?.error || err.message); }
    finally{ setSaving(false); }
  };

  const update=async(id,patch)=>{
    try { const {data}=await api.patch(`/management/transfers/${id}`,patch); setRows(current=>current.map(r=>String(r.id)===String(id)?data:r)); }
    catch(err){ setError(err.response?.data?.error || err.message); }
  };

  return <div className="space-y-6">
    <PageHeader title="Transfers" description="Every reservation is eligible for one free airport shuttle. Transfer data is stored locally in SEM PMS; Cloudbeds remains read-only." actions={<div className="flex gap-2"><button onClick={load} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh</button>{canEdit&&<button onClick={()=>setShowForm(v=>!v)} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">{showForm?'Close':'Add free shuttle'}</button>}</div>} />

    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <MetricCard label="Free shuttles" value={counts.total}/>
      <MetricCard label="Unassigned" value={counts.unassigned} tone={counts.unassigned?'amber':'green'}/>
      <MetricCard label="Active" value={counts.active} tone="blue"/>
      <MetricCard label="Completed" value={counts.completed} tone="green"/>
    </div>

    {showForm&&canEdit&&<Panel title="Reservation free shuttle" description="One free shuttle per reservation. Guest and property are pulled from the Cloudbeds read-only reservation."><form onSubmit={createTransfer} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
      <label className="md:col-span-2 xl:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Reservation / Guest</span><select required value={form.reservationId} onChange={e=>setForm({...form,reservationId:e.target.value})} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Select reservation</option>{eligibleReservations.map(r=><option key={r.id} value={r.id}>{r.guestName} · {r.arrivalDate} · Room {r.roomNumber||'—'} · #{r.id}</option>)}</select></label>
      <Field label="Approx. arrival time in Airport" type="time" required value={form.approximateArrivalTimeAirport} onChange={v=>setForm({...form,approximateArrivalTimeAirport:v})}/>
      <Field label="Guests" type="number" min="1" value={form.passengers} onChange={v=>setForm({...form,passengers:v})}/>
      <Field label="Cabin luggages" type="number" min="0" value={form.cabinLuggages} onChange={v=>setForm({...form,cabinLuggages:v})}/>
      <Field label="Luggages" type="number" min="0" value={form.luggages} onChange={v=>setForm({...form,luggages:v})}/>
      <Field label="Flight info" value={form.flightInfo} onChange={v=>setForm({...form,flightInfo:v})}/>
      <Field label="Driver" value={form.driver} onChange={v=>setForm({...form,driver:v})}/>
      <Field label="Vehicle" value={form.vehicle} onChange={v=>setForm({...form,vehicle:v})}/>
      <label className="md:col-span-2 xl:col-span-4"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Notes</span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"/></label>
      {selected&&<div className="md:col-span-2 xl:col-span-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900"><strong>{selected.guestName}</strong> · Arrival {selected.arrivalDate} · {selected.property?.name || properties.find(p=>String(p.id)===String(selected.propertyId))?.name || 'Property'} · Reservation #{selected.id}</div>}
      <div className="md:col-span-2 xl:col-span-4 flex justify-end"><button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving?'Saving…':'Save free shuttle'}</button></div>
    </form></Panel>}

    <Panel title="Free shuttle board" description="Reservation-linked shuttle requests. The PMS prevents a second active free shuttle for the same reservation." action={<select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="all">All statuses</option><option value="unassigned">Unassigned</option><option value="scheduled">Scheduled</option><option value="on_the_way">On the way</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>}>
      {loading?<div className="p-8 text-sm text-slate-500">Loading transfers…</div>:filtered.length===0?<EmptyState title="No free shuttles found" description="Add a free shuttle from an eligible reservation."/>:<TableShell><thead><tr><Th>Airport arrival</Th><Th>Guest / reservation</Th><Th>Baggage</Th><Th>Flight</Th><Th>Driver / vehicle</Th><Th>Status</Th><Th>Action</Th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map(r=><tr key={r.id} className="hover:bg-slate-50/70"><Td><div className="font-semibold text-slate-900">{formatDateTime(r.scheduled_at)}</div><div className="text-xs text-slate-500">Approx. {r.approximate_arrival_time_airport || '—'}</div></Td><Td><div className="font-semibold text-slate-900">{r.guest_name}</div><div className="text-xs text-slate-500">Reservation #{r.reservation_id || '—'} · {r.passengers} guest(s)</div></Td><Td><div>{r.cabin_luggages || 0} cabin</div><div className="text-xs text-slate-500">{r.luggage || 0} luggage</div></Td><Td>{r.flight_info||'—'}</Td><Td><div>{r.driver||'Unassigned'}</div><div className="text-xs text-slate-500">{r.vehicle||'No vehicle'}</div></Td><Td><StatusBadge status={r.status}/></Td><Td><StatusControl row={r} role={role} canEdit={canEdit} onUpdate={update}/></Td></tr>)}</tbody></TableShell>}
    </Panel>
  </div>;
};

const Field=({label,value,onChange,type='text',required=false,min})=><label><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input type={type} required={required} min={min} value={value} onChange={e=>onChange(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/></label>;
const StatusControl=({row,role,canEdit,onUpdate})=>{
  const driver=role==='driver';
  if(!canEdit&&!driver)return <span className="text-xs text-slate-400">Read only</span>;
  const options=driver?['on_the_way','completed','cancelled']:['unassigned','scheduled','on_the_way','completed','cancelled'];
  return <select value={row.status} onChange={e=>onUpdate(row.id,{status:e.target.value})} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">{options.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select>;
};
const formatDateTime=(v)=>v?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'—';
export default ShuttlePage;

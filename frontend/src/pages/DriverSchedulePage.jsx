import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { EmptyState, PageHeader, StatusBadge } from '../components/PmsUi';

const dateKey=(date)=>{const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const addDays=(key,days)=>{const d=new Date(`${key}T12:00:00`);d.setDate(d.getDate()+days);return dateKey(d);};
const mondayOf=(value)=>{const d=new Date(`${value}T12:00:00`);const day=d.getDay()||7;d.setDate(d.getDate()-day+1);return dateKey(d);};
const todayKey=()=>dateKey(new Date());
const prettyDay=(key)=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'short'}).format(new Date(`${key}T12:00:00`));
const time=(value)=>value?String(value).slice(11,16):'—';
const ATH_AIRPORT_LABEL='ATH Airport';
const ATH_AIRPORT_MAP_URL='https://maps.app.goo.gl/psJeMC1mkSGvzhML8';
const mapsRoute=(to)=>`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent('ATH Airport')}&destination=${encodeURIComponent(to || '')}`;

const DriverSchedulePage=()=>{
  const [weekStart,setWeekStart]=useState(mondayOf(todayKey()));
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [saving,setSaving]=useState('');
  const days=useMemo(()=>Array.from({length:7},(_,i)=>addDays(weekStart,i)),[weekStart]);

  const load=async()=>{setLoading(true);setError('');try{const {data}=await api.get('/management/transfers');setRows(Array.isArray(data)?data:[]);}catch(e){setError(e.response?.data?.error||e.message);}finally{setLoading(false);}};
  useEffect(()=>{load();},[weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const update=async(row,status)=>{setSaving(String(row.id));setError('');try{await api.patch(`/management/transfers/${row.id}`,{status});await load();}catch(e){setError(e.response?.data?.error||e.message);}finally{setSaving('');}};

  return <div className="space-y-6">
    <PageHeader title="My Shuttle Schedule" description="Only shuttles assigned to you are shown. Pickup is always ATH Airport and drop-off is the reservation property." actions={<div className="flex gap-2"><button onClick={()=>setWeekStart(addDays(weekStart,-7))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">‹ Week</button><button onClick={()=>setWeekStart(mondayOf(todayKey()))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">Today</button><button onClick={()=>setWeekStart(addDays(weekStart,7))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">Week ›</button></div>} />
    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
    {loading?<div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading shuttle schedule…</div>:
      <div className="grid gap-3 xl:grid-cols-7">
        {days.map(day=>{
          const items=rows.filter(r=>String(r.scheduled_at||'').slice(0,10)===day);
          const isToday=day===todayKey();
          return <section key={day} className={`min-h-56 rounded-2xl border bg-white shadow-sm ${isToday?'border-blue-300 ring-2 ring-blue-100':'border-slate-200'}`}>
            <div className={`border-b px-4 py-3 ${isToday?'border-blue-100 bg-blue-50':'border-slate-100'}`}><div className="text-xs font-black uppercase tracking-wide text-slate-700">{prettyDay(day)}</div><div className="mt-1 text-[11px] text-slate-400">{items.length} shuttle{items.length===1?'':'s'}</div></div>
            <div className="space-y-3 p-3">
              {items.map(row=><article key={row.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2"><div><div className="text-xl font-black text-slate-950">{row.approximate_arrival_time_airport || time(row.scheduled_at)}</div><div className="mt-1 text-xs font-bold text-slate-700">{row.guest_name}</div></div><StatusBadge status={row.status}/></div>
                <div className="mt-3 space-y-2 text-xs"><div><span className="font-bold text-slate-500">Pickup:</span> {ATH_AIRPORT_LABEL}</div><div><span className="font-bold text-slate-500">Drop-off:</span> {row.destination || 'Property'}</div><div className="text-slate-500">{row.passengers || 1} guest(s) · {row.cabin_luggages || 0} cabin · {row.luggage || 0} luggage</div>{row.flight_info&&<div className="font-semibold text-slate-700">Flight {row.flight_info}</div>}</div>
                <div className="mt-3 grid gap-2">
                  <a href={ATH_AIRPORT_MAP_URL} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-black text-slate-700">Pickup in Google Maps</a>
                  <a href={mapsRoute(row.destination)} target="_blank" rel="noreferrer" className="rounded-lg bg-blue-600 px-3 py-2 text-center text-xs font-black text-white">Route to property</a>
                </div>
                <select value={row.status} disabled={saving===String(row.id)} onChange={e=>update(row,e.target.value)} className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-bold"><option value="unassigned" disabled>Unassigned</option><option value="scheduled">Scheduled</option><option value="on_the_way">On the way</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
              </article>)}
              {!items.length&&<div className="p-4 text-center text-xs text-slate-400">No shuttles</div>}
            </div>
          </section>;
        })}
      </div>}
    {!loading&&!rows.length&&<EmptyState title="No shuttles assigned" description="Your Drivers Admin has not assigned a shuttle to you."/>}
  </div>;
};

export default DriverSchedulePage;

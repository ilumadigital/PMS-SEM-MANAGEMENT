import React, { useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import { EmptyState, PageHeader, StatusBadge } from '../components/PmsUi';

const dateKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const addDays = (key, days) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate()+days);
  return dateKey(d);
};
const mondayOf = (value) => {
  const d = new Date(`${value}T12:00:00`);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return dateKey(d);
};
const todayKey = () => dateKey(new Date());
const prettyDay = (key) => new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'short'}).format(new Date(`${key}T12:00:00`));

const CleanerSchedulePage = () => {
  const { updateHousekeeping } = useContext(CloudbedsDataContext);
  const [weekStart,setWeekStart]=useState(mondayOf(todayKey()));
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [saving,setSaving]=useState('');

  const days=useMemo(()=>Array.from({length:7},(_,i)=>addDays(weekStart,i)),[weekStart]);
  const load=async()=>{
    setLoading(true); setError('');
    try {
      const {data}=await api.get('/management/housekeeping-assignments',{params:{from:days[0],to:days[6]}});
      setRows(Array.isArray(data)?data:[]);
    } catch(e){ setError(e.response?.data?.error || e.message || 'Could not load your cleaning schedule.'); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{ load(); },[weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch=async(row,payload)=>{
    setSaving(String(row.id)); setError('');
    try {
      await api.patch(`/management/housekeeping-assignments/${row.id}`,payload);
      await load();
    } catch(e){ setError(e.response?.data?.error || e.message); }
    finally{ setSaving(''); }
  };

  const markClean=async(row)=>{
    setSaving(String(row.id)); setError('');
    try {
      await updateHousekeeping(row.room_id,{
        propertyId:row.property_id,
        roomNumber:row.room_number,
        roomCondition:'clean',
      });
      await api.patch(`/management/housekeeping-assignments/${row.id}`,{status:'completed'});
      await load();
    } catch(e){ setError(e.response?.data?.message || e.response?.data?.error || e.message); }
    finally{ setSaving(''); }
  };

  return <div className="space-y-6">
    <PageHeader title="My Cleaning Schedule" description="Only rooms assigned to you are shown. Marking a room Clean updates SEM PMS and the Cloudbeds housekeeping room condition." actions={<div className="flex gap-2"><button onClick={()=>setWeekStart(addDays(weekStart,-7))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">‹ Week</button><button onClick={()=>setWeekStart(mondayOf(todayKey()))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">Today</button><button onClick={()=>setWeekStart(addDays(weekStart,7))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">Week ›</button></div>} />
    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
    {loading?<div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading schedule…</div>:
      <div className="grid gap-3 xl:grid-cols-7">
        {days.map(day=>{
          const items=rows.filter(r=>String(r.task_date).slice(0,10)===day);
          const isToday=day===todayKey();
          return <section key={day} className={`min-h-56 rounded-2xl border bg-white shadow-sm ${isToday?'border-blue-300 ring-2 ring-blue-100':'border-slate-200'}`}>
            <div className={`border-b px-4 py-3 ${isToday?'border-blue-100 bg-blue-50':'border-slate-100'}`}><div className="text-xs font-black uppercase tracking-wide text-slate-700">{prettyDay(day)}</div><div className="mt-1 text-[11px] text-slate-400">{items.length} room{items.length===1?'':'s'}</div></div>
            <div className="space-y-3 p-3">
              {items.map(row=>{const actionable=day===todayKey();return <article key={row.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2"><div><div className="text-lg font-black text-slate-950">Room {row.room_number || row.room_id}</div><div className="mt-1 text-[11px] text-slate-500">{row.room_type || 'Room'} · {row.property_name || `Property ${row.property_id}`}</div></div><StatusBadge status={row.status}/></div>
                {row.notes&&<div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{row.notes}</div>}
                {actionable?<div className="mt-3 grid gap-2">
                  {row.status==='assigned'&&<button disabled={saving===String(row.id)} onClick={()=>patch(row,{status:'in_progress'})} className="min-h-10 rounded-lg border border-blue-200 bg-blue-50 text-xs font-black text-blue-700 disabled:opacity-50">Start cleaning</button>}
                  {row.status!=='completed'&&<button disabled={saving===String(row.id)} onClick={()=>markClean(row)} className="min-h-10 rounded-lg bg-emerald-600 text-xs font-black text-white disabled:opacity-50">{saving===String(row.id)?'Saving…':'Mark room Clean'}</button>}
                </div>:<div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-center text-[10px] font-bold text-slate-400">Scheduled view</div>}
              </article>;})}
              {!items.length&&<div className="p-4 text-center text-xs text-slate-400">No assigned rooms</div>}
            </div>
          </section>;
        })}
      </div>}
    {!loading&&!rows.length&&<EmptyState title="No rooms assigned this week" description="Your Cleaner Admin has not assigned any rooms to you for this week."/>}
  </div>;
};

export default CleanerSchedulePage;

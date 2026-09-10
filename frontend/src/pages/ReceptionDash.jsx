import React, { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import {
  EmptyState, MetricCard, PageHeader, Panel, StatusBadge, TableShell, Td, Th,
  formatDate, formatTime, todayKey,
} from '../components/PmsUi';

const ReceptionDash = () => {
  const navigate = useNavigate();
  const {
    reservations, dashboard, diagnostics, loading, refresh, reauthorize, status,
    updateReservation, writeState,
  } = useContext(CloudbedsDataContext);
  const [view, setView] = useState('today');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [activeId, setActiveId] = useState(null);
  const today = todayKey();

  const arrivals = reservations.filter((r)=>r.arrivalDate===today && r.status!=='cancelled');
  const departures = reservations.filter((r)=>r.departureDate===today && r.status!=='cancelled');
  const inHouse = reservations.filter((r)=>r.status==='in_house' || (r.arrivalDate && r.departureDate && r.arrivalDate<=today && r.departureDate>today && r.status!=='cancelled'));

  const rows = useMemo(() => {
    let list;
    if (view==='arrivals') list=arrivals.map((r)=>({...r,movement:'Arrival'}));
    else if (view==='departures') list=departures.map((r)=>({...r,movement:'Departure'}));
    else if (view==='inhouse') list=inHouse.map((r)=>({...r,movement:'In house'}));
    else list=[...arrivals.map((r)=>({...r,movement:'Arrival'})),...departures.map((r)=>({...r,movement:'Departure'}))];
    const term=search.trim().toLowerCase();
    return list.filter((r)=>!term || [r.guestName,r.id,r.roomNumber,r.guestEmail,r.guestPhone].filter(Boolean).some((v)=>String(v).toLowerCase().includes(term))).sort((a,b)=>String((a.movement==='Departure'?a.departureTime:a.arrivalTime)||'99:99').localeCompare(String((b.movement==='Departure'?b.departureTime:b.arrivalTime)||'99:99')));
  }, [view,search,arrivals,departures,inHouse]);

  const missingInfo=reservations.filter((r)=>(r.missingFields||[]).length>0 && r.status!=='cancelled').length;
  const displayArrivals=dashboard?Number(dashboard.arrivals||arrivals.length):arrivals.length;
  const displayDepartures=dashboard?Number(dashboard.departures||departures.length):departures.length;
  const displayInHouse=dashboard?Number(dashboard.inHouse||inHouse.length):inHouse.length;
  const reservationScopeMissing=(diagnostics?.missingScopes||[]).includes('read:reservation');

  const statusAction = async (reservation, nextStatus) => {
    setActiveId(reservation.id); setNotice('');
    try {
      await updateReservation(reservation.id,{propertyId:reservation.propertyId,status:nextStatus});
      setNotice(`${reservation.guestName}: ${nextStatus==='in_house'?'checked in':'checked out'} successfully in Cloudbeds.`);
    } catch { /* detailed context error */ }
    finally { setActiveId(null); }
  };

  return <div className="space-y-6">
    <PageHeader title="Front Desk" description="Today’s arrivals, departures and direct Cloudbeds reservation operations." actions={<div className="flex flex-wrap gap-2"><button onClick={()=>navigate('/calendar')} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Open Calendar</button><button onClick={()=>navigate('/calendar?new=1')} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700">+ New reservation</button><button onClick={refresh} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh</button></div>} />

    <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-black text-blue-950">Direct booking desk</div><div className="mt-1 text-xs leading-5 text-blue-800">Open the hotel calendar before creating a reservation. The PMS checks live Cloudbeds room availability and blocks conflicting bookings server-side.</div></div><button onClick={()=>navigate('/calendar?new=1')} className="shrink-0 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">Create booking</button></div>
    </div>

    {status?.authorized && reservations.length===0 && !loading && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4"><div className="text-sm font-semibold text-amber-900">Front Desk is connected, but reservation details are unavailable.</div><div className="mt-1 text-xs text-amber-800">{reservationScopeMissing?'Cloudbeds did not grant Reservations READ.':'The current property binding returned no reservation rows.'}</div><button onClick={reauthorize} className="mt-3 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white">Disconnect & re-authorize</button></div>}
    {(writeState.error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${writeState.error?'border-rose-200 bg-rose-50 text-rose-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{writeState.error || notice}</div>}

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4"><MetricCard label="Arrivals" value={loading?'…':displayArrivals} helper="Today" tone="blue"/><MetricCard label="Departures" value={loading?'…':displayDepartures} helper="Today"/><MetricCard label="In house" value={loading?'…':displayInHouse} helper="Active stays" tone="green"/><MetricCard label="Missing info" value={loading?'…':missingInfo} helper="Needs review" tone={missingInfo?'amber':'green'}/></div>

    <Panel title="Guest movement" description="Actions update the real reservation status in Cloudbeds." action={<div className="flex flex-wrap gap-2">{[['today','Today'],['arrivals','Arrivals'],['departures','Departures'],['inhouse','In house']].map(([key,label])=><button key={key} onClick={()=>setView(key)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view===key?'bg-slate-900 text-white':'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</div>}>
      <div className="border-b border-slate-100 p-4"><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search guest, reservation, room, email or phone…" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500"/></div>
      {rows.length ? <TableShell><thead><tr><Th>Movement</Th><Th>Time</Th><Th>Guest</Th><Th>Room</Th><Th>Stay</Th><Th>Status</Th><Th>Info</Th><Th>Cloudbeds action</Th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((reservation)=>{
        const time=reservation.movement==='Departure'?reservation.departureTime:reservation.arrivalTime;
        const busy=writeState.syncing && activeId===reservation.id;
        const canCheckIn=reservation.status!=='in_house' && reservation.status!=='checked_out' && reservation.status!=='cancelled';
        const canCheckOut=reservation.status==='in_house' || reservation.movement==='Departure';
        return <tr key={`${reservation.movement}-${reservation.id}`} className="hover:bg-slate-50"><Td><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${reservation.movement==='Arrival'?'bg-blue-50 text-blue-700':reservation.movement==='Departure'?'bg-violet-50 text-violet-700':'bg-emerald-50 text-emerald-700'}`}>{reservation.movement}</span></Td><Td className="font-semibold text-slate-950">{formatTime(time)}</Td><Td><div className="font-semibold text-slate-950">{reservation.guestName}</div><div className="font-mono text-[11px] text-slate-500">{reservation.id}</div></Td><Td>{reservation.roomNumber||'Unassigned'}</Td><Td><div className="text-xs text-slate-700">{formatDate(reservation.arrivalDate)}</div><div className="text-[11px] text-slate-500">to {formatDate(reservation.departureDate)}</div></Td><Td><StatusBadge status={reservation.status}/></Td><Td>{(reservation.missingFields||[]).length?<span className="text-xs font-semibold text-amber-700">{(reservation.missingFields||[]).length} missing</span>:<span className="text-xs font-semibold text-emerald-700">Complete</span>}</Td><Td><div className="flex min-w-40 gap-2">{canCheckIn && <button disabled={writeState.syncing} onClick={()=>statusAction(reservation,'in_house')} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{busy?'Syncing…':'Check in'}</button>}{canCheckOut && <button disabled={writeState.syncing} onClick={()=>statusAction(reservation,'checked_out')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{busy?'Syncing…':'Check out'}</button>}</div></Td></tr>;
      })}</tbody></TableShell> : <EmptyState title="No guest movements" description="No Cloudbeds reservations match this view."/>}
    </Panel>
  </div>;
};

export default ReceptionDash;

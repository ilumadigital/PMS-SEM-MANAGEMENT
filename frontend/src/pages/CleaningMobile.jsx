import React, { useContext, useEffect, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import { EmptyState, MetricCard, PageHeader, StatusBadge } from '../components/PmsUi';

const todayKey = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

const CleaningMobile = () => {
  const { user } = useContext(AuthContext);
  const {
    housekeeping, rooms, properties, reservations, diagnostics, loading, refresh,
    updateHousekeeping, writeState,
  } = useContext(CloudbedsDataContext);
  const [filter, setFilter] = useState('all');
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [comments, setComments] = useState('');
  const [flags, setFlags] = useState({ doNotDisturb: false, refusedService: false, vacantPickup: false });
  const [notice, setNotice] = useState('');
  const role = String(user?.role || '').toLowerCase();
  const canAssign = ['admin','manager','management','cleaneradmin'].includes(role);
  const [assignmentDate,setAssignmentDate]=useState(todayKey());
  const [cleaners,setCleaners]=useState([]);
  const [assignments,setAssignments]=useState([]);
  const [assignmentError,setAssignmentError]=useState('');
  const [linensDraft,setLinensDraft]=useState({});

  const loadAssignments = async () => {
    if (!canAssign) return;
    setAssignmentError('');
    try {
      const [staffResponse, assignmentsResponse] = await Promise.all([
        api.get('/management/staff',{params:{role:'cleaner'}}),
        api.get('/management/housekeeping-assignments',{params:{from:assignmentDate,to:assignmentDate}}),
      ]);
      setCleaners(Array.isArray(staffResponse.data)?staffResponse.data:[]);
      setAssignments(Array.isArray(assignmentsResponse.data)?assignmentsResponse.data:[]);
    } catch (error) { setAssignmentError(error.response?.data?.error || error.message || 'Could not load cleaner assignments.'); }
  };

  useEffect(()=>{ loadAssignments(); },[canAssign,assignmentDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const assignCleaner = async (item, cleanerUserId) => {
    if (!cleanerUserId) return;
    const { room, propertyId, property } = roomContext(item);
    try {
      await api.post('/management/housekeeping-assignments',{
        propertyId,
        propertyName:property?.name || '',
        roomId:item.roomId,
        roomNumber:item.roomNumber || room?.roomNumber || '',
        roomType:item.roomType || room?.roomType || '',
        taskDate:assignmentDate,
        cleanerUserId,
      });
      setNotice(`Room ${item.roomNumber || item.roomId} assigned.`);
      await loadAssignments();
    } catch (error) { setAssignmentError(error.response?.data?.error || error.message || 'Could not assign cleaner.'); }
  };

  const rows = useMemo(() => {
    const source = housekeeping.length ? housekeeping : rooms.map((room) => ({
      roomId: room.id, roomNumber: room.roomNumber, roomType: room.roomType, roomCondition: '',
      roomOccupied: room.occupancyStatus === 'occupied', frontdeskStatus: room.occupancyStatus,
      housekeeper: '', comments: '', status: room.housekeepingStatus || 'not_tracked', propertyId: room.propertyId,
    }));
    if (filter === 'dirty') return source.filter((item) => item.roomCondition === 'dirty');
    if (filter === 'clean') return source.filter((item) => item.roomCondition === 'clean');
    if (filter === 'inspected') return source.filter((item) => item.roomCondition === 'inspected');
    if (filter === 'occupied') return source.filter((item) => item.roomOccupied);
    return source;
  }, [housekeeping, rooms, filter]);

  const dirty = housekeeping.filter((item) => item.roomCondition === 'dirty').length;
  const clean = housekeeping.filter((item) => item.roomCondition === 'clean').length;
  const occupied = housekeeping.filter((item) => item.roomOccupied).length;
  const missingScope = (diagnostics?.missingScopes || []).includes('read:housekeeping');

  const roomContext = (item) => {
    const room = rooms.find((candidate) => String(candidate.id) === String(item.roomId));
    const propertyId = item.propertyId || room?.propertyId;
    const property = properties.find((candidate) => String(candidate.id) === String(propertyId));
    return { room, propertyId, property };
  };

  const roomStayContext = (item) => {
    const today = todayKey();
    const tomorrowDate = new Date(`${today}T12:00:00`);
    tomorrowDate.setDate(tomorrowDate.getDate()+1);
    const tomorrow = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth()+1).padStart(2,'0')}-${String(tomorrowDate.getDate()).padStart(2,'0')}`;
    const matchesRoom = (reservation) => {
      const ids = reservation.roomIds?.length ? reservation.roomIds.map(String) : [String(reservation.roomId || '')];
      return ids.includes(String(item.roomId)) && !['cancelled','no_show'].includes(String(reservation.status || '').toLowerCase());
    };
    const related = reservations.filter(matchesRoom);
    const checkout = related.find((reservation)=>reservation.departureDate===today);
    const arrivalToday = related.find((reservation)=>reservation.arrivalDate===today);
    const arrivalTomorrow = related.find((reservation)=>reservation.arrivalDate===tomorrow);
    const inHouse = related.find((reservation)=>reservation.arrivalDate<=today && reservation.departureDate>today);
    const arrival = arrivalToday || arrivalTomorrow || inHouse || null;
    const guestReservation = arrival || checkout || null;
    return {
      checkOutTime: checkout?.actualDepartureTime || checkout?.departureTime || '',
      checkInTime: arrival?.actualArrivalTime || arrival?.arrivalTime || '',
      guestCount: guestReservation ? Number(guestReservation.roomGuestCounts?.[String(item.roomId)] || guestReservation.guestCount || 1) : null,
    };
  };

  const sync = async (item, payload, message) => {
    const { propertyId } = roomContext(item);
    if (!propertyId) { setNotice('Cannot save room status: property ID is missing for this room.'); return; }
    setSelectedRoomId(String(item.roomId)); setNotice('');
    try {
      await updateHousekeeping(item.roomId, { propertyId, ...payload });
      setNotice(message);
    } catch { /* context exposes detailed write error */ }
    finally { setSelectedRoomId(null); }
  };

  const openDetails = (item) => {
    setSelectedRoomId(String(item.roomId));
    setComments(item.comments || '');
    setFlags({
      doNotDisturb: Boolean(item.doNotDisturb),
      refusedService: Boolean(item.refusedService),
      vacantPickup: Boolean(item.vacantPickup),
    });
  };

  const saveDetails = async (item) => {
    await sync(item, { ...flags, roomComments: comments }, `Room ${item.roomNumber || item.roomId} housekeeping details synced.`);
    setSelectedRoomId(null);
  };

  return <div className="space-y-5 pb-10">
    <PageHeader title="Housekeeping" description="Dirty, Clean and Inspected are managed in SEM PMS and synced to Cloudbeds housekeeping so room readiness matches in both systems. Refill, linens and other SEM-only details stay local." actions={<button onClick={refresh} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">Refresh</button>} />

    {missingScope && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Cloudbeds has not granted <strong>Housekeeping READ</strong>. Re-authorize the app after enabling the scope.</div>}
    {(writeState.error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${writeState.error?'border-rose-200 bg-rose-50 text-rose-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{writeState.error || notice}</div>}
    {assignmentError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{assignmentError}</div>}
    {canAssign && <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-black text-slate-950">Cleaner assignments</div><div className="mt-1 text-xs text-slate-500">Choose the work date and assign each room to an active Cleaner.</div></div><input type="date" value={assignmentDate} onChange={e=>setAssignmentDate(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"/></div>}

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MetricCard label="Rooms" value={loading ? '…' : rows.length} helper="Visible" />
      <MetricCard label="Dirty" value={loading ? '…' : dirty} tone={dirty ? 'amber' : 'default'} />
      <MetricCard label="Clean" value={loading ? '…' : clean} tone="green" />
      <MetricCard label="Occupied" value={loading ? '…' : occupied} tone="blue" />
    </div>

    <div className="flex gap-2 overflow-x-auto pb-1">
      {[['all','All'],['dirty','Dirty'],['clean','Clean'],['inspected','Inspected'],['occupied','Occupied']].map(([key,label]) => <button key={key} onClick={()=>setFilter(key)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${filter===key?'bg-slate-950 text-white':'border border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}
    </div>

    {rows.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{rows.map((item) => {
      const { room, property } = roomContext(item);
      const stay = roomStayContext(item);
      const linensValue = Object.prototype.hasOwnProperty.call(linensDraft,String(item.roomId)) ? linensDraft[String(item.roomId)] : (item.extraLinens || '');
      const busy = writeState.syncing && String(selectedRoomId) === String(item.roomId);
      const expanded = String(selectedRoomId) === String(item.roomId) && !busy;
      return <article key={item.roomId || item.roomNumber} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3"><div><div className="text-xl font-black text-slate-950">Room {item.roomNumber || room?.roomNumber || '—'}</div><div className="mt-1 text-xs text-slate-500">{item.roomType || room?.roomType || 'Room'} · {property?.name || 'Cloudbeds property'}</div></div><StatusBadge status={item.roomCondition || item.status || 'not_tracked'} /></div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">Occupancy</div><div className="mt-1 font-bold text-slate-800">{item.roomOccupied?'Occupied':'Vacant'}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">Check-out</div><div className="mt-1 font-bold text-slate-800">{stay.checkOutTime ? String(stay.checkOutTime).slice(0,5) : '—'}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">Check-in</div><div className="mt-1 font-bold text-slate-800">{stay.checkInTime ? String(stay.checkInTime).slice(0,5) : '—'}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">Guests</div><div className="mt-1 font-bold text-slate-800">{stay.guestCount || '—'}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">Front desk</div><div className="mt-1 font-bold text-slate-800">{item.frontdeskStatus || '—'}</div></div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr]">
            <label className="rounded-xl border border-slate-200 bg-white p-3"><span className="mb-2 block text-[10px] font-black uppercase tracking-wide text-slate-500">Refill</span><select value={item.refill?'yes':'no'} onChange={e=>sync(item,{refill:e.target.value==='yes'},`Room ${item.roomNumber || item.roomId} refill updated.`)} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-semibold"><option value="no">No</option><option value="yes">Yes</option></select></label>
            <label className="rounded-xl border border-slate-200 bg-white p-3"><span className="mb-2 block text-[10px] font-black uppercase tracking-wide text-slate-500">Extra linens</span><input value={linensValue} onChange={e=>setLinensDraft({...linensDraft,[String(item.roomId)]:e.target.value})} onBlur={async e=>{if(e.target.value!==String(item.extraLinens||'')){await sync(item,{extraLinens:e.target.value},`Room ${item.roomNumber || item.roomId} extra linens updated.`);} setLinensDraft(current=>{const next={...current};delete next[String(item.roomId)];return next;});}} placeholder="e.g. 2 towels, 1 sheet" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"/></label>
          </div>
          {item.comments && <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{item.comments}</div>}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button disabled={writeState.syncing} onClick={()=>sync(item,{roomCondition:'dirty'},`Room ${item.roomNumber || item.roomId} marked Dirty.`)} className="min-h-12 rounded-xl border border-amber-200 bg-amber-50 px-2 text-sm font-black text-amber-800 disabled:opacity-40">Dirty</button>
            <button disabled={writeState.syncing} onClick={()=>sync(item,{roomCondition:'clean'},`Room ${item.roomNumber || item.roomId} marked Clean.`)} className="min-h-12 rounded-xl border border-emerald-200 bg-emerald-50 px-2 text-sm font-black text-emerald-800 disabled:opacity-40">Clean</button>
            <button disabled={writeState.syncing} onClick={()=>sync(item,{roomCondition:'inspected'},`Room ${item.roomNumber || item.roomId} marked Inspected.`)} className="min-h-12 rounded-xl bg-slate-950 px-2 text-sm font-black text-white disabled:opacity-40">Inspected</button>
          </div>
          {canAssign && (()=>{ const assignment=assignments.find(a=>String(a.room_id)===String(item.roomId)&&String(a.task_date).slice(0,10)===assignmentDate); return <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3"><div className="mb-2 text-[10px] font-black uppercase tracking-wide text-blue-700">Assigned cleaner · {assignmentDate}</div><select value={assignment?.cleaner_user_id ? String(assignment.cleaner_user_id) : ''} onChange={e=>assignCleaner(item,e.target.value)} className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"><option value="">Select cleaner…</option>{cleaners.map(cleaner=><option key={cleaner.id} value={cleaner.id}>{cleaner.name}</option>)}</select>{assignment&&<div className="mt-2 text-xs text-blue-800">Current: <strong>{assignment.cleaner_name}</strong> · {assignment.status}</div>}</div>; })()}
          <button onClick={()=>expanded?setSelectedRoomId(null):openDetails(item)} className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50">{expanded?'Close details':'DND · Refused · Pickup · Comments'}</button>
        </div>
        {expanded && <div className="border-t border-slate-100 bg-slate-50 p-4 sm:p-5"><div className="grid gap-2">{[
          ['doNotDisturb','Do not disturb'],['refusedService','Refused service'],['vacantPickup','Vacant pickup'],
        ].map(([key,label]) => <label key={key} className="flex min-h-11 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"><span>{label}</span><input type="checkbox" checked={flags[key]} onChange={(e)=>setFlags({...flags,[key]:e.target.checked})} className="h-5 w-5" /></label>)}</div><label className="mt-3 block"><span className="mb-1.5 block text-xs font-bold text-slate-500">Room comments</span><textarea rows={3} value={comments} onChange={(e)=>setComments(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-blue-500" placeholder="Maintenance issue, guest note, cleaning detail…" /></label><button onClick={()=>saveDetails(item)} className="mt-3 min-h-12 w-full rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700">Save details in SEM PMS</button></div>}
        {busy && <div className="border-t border-blue-100 bg-blue-50 px-4 py-3 text-center text-xs font-bold text-blue-700">Saving in SEM PMS…</div>}
      </article>;
    })}</div> : <EmptyState title="No housekeeping data" description="No local housekeeping rows match this view." />}
  </div>;
};

export default CleaningMobile;

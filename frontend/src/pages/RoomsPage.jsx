import React, { useContext, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import { AuthContext } from '../context/AuthContext';
import { EmptyState, MetricCard, PageHeader, Panel, StatusBadge, TableShell, Td, Th, formatDate } from '../components/PmsUi';

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500';
const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

const RoomsPage = () => {
  const { user } = useContext(AuthContext);
  const {
    rooms, properties, reservations, housekeeping, diagnostics, loading, error, status, refresh,
    updateHousekeeping, createRoomBlock, writeState,
  } = useContext(CloudbedsDataContext);
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [comments, setComments] = useState('');
  const [notice, setNotice] = useState('');
  const [block, setBlock] = useState({ roomBlockType: 'out_of_service', reason: '', startDate: today(), endDate: tomorrow() });

  const canBlock = false; // Cloudbeds is intentionally read-only in phase 1.

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rooms.map((room) => {
      const property = properties.find((item) => item.id === room.propertyId);
      const roomReservations = reservations.filter((reservation) => {
        const ids = reservation.roomIds?.length ? reservation.roomIds.map(String) : [String(reservation.roomId || '')];
        return ids.includes(String(room.id));
      }).sort((a,b)=>String(a.arrivalDate||'').localeCompare(String(b.arrivalDate||'')));
      const nextReservation = roomReservations.find((reservation)=>reservation.id===room.nextArrivalBookingId) || roomReservations.find((reservation)=>reservation.arrivalDate && reservation.arrivalDate>=today() && reservation.status!=='cancelled') || null;
      const hk = room.housekeeping || housekeeping.find((item)=>String(item.roomId)===String(room.id)) || null;
      return { ...room, property, nextReservation, housekeeping: hk };
    }).filter((room) => {
      if (propertyFilter !== 'all' && room.propertyId !== propertyFilter) return false;
      if (!term) return true;
      return [room.roomNumber, room.roomType, room.property?.name, room.currentGuest, room.housekeeping?.status].filter(Boolean).some((value)=>String(value).toLowerCase().includes(term));
    });
  }, [rooms, properties, reservations, housekeeping, propertyFilter, search]);

  const selected = rows.find((room)=>String(room.id)===String(selectedId)) || rows[0] || null;
  const occupied = rooms.filter((room)=>['occupied','checkout_today'].includes(room.occupancyStatus)).length;
  const dirty = housekeeping.filter((item)=>item.roomCondition==='dirty').length;
  const clean = housekeeping.filter((item)=>item.roomCondition==='clean').length;
  const missingRoomScope = (diagnostics?.missingScopes || []).includes('read:room');

  const select = (room) => {
    setSelectedId(room.id);
    setComments(room.housekeeping?.comments || '');
    setNotice('');
  };

  const syncHousekeeping = async (condition) => {
    if (!selected?.propertyId) return;
    setNotice('');
    try {
      await updateHousekeeping(selected.id, { propertyId: selected.propertyId, roomCondition: condition, roomComments: comments });
      setNotice(`Room ${selected.roomNumber || selected.id} marked ${condition} in SEM PMS.`);
    } catch { /* writeState shows error */ }
  };

  const saveComments = async () => {
    if (!selected?.propertyId) return;
    setNotice('');
    try {
      await updateHousekeeping(selected.id, { propertyId: selected.propertyId, roomComments: comments });
      setNotice('Room comments saved in SEM PMS.');
    } catch { /* context error */ }
  };

  const createBlock = async () => {
    if (!selected?.propertyId || !block.reason) return;
    if (!window.confirm(`Create ${block.roomBlockType.replaceAll('_',' ')} for Room ${selected.roomNumber || selected.id} in Cloudbeds?`)) return;
    setNotice('');
    try {
      await createRoomBlock({
        propertyId: selected.propertyId,
        roomBlockType: block.roomBlockType,
        roomBlockReason: block.reason,
        startDate: block.startDate,
        endDate: block.endDate,
        rooms: [{ roomId: selected.id, roomTypeId: selected.roomTypeId }],
      });
      setNotice('Room block created in Cloudbeds.');
      setBlock((current)=>({ ...current, reason: '' }));
    } catch { /* context error */ }
  };

  return <div className="space-y-6">
    <PageHeader title="Rooms" description="Cloudbeds provides room and reservation inventory. Housekeeping state is owned entirely by SEM PMS and is never written back to Cloudbeds." actions={status?.connected?<button onClick={refresh} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">Refresh Cloudbeds</button>:<span className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-700">Administrator connection required</span>} />
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
    {missingRoomScope && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Cloudbeds has not granted <strong>Rooms READ</strong>. Re-authorize after enabling the scope.</div>}
    {(writeState.error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${writeState.error?'border-rose-200 bg-rose-50 text-rose-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{writeState.error || notice}</div>}

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <MetricCard label="Rooms" value={loading?'…':rooms.length} helper="Read-only inventory" />
      <MetricCard label="Occupied" value={loading?'…':occupied} tone="blue" />
      <MetricCard label="Dirty" value={loading?'…':dirty} tone={dirty?'amber':'default'} />
      <MetricCard label="Clean" value={loading?'…':clean} tone="green" />
    </div>

    <div className="grid gap-5 2xl:grid-cols-[1fr_390px]">
      <Panel title="Room overview" description="Select a room to update its operational state.">
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_240px]">
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search room, type, guest or property…" className={inputClass}/>
          <select value={propertyFilter} onChange={(e)=>setPropertyFilter(e.target.value)} className={inputClass}><option value="all">All properties</option>{properties.map((property)=><option key={property.id} value={property.id}>{property.name}</option>)}</select>
        </div>
        {rows.length ? <TableShell><thead><tr><Th>Room</Th><Th>Room type</Th><Th>Property</Th><Th>Occupancy</Th><Th>Current guest</Th><Th>Housekeeping</Th><Th>Next arrival</Th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((room)=><tr key={room.id} onClick={()=>select(room)} className={`cursor-pointer hover:bg-slate-50 ${String(selected?.id)===String(room.id)?'bg-blue-50/60':''}`}><Td><div className="font-semibold text-slate-950">{room.roomNumber || room.id}</div><div className="mt-0.5 font-mono text-[11px] text-slate-500">{room.id}</div></Td><Td>{room.roomType || '—'}</Td><Td>{room.property?.name || 'Cloudbeds property'}</Td><Td><StatusBadge status={room.occupancyStatus || 'unknown'}/></Td><Td>{room.currentGuest || '—'}</Td><Td><StatusBadge status={room.housekeeping?.status || room.housekeepingStatus || 'not_tracked'}/></Td><Td>{room.nextReservation?<div><div className="font-medium text-slate-900">{room.nextReservation.guestName}</div><div className="text-xs text-slate-500">{formatDate(room.nextReservation.arrivalDate)}</div></div>:'—'}</Td></tr>)}</tbody></TableShell> : <EmptyState title="No rooms returned" description={status?.connected?'Cloudbeds did not return room inventory.':'Connect Cloudbeds to load rooms.'}/>} 
      </Panel>

      <div className="space-y-5">
        <Panel title="Room operations" description="Local housekeeping status in SEM PMS.">{selected ? <div className="space-y-4 p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-xl font-black text-slate-950">Room {selected.roomNumber || selected.id}</div><div className="mt-1 text-xs text-slate-500">{selected.roomType || 'Room'} · {selected.property?.name || 'Cloudbeds property'}</div></div><StatusBadge status={selected.housekeeping?.status || selected.housekeepingStatus}/></div><div className="grid grid-cols-3 gap-2"><button onClick={()=>syncHousekeeping('dirty')} disabled={writeState.syncing} className="rounded-xl border border-amber-200 bg-amber-50 px-2 py-3 text-sm font-black text-amber-800 disabled:opacity-40">Dirty</button><button onClick={()=>syncHousekeeping('clean')} disabled={writeState.syncing} className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-3 text-sm font-black text-emerald-800 disabled:opacity-40">Clean</button><button onClick={()=>syncHousekeeping('inspected')} disabled={writeState.syncing} className="rounded-xl bg-slate-950 px-2 py-3 text-sm font-black text-white disabled:opacity-40">Inspected</button></div><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-500">SEM PMS room comments</span><textarea rows={3} value={comments} onChange={(e)=>setComments(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-500" /></label><button onClick={saveComments} disabled={writeState.syncing} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-700">Save comments</button>{writeState.syncing && <div className="text-center text-xs font-bold text-blue-700">Saving locally…</div>}</div> : <EmptyState title="Select a room"/>}</Panel>

        {canBlock && selected && <Panel title="Room block" description="Create blocked dates, out-of-service or courtesy hold in Cloudbeds."><div className="space-y-3 p-5"><label><span className="mb-1.5 block text-xs font-bold text-slate-500">Block type</span><select value={block.roomBlockType} onChange={(e)=>setBlock({...block,roomBlockType:e.target.value})} className={inputClass}><option value="out_of_service">Out of service</option><option value="blocked_dates">Blocked dates</option><option value="courtesy_hold">Courtesy hold</option></select></label><label><span className="mb-1.5 block text-xs font-bold text-slate-500">Reason</span><input value={block.reason} onChange={(e)=>setBlock({...block,reason:e.target.value})} className={inputClass} placeholder="Maintenance, owner stay, hold…"/></label><div className="grid grid-cols-2 gap-3"><label><span className="mb-1.5 block text-xs font-bold text-slate-500">Start</span><input type="date" value={block.startDate} onChange={(e)=>setBlock({...block,startDate:e.target.value})} className={inputClass}/></label><label><span className="mb-1.5 block text-xs font-bold text-slate-500">End</span><input type="date" value={block.endDate} onChange={(e)=>setBlock({...block,endDate:e.target.value})} className={inputClass}/></label></div><button onClick={createBlock} disabled={writeState.syncing || !block.reason} className="w-full rounded-lg bg-rose-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-40">Create block in Cloudbeds</button><div className="text-[11px] leading-5 text-slate-500">Delete permissions are intentionally not used. Blocks can be updated from Cloudbeds or a later controlled edit flow.</div></div></Panel>}
      </div>
    </div>
  </div>;
};

export default RoomsPage;

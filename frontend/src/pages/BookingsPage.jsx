import React, { useContext, useEffect, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import {
  EmptyState, MetricCard, PageHeader, Panel, StatusBadge, TableShell, Td, Th,
  formatDate, formatMoney,
} from '../components/PmsUi';

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500';
const labelClass = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500';

const BookingsPage = () => {
  const cloudbeds = useContext(CloudbedsDataContext);
  const { user } = useContext(AuthContext);
  const {
    reservations, properties, rooms, diagnostics, loading, status, error, refresh, connect, reauthorize,
    writeState, clearWriteState, updateReservation, assignRoom, updateGuest, postCustomCharge,
  } = cloudbeds;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [sendingInstructions, setSendingInstructions] = useState(false);
  const [instructionResult, setInstructionResult] = useState(null);
  const [instructionError, setInstructionError] = useState('');
  const [edit, setEdit] = useState({ arrivalTime: '', departureDate: '', status: 'confirmed' });
  const [newRoomId, setNewRoomId] = useState('');
  const [adjustPrice, setAdjustPrice] = useState(false);
  const [guestEdit, setGuestEdit] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [charge, setCharge] = useState({ name: '', category: 'SEM Services', price: '', quantity: 1, note: '' });
  const [localNotice, setLocalNotice] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reservations.filter((reservation) => {
      const searchMatch = !term || [reservation.id, reservation.guestName, reservation.guestEmail, reservation.guestPhone, reservation.roomNumber, reservation.roomType, reservation.cloudbedsSource]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
      return searchMatch && (statusFilter === 'all' || reservation.status === statusFilter) && (propertyFilter === 'all' || reservation.propertyId === propertyFilter);
    });
  }, [reservations, search, statusFilter, propertyFilter]);

  const selected = reservations.find((reservation) => reservation.id === selectedId) || filtered[0] || null;
  const selectedRoom = rooms.find((room) => String(room.id) === String(selected?.roomId));
  const propertyRooms = rooms.filter((room) => !selected || String(room.propertyId) === String(selected.propertyId));
  const canEditGuest = ['admin', 'management', 'reception'].includes(String(user?.role || '').toLowerCase());
  const canCharge = canEditGuest;

  useEffect(() => {
    if (!selected) return;
    const parts = String(selected.guestName || '').trim().split(/\s+/);
    setEdit({ arrivalTime: String(selected.arrivalTime || '').slice(0, 5), departureDate: selected.departureDate || '', status: selected.status || 'confirmed' });
    setNewRoomId(selected.roomId && !String(selected.roomId).startsWith('cloudbeds-unassigned-') ? String(selected.roomId) : '');
    setAdjustPrice(false);
    setGuestEdit({ firstName: parts[0] || '', lastName: parts.slice(1).join(' '), email: selected.guestEmail || '', phone: selected.guestPhone || '' });
    setLocalNotice('');
    clearWriteState();
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmed = reservations.filter((item) => item.status === 'confirmed').length;
  const inHouse = reservations.filter((item) => item.status === 'in_house').length;
  const cancelled = reservations.filter((item) => item.status === 'cancelled').length;

  const selectReservation = (reservationId) => {
    setSelectedId(reservationId); setInstructionResult(null); setInstructionError(''); setLocalNotice('');
  };

  const run = async (fn, success) => {
    setLocalNotice('');
    try { await fn(); setLocalNotice(success); }
    catch { /* writeState contains the Cloudbeds error */ }
  };

  const changeStatus = (nextStatus) => {
    if (!selected) return;
    const destructive = ['cancelled', 'no_show'].includes(nextStatus);
    if (destructive && !window.confirm(`Set reservation ${selected.id} to ${nextStatus.replace('_', ' ')} in Cloudbeds?`)) return;
    run(() => updateReservation(selected.id, { propertyId: selected.propertyId, status: nextStatus }), `Reservation status synced to Cloudbeds: ${nextStatus.replace('_', ' ')}.`);
  };

  const saveReservationDetails = () => {
    if (!selected) return;
    run(() => updateReservation(selected.id, {
      propertyId: selected.propertyId,
      arrivalTime: edit.arrivalTime,
      departureDate: edit.departureDate,
    }), 'Arrival time and checkout date synced to Cloudbeds.');
  };

  const saveRoomAssignment = () => {
    if (!selected || !newRoomId) return;
    const room = rooms.find((item) => String(item.id) === String(newRoomId));
    if (!room) return;
    const oldRoomId = selected.roomId && !String(selected.roomId).startsWith('cloudbeds-unassigned-') ? selected.roomId : null;
    run(() => assignRoom(selected.id, {
      propertyId: selected.propertyId,
      newRoomId,
      oldRoomId: oldRoomId && String(oldRoomId) !== String(newRoomId) ? oldRoomId : undefined,
      roomTypeId: room.roomTypeId || selectedRoom?.roomTypeId || undefined,
      adjustPrice,
    }), `Room assignment synced to Cloudbeds: ${room.roomNumber || room.id}.`);
  };

  const saveGuest = () => {
    if (!selected?.guestId) return;
    run(() => updateGuest(selected.guestId, {
      propertyId: selected.propertyId,
      firstName: guestEdit.firstName,
      lastName: guestEdit.lastName,
      email: guestEdit.email,
      phone: guestEdit.phone,
      cellPhone: guestEdit.phone,
    }), 'Guest profile synced to Cloudbeds.');
  };

  const postCharge = () => {
    if (!selected || !charge.name || charge.price === '') return;
    if (!window.confirm(`Post ${charge.name} (€${Number(charge.price).toFixed(2)}) to the Cloudbeds reservation folio?`)) return;
    run(async () => {
      await postCustomCharge(selected.id, {
        propertyId: selected.propertyId,
        roomId: selected.roomId,
        guestId: selected.guestId,
        itemName: charge.name,
        itemCategoryName: charge.category,
        itemPrice: Number(charge.price),
        itemQuantity: Number(charge.quantity || 1),
        itemNote: charge.note,
      });
      setCharge({ name: '', category: 'SEM Services', price: '', quantity: 1, note: '' });
    }, 'Custom item posted to the Cloudbeds folio.');
  };

  const sendInstructions = async () => {
    if (!selected?.guestEmail) { setInstructionError('This reservation does not have a guest email in Cloudbeds.'); return; }
    if (!window.confirm(`Send the secure online check-in link to ${selected.guestEmail}?`)) return;
    setSendingInstructions(true); setInstructionResult(null); setInstructionError('');
    try {
      const response = await api.post(`/guest-portal/reservations/${selected.id}/send-instructions`);
      setInstructionResult(response.data.data);
    } catch (requestError) { setInstructionError(requestError.response?.data?.message || 'Guest instructions could not be sent.'); }
    finally { setSendingInstructions(false); }
  };

  const copyPortalLink = async () => {
    if (!instructionResult?.portalUrl) return;
    try { await navigator.clipboard.writeText(instructionResult.portalUrl); }
    catch { window.prompt('Copy guest portal link:', instructionResult.portalUrl); }
  };

  return <div className="space-y-6">
    <PageHeader title="Reservations" description="Cloudbeds is the source of truth. Changes made here are written back and then re-fetched for verification." actions={<button onClick={status?.connected ? refresh : status?.authorized ? reauthorize : connect} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">{status?.connected ? 'Refresh Cloudbeds' : status?.authorized ? 'Re-authorize Cloudbeds' : 'Connect Cloudbeds'}</button>} />

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"><div className="text-sm font-semibold text-rose-800">Cloudbeds sync issue</div><div className="mt-1 text-xs text-rose-700">{error}</div></div>}
    {status?.authorized && !loading && reservations.length === 0 && !error && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4"><div className="text-sm font-semibold text-amber-900">Cloudbeds is authorized but returned no reservation rows.</div><div className="mt-1 text-xs text-amber-800">{(diagnostics?.missingScopes || []).length ? `Missing permissions: ${diagnostics.missingScopes.join(', ')}.` : 'Re-authorize after changing Partner App scopes.'}</div></div>}

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <MetricCard label="Total" value={loading ? '…' : reservations.length} helper="Cloudbeds records" />
      <MetricCard label="Confirmed" value={loading ? '…' : confirmed} tone="green" />
      <MetricCard label="In house" value={loading ? '…' : inHouse} tone="blue" />
      <MetricCard label="Cancelled" value={loading ? '…' : cancelled} tone={cancelled ? 'rose' : 'default'} />
    </div>

    <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1fr_430px]">
      <Panel title="Reservation list" description="Select a booking to operate it directly in Cloudbeds.">
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_180px_220px_auto]">
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search reservation, guest, email, phone or room…" className={inputClass} />
          <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)} className={inputClass}><option value="all">All statuses</option><option value="confirmed">Confirmed</option><option value="in_house">In house</option><option value="pending_confirmation">Pending</option><option value="no_show">No show</option><option value="checked_out">Checked out</option><option value="cancelled">Cancelled</option></select>
          <select value={propertyFilter} onChange={(e)=>setPropertyFilter(e.target.value)} className={inputClass}><option value="all">All properties</option>{properties.map((property)=><option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <button onClick={()=>{setSearch('');setStatusFilter('all');setPropertyFilter('all');}} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</button>
        </div>
        {filtered.length ? <TableShell><thead><tr><Th>Reservation</Th><Th>Guest</Th><Th>Check-in</Th><Th>Check-out</Th><Th>Room</Th><Th>Status</Th><Th>Source</Th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((reservation)=><tr key={reservation.id} onClick={()=>selectReservation(reservation.id)} className={`cursor-pointer hover:bg-slate-50 ${selected?.id===reservation.id?'bg-blue-50/60':''}`}><Td className="font-mono text-xs font-semibold text-slate-800">{reservation.id}</Td><Td><div className="font-semibold text-slate-950">{reservation.guestName}</div><div className="mt-0.5 text-xs text-slate-500">{reservation.guestEmail || reservation.guestPhone || 'No contact details'}</div></Td><Td>{formatDate(reservation.arrivalDate)}{reservation.arrivalTime && <div className="text-xs text-slate-500">{String(reservation.arrivalTime).slice(0,5)}</div>}</Td><Td>{formatDate(reservation.departureDate)}</Td><Td><div className="font-semibold text-slate-900">{reservation.roomNumber || 'Unassigned'}</div><div className="text-xs text-slate-500">{reservation.roomType || '—'}</div></Td><Td><StatusBadge status={reservation.status}/></Td><Td>{reservation.cloudbedsSource || 'Cloudbeds'}</Td></tr>)}</tbody></TableShell> : <EmptyState title="No reservations found" description={status?.authorized?'Try changing the filters.':'Connect Cloudbeds to load reservations.'} />}
      </Panel>

      <div className="space-y-5">
        <Panel title="Reservation control" description="Every action below is sent to Cloudbeds.">
          {selected ? <div className="space-y-5 p-5">
            <div className="flex items-start justify-between gap-3"><div><div className="text-lg font-bold text-slate-950">{selected.guestName}</div><div className="mt-1 font-mono text-xs text-slate-500">{selected.id}</div></div><StatusBadge status={selected.status}/></div>

            {(writeState.syncing || writeState.error || localNotice) && <div className={`rounded-xl border px-3 py-3 text-xs font-semibold ${writeState.error?'border-rose-200 bg-rose-50 text-rose-700':writeState.syncing?'border-blue-200 bg-blue-50 text-blue-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{writeState.error || (writeState.syncing ? 'Syncing change to Cloudbeds…' : localNotice)}</div>}

            <section><div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Reservation status</div><div className="grid grid-cols-2 gap-2"><Action onClick={()=>changeStatus('confirmed')} disabled={writeState.syncing}>Confirm</Action><Action onClick={()=>changeStatus('in_house')} disabled={writeState.syncing} tone="blue">Check in</Action><Action onClick={()=>changeStatus('checked_out')} disabled={writeState.syncing} tone="green">Check out</Action><Action onClick={()=>changeStatus('no_show')} disabled={writeState.syncing}>No show</Action><button onClick={()=>changeStatus('cancelled')} disabled={writeState.syncing || selected.status==='cancelled'} className="col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-40">Cancel reservation</button></div></section>

            <section className="border-t border-slate-100 pt-4"><div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Stay details</div><div className="grid grid-cols-2 gap-3"><label><span className={labelClass}>Arrival time</span><input type="time" value={edit.arrivalTime} onChange={(e)=>setEdit({...edit,arrivalTime:e.target.value})} className={inputClass}/></label><label><span className={labelClass}>Checkout date</span><input type="date" value={edit.departureDate} onChange={(e)=>setEdit({...edit,departureDate:e.target.value})} className={inputClass}/></label></div><button onClick={saveReservationDetails} disabled={writeState.syncing} className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white hover:bg-slate-950 disabled:opacity-50">Save to Cloudbeds</button></section>

            <section className="border-t border-slate-100 pt-4"><div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Room assignment</div><select value={newRoomId} onChange={(e)=>setNewRoomId(e.target.value)} className={inputClass}><option value="">Select room…</option>{propertyRooms.map((room)=><option key={room.id} value={room.id}>{room.roomNumber || room.id} · {room.roomType || 'Room'}{room.occupancyStatus==='occupied'?' · occupied':''}</option>)}</select><label className="mt-3 flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" className="mt-0.5" checked={adjustPrice} onChange={(e)=>setAdjustPrice(e.target.checked)}/><span>Allow Cloudbeds to adjust price if this room change causes an upcharge or discount.</span></label><button onClick={saveRoomAssignment} disabled={writeState.syncing || !newRoomId || String(newRoomId)===String(selected.roomId)} className="mt-3 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-40">Assign / reassign in Cloudbeds</button></section>

            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4"><Detail label="Check-in" value={formatDate(selected.arrivalDate)}/><Detail label="Check-out" value={formatDate(selected.departureDate)}/><Detail label="Room" value={selected.roomNumber || 'Unassigned'}/><Detail label="Total" value={formatMoney(selected.totalPrice)}/></div>
          </div> : <EmptyState title="Select a reservation" />}
        </Panel>

        {selected && canEditGuest && <Panel title="Guest profile" description="Write contact changes back to Cloudbeds Guest."><div className="grid grid-cols-2 gap-3 p-5"><Field label="First name" value={guestEdit.firstName} onChange={(v)=>setGuestEdit({...guestEdit,firstName:v})}/><Field label="Last name" value={guestEdit.lastName} onChange={(v)=>setGuestEdit({...guestEdit,lastName:v})}/><div className="col-span-2"><Field label="Email" value={guestEdit.email} onChange={(v)=>setGuestEdit({...guestEdit,email:v})}/></div><div className="col-span-2"><Field label="Phone" value={guestEdit.phone} onChange={(v)=>setGuestEdit({...guestEdit,phone:v})}/></div><button onClick={saveGuest} disabled={!selected.guestId || writeState.syncing} className="col-span-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40">Update guest in Cloudbeds</button>{!selected.guestId && <div className="col-span-2 text-xs text-amber-700">Cloudbeds guest ID is not available for this record.</div>}</div></Panel>}

        {selected && canCharge && <Panel title="Folio item" description="Post an unpaid custom item directly to this Cloudbeds reservation."><div className="space-y-3 p-5"><Field label="Item / service" value={charge.name} onChange={(v)=>setCharge({...charge,name:v})}/><div className="grid grid-cols-2 gap-3"><Field label="Category" value={charge.category} onChange={(v)=>setCharge({...charge,category:v})}/><Field label="Price" type="number" value={charge.price} onChange={(v)=>setCharge({...charge,price:v})}/><Field label="Quantity" type="number" value={charge.quantity} onChange={(v)=>setCharge({...charge,quantity:v})}/><Field label="Note" value={charge.note} onChange={(v)=>setCharge({...charge,note:v})}/></div><button onClick={postCharge} disabled={writeState.syncing || !charge.name || charge.price===''} className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">Post to Cloudbeds folio</button><div className="text-[11px] leading-5 text-slate-500">No payment is recorded. The item remains payable in Cloudbeds.</div></div></Panel>}

        {selected && <Panel title="Guest Experience" description="Secure online check-in and guest portal."><div className="p-5"><button onClick={sendInstructions} disabled={sendingInstructions || !selected.guestEmail || selected.status==='cancelled'} className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50">{sendingInstructions?'Sending…':'Send Instructions'}</button>{instructionError && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{instructionError}</div>}{instructionResult && <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3"><div className="text-xs font-bold text-emerald-700">{instructionResult.emailSent?'Email sent successfully.':'Secure link created.'}</div><div className="mt-2 break-all text-[11px] text-slate-500">{instructionResult.portalUrl}</div><button onClick={copyPortalLink} className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Copy link</button></div>}</div></Panel>}
      </div>
    </div>
  </div>;
};

const Action = ({ children, tone='default', ...props }) => <button {...props} className={`rounded-lg px-3 py-2.5 text-sm font-bold disabled:opacity-40 ${tone==='blue'?'bg-blue-600 text-white hover:bg-blue-700':tone==='green'?'bg-emerald-600 text-white hover:bg-emerald-700':'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{children}</button>;
const Field = ({ label, value, onChange, type='text' }) => <label><span className={labelClass}>{label}</span><input type={type} value={value ?? ''} onChange={(e)=>onChange(e.target.value)} className={inputClass}/></label>;
const Detail = ({ label, value }) => <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-sm font-semibold text-slate-900">{value || '—'}</div></div>;

export default BookingsPage;

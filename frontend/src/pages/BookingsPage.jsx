import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import {
  EmptyState, MetricCard, PageHeader, Panel, StatusBadge, TableShell, Td, Th,
  formatDate, formatMoney,
} from '../components/PmsUi';

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelClass = 'mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-slate-500';
const pick = (object, keys, fallback = '') => {
  for (const key of keys) {
    const value = String(key).split('.').reduce((current, part) => current?.[part], object);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
};
const uniqueRooms = (list) => [...new Map(list.filter(Boolean).map((room) => [String(room.id), room])).values()];

const BookingsPage = () => {
  const navigate = useNavigate();
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
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [sendingInstructions, setSendingInstructions] = useState(false);
  const [instructionResult, setInstructionResult] = useState(null);
  const [instructionError, setInstructionError] = useState('');
  const [edit, setEdit] = useState({ startDate: '', endDate: '', arrivalTime: '', adults: 1, children: 0 });
  const [newRoomId, setNewRoomId] = useState('');
  const [adjustPrice, setAdjustPrice] = useState(false);
  const [availability, setAvailability] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [guestEdit, setGuestEdit] = useState({
    firstName: '', lastName: '', gender: '', email: '', phone: '', address1: '', address2: '',
    city: '', state: '', zip: '', country: '', nationality: '', birthDate: '', documentType: '',
    documentNumber: '', documentIssueDate: '', documentIssuingCountry: '', documentExpirationDate: '',
  });
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
  const canEditGuest = ['admin', 'management', 'reception'].includes(String(user?.role || '').toLowerCase());
  const canCharge = canEditGuest;

  useEffect(() => {
    if (!selected) return;
    setEdit({
      startDate: selected.arrivalDate || '',
      endDate: selected.departureDate || '',
      arrivalTime: String(selected.arrivalTime || '').slice(0, 5),
      adults: 1,
      children: 0,
    });
    setNewRoomId(selected.roomId && !String(selected.roomId).startsWith('cloudbeds-unassigned-') ? String(selected.roomId) : '');
    setAdjustPrice(false);
    setLocalNotice(''); setDetails(null); setDetailsError(''); setAvailability(null); clearWriteState();
    const parts = String(selected.guestName || '').trim().split(/\s+/);
    setGuestEdit((current) => ({ ...current, firstName: parts[0] || '', lastName: parts.slice(1).join(' '), email: selected.guestEmail || '', phone: selected.guestPhone || '' }));

    let active = true;
    setDetailsLoading(true);
    api.get(`/integrations/cloudbeds/operations/reservations/${selected.id}/details`, { params: { propertyId: selected.propertyId, guestId: selected.guestId || undefined } })
      .then((response) => {
        if (!active) return;
        const data = response.data?.data || null;
        setDetails(data);
        const assignment = data?.assignments?.[0];
        const reservation = data?.reservation || {};
        const guest = data?.guest || {};
        setEdit({
          startDate: String(pick(reservation, ['startDate', 'checkInDate'], selected.arrivalDate || '')).slice(0, 10),
          endDate: String(pick(reservation, ['endDate', 'checkOutDate'], selected.departureDate || '')).slice(0, 10),
          arrivalTime: String(pick(reservation, ['estimatedArrivalTime', 'arrivalTime'], selected.arrivalTime || '')).slice(0, 5),
          adults: Number(assignment?.adults || pick(reservation, ['adults'], 1) || 1),
          children: Number(assignment?.children || pick(reservation, ['children'], 0) || 0),
        });
        if (assignment?.roomId) setNewRoomId(String(assignment.roomId));
        setGuestEdit({
          firstName: String(pick(guest, ['guestFirstName', 'firstName'], parts[0] || '')),
          lastName: String(pick(guest, ['guestLastName', 'lastName'], parts.slice(1).join(' '))),
          gender: String(pick(guest, ['guestGender', 'gender'], '')),
          email: String(pick(guest, ['guestEmail', 'email'], selected.guestEmail || '')),
          phone: String(pick(guest, ['guestCellPhone', 'guestPhone', 'phone'], selected.guestPhone || '')),
          address1: String(pick(guest, ['guestAddress1', 'address1'], '')),
          address2: String(pick(guest, ['guestAddress2', 'address2'], '')),
          city: String(pick(guest, ['guestCity', 'city'], '')),
          state: String(pick(guest, ['guestState', 'state'], '')),
          zip: String(pick(guest, ['guestZip', 'zip'], '')),
          country: String(pick(guest, ['guestCountry', 'country'], '')),
          nationality: String(pick(guest, ['guestNationality', 'nationality'], '')),
          birthDate: String(pick(guest, ['guestBirthDate', 'birthDate'], '')).slice(0, 10),
          documentType: String(pick(guest, ['guestDocumentType', 'documentType'], '')),
          documentNumber: String(pick(guest, ['guestDocumentNumber', 'documentNumber'], '')),
          documentIssueDate: String(pick(guest, ['guestDocumentIssueDate', 'documentIssueDate'], '')).slice(0, 10),
          documentIssuingCountry: String(pick(guest, ['guestDocumentIssuingCountry', 'documentIssuingCountry'], '')),
          documentExpirationDate: String(pick(guest, ['guestDocumentExpirationDate', 'documentExpirationDate'], '')).slice(0, 10),
        });
      })
      .catch((requestError) => active && setDetailsError(requestError.response?.data?.message || requestError.message || 'Could not load complete Cloudbeds reservation.'))
      .finally(() => active && setDetailsLoading(false));
    return () => { active = false; };
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected?.propertyId || !edit.startDate || !edit.endDate || edit.startDate >= edit.endDate) { setAvailability(null); return; }
    const timer = window.setTimeout(async () => {
      setAvailabilityLoading(true);
      try {
        const response = await api.get('/integrations/cloudbeds/operations/availability', {
          params: {
            propertyId: selected.propertyId,
            startDate: edit.startDate,
            endDate: edit.endDate,
            adults: edit.adults,
            children: edit.children,
            roomId: newRoomId || selected.roomId || undefined,
            excludeReservationId: selected.id,
          },
        });
        setAvailability(response.data?.data || null);
      } catch (requestError) {
        setAvailability({ roomAvailable: false, availableRooms: [], inventory: [], conflicts: requestError.response?.data?.details?.conflicts || [], error: requestError.response?.data?.message || requestError.message });
      } finally { setAvailabilityLoading(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [selected?.id, selected?.propertyId, selected?.roomId, edit.startDate, edit.endDate, edit.adults, edit.children, newRoomId]);

  const confirmed = reservations.filter((item) => item.status === 'confirmed').length;
  const inHouse = reservations.filter((item) => item.status === 'in_house').length;
  const cancelled = reservations.filter((item) => item.status === 'cancelled').length;
  const selectedAssignment = details?.assignments?.find((item) => String(item.roomId) === String(selected?.roomId)) || details?.assignments?.[0] || null;
  const liveInventory = availability?.inventory || [];
  const currentLiveRoom = liveInventory.find((room) => String(room.id) === String(selectedAssignment?.roomId || selected?.roomId)) || selectedRoom;
  const roomOptions = uniqueRooms([currentLiveRoom, ...(availability?.availableRooms || [])]);
  const targetRoom = roomOptions.find((room) => String(room.id) === String(newRoomId));
  const targetAvailable = !newRoomId || String(newRoomId) === String(selectedAssignment?.roomId || selected?.roomId)
    ? availability?.roomAvailable !== false
    : availability?.roomAvailable === true;

  const selectReservation = (reservationId) => {
    setSelectedId(reservationId); setInstructionResult(null); setInstructionError(''); setLocalNotice('');
  };
  const run = async (fn, success) => {
    setLocalNotice('');
    try { await fn(); setLocalNotice(success); }
    catch { /* Cloudbeds error is surfaced by writeState */ }
  };
  const changeStatus = (nextStatus) => {
    if (!selected) return;
    if (['cancelled', 'no_show'].includes(nextStatus) && !window.confirm(`Set reservation ${selected.id} to ${nextStatus.replace('_', ' ')} in Cloudbeds?`)) return;
    run(() => updateReservation(selected.id, { propertyId: selected.propertyId, status: nextStatus }), `Reservation status verified in Cloudbeds: ${nextStatus.replace('_', ' ')}.`);
  };
  const saveStay = () => {
    if (!selected || !edit.startDate || !edit.endDate) return;
    if (edit.startDate >= edit.endDate) { setLocalNotice(''); return; }
    if (availability?.roomAvailable === false) return;
    run(() => updateReservation(selected.id, {
      propertyId: selected.propertyId,
      startDate: edit.startDate,
      endDate: edit.endDate,
      arrivalTime: edit.arrivalTime,
      adults: Number(edit.adults || 1),
      children: Number(edit.children || 0),
    }), 'Stay dates, occupancy and arrival time synced and verified in Cloudbeds.');
  };
  const saveRoomAssignment = () => {
    if (!selected || !newRoomId || !targetRoom || targetAvailable === false) return;
    if (String(newRoomId) === String(selectedAssignment?.roomId || selected.roomId)) { setLocalNotice('This room is already assigned.'); return; }
    run(() => assignRoom(selected.id, {
      propertyId: selected.propertyId,
      newRoomId,
      oldRoomId: selectedAssignment?.roomId || selected.roomId,
      roomTypeId: targetRoom.roomTypeId,
      subReservationId: selectedAssignment?.subReservationId || undefined,
      reservationRoomId: selectedAssignment?.reservationRoomId || undefined,
      adjustPrice,
    }), `Room ${targetRoom.roomNumber || targetRoom.id} assigned and verified in Cloudbeds.`);
  };
  const saveGuest = () => {
    if (!selected?.guestId) return;
    run(() => updateGuest(selected.guestId, { propertyId: selected.propertyId, ...guestEdit, cellPhone: guestEdit.phone }), 'Complete guest profile synced to Cloudbeds.');
  };
  const postCharge = () => {
    if (!selected || !charge.name || charge.price === '') return;
    if (!window.confirm(`Post ${charge.name} (€${Number(charge.price).toFixed(2)}) to the Cloudbeds reservation folio?`)) return;
    run(async () => {
      await postCustomCharge(selected.id, {
        propertyId: selected.propertyId, roomId: selected.roomId, guestId: selected.guestId,
        itemName: charge.name, itemCategoryName: charge.category, itemPrice: Number(charge.price),
        itemQuantity: Number(charge.quantity || 1), itemNote: charge.note,
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
    <PageHeader title="Reservations" description="Full Cloudbeds reservation control. Every write is re-read and verified before the PMS reports success." actions={<div className="flex flex-wrap gap-2"><button onClick={()=>navigate('/calendar')} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Open Calendar</button>{canEditGuest&&<button onClick={()=>navigate('/calendar?new=1')} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">+ New reservation</button>}<button onClick={status?.connected ? refresh : status?.authorized ? reauthorize : connect} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{status?.connected ? 'Refresh' : status?.authorized ? 'Re-authorize' : 'Connect Cloudbeds'}</button></div>} />

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"><div className="text-sm font-semibold text-rose-800">Cloudbeds sync issue</div><div className="mt-1 text-xs text-rose-700">{error}</div></div>}
    {status?.authorized && !loading && reservations.length === 0 && !error && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4"><div className="text-sm font-semibold text-amber-900">Cloudbeds is authorized but returned no reservation rows.</div><div className="mt-1 text-xs text-amber-800">{(diagnostics?.missingScopes || []).length ? `Missing permissions: ${diagnostics.missingScopes.join(', ')}.` : 'Re-authorize after changing Partner App scopes.'}</div></div>}

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4"><MetricCard label="Total" value={loading ? '…' : reservations.length} helper="Cloudbeds records"/><MetricCard label="Confirmed" value={loading ? '…' : confirmed} tone="green"/><MetricCard label="In house" value={loading ? '…' : inHouse} tone="blue"/><MetricCard label="Cancelled" value={loading ? '…' : cancelled} tone={cancelled ? 'rose' : 'default'}/></div>

    <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_500px]">
      <Panel title="Reservation list" description="Select a booking to edit the live Cloudbeds record.">
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_180px_220px_auto]">
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search reservation, guest, email, phone or room…" className={inputClass}/>
          <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)} className={inputClass}><option value="all">All statuses</option><option value="confirmed">Confirmed</option><option value="in_house">In house</option><option value="pending_confirmation">Pending</option><option value="no_show">No show</option><option value="checked_out">Checked out</option><option value="cancelled">Cancelled</option></select>
          <select value={propertyFilter} onChange={(e)=>setPropertyFilter(e.target.value)} className={inputClass}><option value="all">All properties</option>{properties.map((property)=><option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <button onClick={()=>{setSearch('');setStatusFilter('all');setPropertyFilter('all');}} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</button>
        </div>
        {filtered.length ? <TableShell><thead><tr><Th>Reservation</Th><Th>Guest</Th><Th>Check-in</Th><Th>Check-out</Th><Th>Room</Th><Th>Status</Th><Th>Source</Th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((reservation)=><tr key={reservation.id} onClick={()=>selectReservation(reservation.id)} className={`cursor-pointer hover:bg-slate-50 ${selected?.id===reservation.id?'bg-blue-50/60':''}`}><Td className="font-mono text-xs font-semibold text-slate-800">{reservation.id}</Td><Td><div className="font-semibold text-slate-950">{reservation.guestName}</div><div className="mt-0.5 text-xs text-slate-500">{reservation.guestEmail || reservation.guestPhone || 'No contact details'}</div></Td><Td>{formatDate(reservation.arrivalDate)}{reservation.arrivalTime&&<div className="text-xs text-slate-500">{String(reservation.arrivalTime).slice(0,5)}</div>}</Td><Td>{formatDate(reservation.departureDate)}</Td><Td><div className="font-semibold text-slate-900">{reservation.roomNumber || 'Unassigned'}</div><div className="text-xs text-slate-500">{reservation.roomType || '—'}</div></Td><Td><StatusBadge status={reservation.status}/></Td><Td>{reservation.cloudbedsSource || 'Cloudbeds'}</Td></tr>)}</tbody></TableShell> : <EmptyState title="No reservations found" description={status?.authorized?'Try changing the filters.':'Connect Cloudbeds to load reservations.'}/>} 
      </Panel>

      <div className="space-y-5">
        <Panel title="Reservation control" description="Dates, guests, room and status are Cloudbeds writes.">
          {selected ? <div className="space-y-5 p-5">
            <div className="flex items-start justify-between gap-3"><div><div className="text-lg font-black text-slate-950">{selected.guestName}</div><div className="mt-1 font-mono text-xs text-slate-500">{selected.id}</div></div><StatusBadge status={selected.status}/></div>
            {detailsLoading && <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">Loading full Cloudbeds record…</div>}
            {detailsError && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{detailsError}</div>}
            {(writeState.syncing || writeState.error || localNotice) && <div className={`rounded-xl border px-3 py-3 text-xs font-semibold ${writeState.error?'border-rose-200 bg-rose-50 text-rose-700':writeState.syncing?'border-blue-200 bg-blue-50 text-blue-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{writeState.error || (writeState.syncing ? 'Syncing and verifying with Cloudbeds…' : localNotice)}</div>}

            <section><div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Reservation status</div><div className="grid grid-cols-2 gap-2"><Action onClick={()=>changeStatus('confirmed')} disabled={writeState.syncing}>Confirm</Action><Action onClick={()=>changeStatus('in_house')} disabled={writeState.syncing} tone="blue">Check in</Action><Action onClick={()=>changeStatus('checked_out')} disabled={writeState.syncing} tone="green">Check out</Action><Action onClick={()=>changeStatus('no_show')} disabled={writeState.syncing}>No show</Action><button onClick={()=>changeStatus('cancelled')} disabled={writeState.syncing || selected.status==='cancelled'} className="col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-40">Cancel reservation</button></div></section>

            <section className="border-t border-slate-100 pt-4"><div className="mb-3 flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-wide text-slate-500">Stay details</div><div className="mt-1 text-[11px] text-slate-500">Check-in and check-out can both be changed.</div></div>{availabilityLoading&&<span className="text-[11px] font-bold text-blue-600">Checking availability…</span>}</div><div className="grid grid-cols-2 gap-3"><Field label="Check-in"><input type="date" value={edit.startDate} onChange={(e)=>setEdit({...edit,startDate:e.target.value})} className={inputClass}/></Field><Field label="Check-out"><input type="date" min={edit.startDate} value={edit.endDate} onChange={(e)=>setEdit({...edit,endDate:e.target.value})} className={inputClass}/></Field><Field label="Arrival time"><input type="time" value={edit.arrivalTime} onChange={(e)=>setEdit({...edit,arrivalTime:e.target.value})} className={inputClass}/></Field><div/><Field label="Adults"><input min="1" type="number" value={edit.adults} onChange={(e)=>setEdit({...edit,adults:Number(e.target.value)})} className={inputClass}/></Field><Field label="Children"><input min="0" type="number" value={edit.children} onChange={(e)=>setEdit({...edit,children:Number(e.target.value)})} className={inputClass}/></Field></div>
              {availability?.roomAvailable===false && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">The currently selected room conflicts with these dates. Change room or dates before saving.{(availability.conflicts||[]).map((conflict)=><div key={conflict.reservationId} className="mt-1 font-normal">{conflict.guestName}: {conflict.startDate} → {conflict.endDate} · #{conflict.reservationId}</div>)}</div>}
              <button onClick={saveStay} disabled={writeState.syncing || availabilityLoading || availability?.roomAvailable===false || !edit.startDate || !edit.endDate || edit.startDate>=edit.endDate} className="mt-3 w-full rounded-xl bg-slate-950 px-3 py-3 text-sm font-black text-white hover:bg-slate-900 disabled:opacity-40">Save stay to Cloudbeds</button>
            </section>

            <section className="border-t border-slate-100 pt-4"><div className="mb-3 flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-wide text-slate-500">Room assignment</div><div className="mt-1 text-[11px] text-slate-500">Only rooms free for the whole edited stay are listed.</div></div><button onClick={()=>navigate(`/calendar?date=${edit.startDate || selected.arrivalDate}`)} className="text-xs font-bold text-blue-700">View calendar</button></div>
              <select value={newRoomId} onChange={(e)=>setNewRoomId(e.target.value)} className={inputClass}><option value="">Unassigned / choose room</option>{roomOptions.map((room)=><option key={room.id} value={room.id}>{room.roomNumber || room.id} · {room.roomType || 'Room'}</option>)}</select>
              {newRoomId && availability && <div className={`mt-2 rounded-lg px-3 py-2 text-xs font-semibold ${targetAvailable===false?'bg-rose-50 text-rose-700':'bg-emerald-50 text-emerald-700'}`}>{targetAvailable===false?'Selected room is not free for this complete stay.':'Selected room passes the current Cloudbeds conflict check.'}</div>}
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={adjustPrice} onChange={(e)=>setAdjustPrice(e.target.checked)} className="h-4 w-4"/>Allow Cloudbeds to adjust room price when room type changes</label>
              <button onClick={saveRoomAssignment} disabled={writeState.syncing || availabilityLoading || !newRoomId || !targetRoom || targetAvailable===false || String(newRoomId)===String(selectedAssignment?.roomId || selected.roomId)} className="mt-3 w-full rounded-xl bg-blue-600 px-3 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-40">Assign room & verify</button>
            </section>

            <section className="border-t border-slate-100 pt-4"><div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">Guest Experience</div><button onClick={sendInstructions} disabled={sendingInstructions || !selected.guestEmail || selected.status==='cancelled'} className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50">{sendingInstructions?'Sending…':'Send Instructions'}</button>{instructionError&&<div className="mt-2 text-xs font-semibold text-rose-700">{instructionError}</div>}{instructionResult&&<div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3"><div className="text-xs font-bold text-sky-900">{instructionResult.emailSent?'Email sent successfully.':'Secure portal link created.'}</div><div className="mt-2 break-all text-[10px] text-slate-500">{instructionResult.portalUrl}</div><button onClick={copyPortalLink} className="mt-2 rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-bold text-sky-700">Copy link</button></div>}</section>
          </div> : <EmptyState title="Select a reservation"/>}
        </Panel>

        {selected && canEditGuest && <Panel title="Guest profile" description="Edit the complete Cloudbeds guest profile used by the PMS."><div className="grid gap-3 p-5 sm:grid-cols-2"><Field label="First name"><input value={guestEdit.firstName} onChange={(e)=>setGuestEdit({...guestEdit,firstName:e.target.value})} className={inputClass}/></Field><Field label="Last name"><input value={guestEdit.lastName} onChange={(e)=>setGuestEdit({...guestEdit,lastName:e.target.value})} className={inputClass}/></Field><Field label="Gender"><select value={guestEdit.gender} onChange={(e)=>setGuestEdit({...guestEdit,gender:e.target.value})} className={inputClass}><option value="">Not set</option><option value="M">Male</option><option value="F">Female</option><option value="X">Other / unspecified</option></select></Field><Field label="Birth date"><input type="date" value={guestEdit.birthDate} onChange={(e)=>setGuestEdit({...guestEdit,birthDate:e.target.value})} className={inputClass}/></Field><Field label="Email"><input type="email" value={guestEdit.email} onChange={(e)=>setGuestEdit({...guestEdit,email:e.target.value})} className={inputClass}/></Field><Field label="Phone"><input value={guestEdit.phone} onChange={(e)=>setGuestEdit({...guestEdit,phone:e.target.value})} className={inputClass}/></Field><Field label="Address 1"><input value={guestEdit.address1} onChange={(e)=>setGuestEdit({...guestEdit,address1:e.target.value})} className={inputClass}/></Field><Field label="Address 2"><input value={guestEdit.address2} onChange={(e)=>setGuestEdit({...guestEdit,address2:e.target.value})} className={inputClass}/></Field><Field label="City"><input value={guestEdit.city} onChange={(e)=>setGuestEdit({...guestEdit,city:e.target.value})} className={inputClass}/></Field><Field label="State / Region"><input value={guestEdit.state} onChange={(e)=>setGuestEdit({...guestEdit,state:e.target.value})} className={inputClass}/></Field><Field label="Postal code"><input value={guestEdit.zip} onChange={(e)=>setGuestEdit({...guestEdit,zip:e.target.value})} className={inputClass}/></Field><Field label="Country"><input value={guestEdit.country} onChange={(e)=>setGuestEdit({...guestEdit,country:e.target.value.toUpperCase()})} className={inputClass}/></Field><Field label="Nationality"><input value={guestEdit.nationality} onChange={(e)=>setGuestEdit({...guestEdit,nationality:e.target.value.toUpperCase()})} className={inputClass}/></Field><div/><Field label="Document type"><input value={guestEdit.documentType} onChange={(e)=>setGuestEdit({...guestEdit,documentType:e.target.value})} className={inputClass}/></Field><Field label="Document number"><input value={guestEdit.documentNumber} onChange={(e)=>setGuestEdit({...guestEdit,documentNumber:e.target.value})} className={inputClass}/></Field><Field label="Issue date"><input type="date" value={guestEdit.documentIssueDate} onChange={(e)=>setGuestEdit({...guestEdit,documentIssueDate:e.target.value})} className={inputClass}/></Field><Field label="Issuing country"><input value={guestEdit.documentIssuingCountry} onChange={(e)=>setGuestEdit({...guestEdit,documentIssuingCountry:e.target.value.toUpperCase()})} className={inputClass}/></Field><Field label="Expiration date"><input type="date" value={guestEdit.documentExpirationDate} onChange={(e)=>setGuestEdit({...guestEdit,documentExpirationDate:e.target.value})} className={inputClass}/></Field><div/><button onClick={saveGuest} disabled={writeState.syncing || !selected.guestId} className="sm:col-span-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Save guest to Cloudbeds</button>{!selected.guestId&&<div className="sm:col-span-2 text-xs font-semibold text-amber-700">No Cloudbeds guest ID was returned for this reservation.</div>}</div></Panel>}

        {selected && canCharge && <Panel title="Folio item" description="Post an unpaid item to this Cloudbeds reservation."><div className="grid gap-3 p-5 sm:grid-cols-2"><Field label="Item name"><input value={charge.name} onChange={(e)=>setCharge({...charge,name:e.target.value})} className={inputClass}/></Field><Field label="Category"><input value={charge.category} onChange={(e)=>setCharge({...charge,category:e.target.value})} className={inputClass}/></Field><Field label="Price"><input type="number" min="0" step="0.01" value={charge.price} onChange={(e)=>setCharge({...charge,price:e.target.value})} className={inputClass}/></Field><Field label="Quantity"><input type="number" min="1" value={charge.quantity} onChange={(e)=>setCharge({...charge,quantity:e.target.value})} className={inputClass}/></Field><Field label="Note"><input value={charge.note} onChange={(e)=>setCharge({...charge,note:e.target.value})} className={inputClass}/></Field><div className="flex items-end"><button onClick={postCharge} disabled={writeState.syncing || !charge.name || charge.price===''} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Post €{charge.price!==''?Number(charge.price).toFixed(2):'0.00'}</button></div></div></Panel>}

        {selected && <Panel title="Cloudbeds summary" description="Read-only values from the synced reservation."><div className="grid grid-cols-2 gap-4 p-5"><Detail label="Check-in" value={formatDate(selected.arrivalDate)}/><Detail label="Check-out" value={formatDate(selected.departureDate)}/><Detail label="Room" value={selected.roomNumber || 'Unassigned'}/><Detail label="Room type" value={selected.roomType || '—'}/><Detail label="Nights" value={selected.nights || '—'}/><Detail label="Total" value={formatMoney(selected.totalPrice)}/><Detail label="Source" value={selected.cloudbedsSource || 'Cloudbeds'}/><Detail label="Property" value={selected.property?.name || 'Cloudbeds property'}/></div></Panel>}
      </div>
    </div>
  </div>;
};

const Field = ({ label, children }) => <label><span className={labelClass}>{label}</span>{children}</label>;
const Detail = ({ label, value }) => <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-sm font-semibold text-slate-900">{value}</div></div>;
const Action = ({ children, onClick, disabled, tone='slate' }) => <button onClick={onClick} disabled={disabled} className={`rounded-xl px-3 py-2.5 text-sm font-bold disabled:opacity-40 ${tone==='blue'?'bg-blue-600 text-white hover:bg-blue-700':tone==='green'?'bg-emerald-600 text-white hover:bg-emerald-700':'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{children}</button>;

export default BookingsPage;

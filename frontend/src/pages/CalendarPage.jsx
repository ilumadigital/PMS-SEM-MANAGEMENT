import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import api from '../services/api';
import { PageHeader, StatusBadge } from '../components/PmsUi';

const DAY_MS = 86400000;
const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelClass = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500';
const todayKey = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};
const addDays = (value, days) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const dayDiff = (from, to) => Math.max(1, Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / DAY_MS));
const makeRequestKey = () => globalThis.crypto?.randomUUID?.() || `sem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const formatDay = (key) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit' }).format(new Date(`${key}T12:00:00`));
const formatMonth = (key) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${key}T12:00:00`));
const statusTone = (status) => {
  if (status === 'in_house') return 'bg-emerald-600 text-white border-emerald-700';
  if (status === 'pending_confirmation') return 'bg-amber-100 text-amber-950 border-amber-300';
  if (status === 'checked_out') return 'bg-slate-200 text-slate-700 border-slate-300';
  return 'bg-blue-600 text-white border-blue-700';
};

const CalendarPage = () => {
  const { user } = useContext(AuthContext);
  const { reservations, properties, rooms: contextRooms, status, loading, refresh } = useContext(CloudbedsDataContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const canCreate = false; // Phase 1: Cloudbeds is strictly read-only; PMS cannot create reservations.
  const [propertyId, setPropertyId] = useState(properties[0]?.id || '');
  const [anchorDate, setAnchorDate] = useState(todayKey());
  const [daysVisible, setDaysVisible] = useState(21);
  const [calendar, setCalendar] = useState({ inventory: [], roomBlocks: [], sources: [] });
  const [calendarError, setCalendarError] = useState('');
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [roomTypeFilter, setRoomTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [booking, setBooking] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [submitState, setSubmitState] = useState({ loading: false, error: '', result: null });
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!propertyId && properties[0]?.id) setPropertyId(String(properties[0].id));
  }, [properties, propertyId]);

  const loadCalendar = async () => {
    if (!propertyId) return;
    setCalendarLoading(true); setCalendarError('');
    try {
      const response = await api.get('/integrations/cloudbeds/operations/calendar', { params: { propertyId } });
      setCalendar(response.data?.data || { inventory: [], roomBlocks: [], sources: [] });
    } catch (error) {
      setCalendarError(error.response?.data?.message || error.message || 'Could not load Cloudbeds calendar inventory.');
    } finally { setCalendarLoading(false); }
  };

  useEffect(() => { loadCalendar(); }, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dates = useMemo(() => Array.from({ length: daysVisible }, (_, index) => addDays(anchorDate, index)), [anchorDate, daysVisible]);
  const inventory = calendar.inventory?.length ? calendar.inventory : contextRooms.filter((room) => String(room.propertyId) === String(propertyId));
  const activeReservations = useMemo(() => reservations.filter((reservation) =>
    String(reservation.propertyId) === String(propertyId) &&
    !['cancelled', 'no_show'].includes(reservation.status) &&
    reservation.arrivalDate && reservation.departureDate
  ), [reservations, propertyId]);

  const roomTypes = useMemo(() => [...new Set(inventory.map((room) => room.roomType || 'Other'))].sort(), [inventory]);
  const displayedRooms = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...inventory]
      .filter((room) => roomTypeFilter === 'all' || (room.roomType || 'Other') === roomTypeFilter)
      .filter((room) => !term || [room.roomNumber, room.roomType].filter(Boolean).some((v) => String(v).toLowerCase().includes(term)))
      .sort((a, b) => `${a.roomType || ''}-${a.roomNumber || ''}`.localeCompare(`${b.roomType || ''}-${b.roomNumber || ''}`, undefined, { numeric: true }));
  }, [inventory, roomTypeFilter, search]);

  const reservationsForRoom = (roomId) => activeReservations.filter((reservation) => {
    const ids = reservation.roomIds?.length ? reservation.roomIds.map(String) : [String(reservation.roomId || '')];
    return ids.includes(String(roomId));
  });

  const blockFor = (roomId, date) => (calendar.roomBlocks || []).find((block) => {
    const start = String(block.startDate || block.start_date || '').slice(0, 10);
    const end = String(block.endDate || block.end_date || '').slice(0, 10);
    if (!start || !end || !(date >= start && date < end)) return false;
    const blockRooms = Array.isArray(block.rooms) ? block.rooms : Array.isArray(block.roomIDs) ? block.roomIDs : [];
    return blockRooms.some((candidate) => String(candidate?.roomID || candidate?.roomId || candidate) === String(roomId));
  });

  const reservationFor = (roomId, date) => reservationsForRoom(roomId).find((reservation) => date >= reservation.arrivalDate && date < reservation.departureDate);

  const openNew = (room = null, start = todayKey()) => {
    if (!canCreate) return;
    const requestedStart = start < todayKey() ? todayKey() : start;
    setBooking({
      requestKey: makeRequestKey(),
      propertyId: propertyId || properties[0]?.id || '',
      startDate: requestedStart,
      endDate: addDays(requestedStart, 1),
      roomId: room?.id ? String(room.id) : '',
      firstName: '', lastName: '', email: '', phone: '', country: 'GR', nationality: 'GR', zip: '',
      adults: 1, children: 0, arrivalTime: '', sourceId: '', paymentMethod: 'cash', sendEmailConfirmation: true,
    });
    setAvailability(null); setSubmitState({ loading: false, error: '', result: null }); setModalOpen(true);
  };

  useEffect(() => {
    if (canCreate && searchParams.get('new') === '1' && propertyId) {
      openNew(null, searchParams.get('date') || todayKey());
      const next = new URLSearchParams(searchParams);
      next.delete('new'); next.delete('date');
      setSearchParams(next, { replace: true });
    }
  }, [canCreate, propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!modalOpen || !booking?.propertyId || !booking?.startDate || !booking?.endDate || booking.startDate >= booking.endDate) {
      setAvailability(null); return;
    }
    const timer = window.setTimeout(async () => {
      setAvailabilityLoading(true);
      try {
        const response = await api.get('/integrations/cloudbeds/operations/availability', {
          params: {
            propertyId: booking.propertyId,
            startDate: booking.startDate,
            endDate: booking.endDate,
            adults: booking.adults,
            children: booking.children,
            roomId: booking.roomId || undefined,
          },
        });
        setAvailability(response.data?.data || null);
      } catch (error) {
        setAvailability({ roomAvailable: false, availableRooms: [], availableRoomTypes: [], conflicts: error.response?.data?.details?.conflicts || [], error: error.response?.data?.message || error.message });
      } finally { setAvailabilityLoading(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [modalOpen, booking?.propertyId, booking?.startDate, booking?.endDate, booking?.adults, booking?.children, booking?.roomId]);

  const rawAvailableRooms = availability?.availableRooms || [];
  const sellableTypes = availability?.availableRoomTypes || [];
  const sellableRoomTypeIds = new Set(
    sellableTypes
      .filter((roomType) => Number(roomType.roomsAvailable || 0) > 0)
      .map((roomType) => String(roomType.roomTypeId))
  );
  const availableRooms = sellableTypes.length
    ? rawAvailableRooms.filter((room) => sellableRoomTypeIds.has(String(room.roomTypeId)))
    : rawAvailableRooms;
  const selectedRoom = inventory.find((room) => String(room.id) === String(booking?.roomId || ''));
  const selectedLiveRoom = rawAvailableRooms.find((room) => String(room.id) === String(booking?.roomId || '')) || selectedRoom;
  const selectedTypeSellable = !sellableTypes.length || sellableRoomTypeIds.has(String(selectedLiveRoom?.roomTypeId || ''));
  const selectedAvailable = !booking?.roomId ? false
    : availability?.roomAvailable === true &&
      rawAvailableRooms.some((room) => String(room.id) === String(booking.roomId)) &&
      selectedTypeSellable;
  const dateValid = booking?.startDate && booking?.endDate && booking.startDate < booking.endDate;

  const createReservation = async (event) => {
    event.preventDefault();
    if (!booking || !selectedAvailable || !dateValid || !String(booking.zip || '').trim()) return;
    setSubmitState({ loading: true, error: '', result: null });
    try {
      const room = rawAvailableRooms.find((candidate) => String(candidate.id) === String(booking.roomId)) || selectedRoom;
      const response = await api.post('/integrations/cloudbeds/operations/reservations', {
        ...booking,
        zip: String(booking.zip || '').trim(),
        roomTypeId: room?.roomTypeId,
      });
      const result = response.data?.data;
      setSubmitState({ loading: false, error: '', result });
      await refresh();
      await loadCalendar();
      if (!result?.partial) {
        window.setTimeout(() => setModalOpen(false), 900);
      }
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Reservation could not be created.';
      const requestId = error.response?.data?.requestId;
      const conflicts = error.response?.data?.details?.conflicts || [];
      setSubmitState({
        loading: false,
        error: requestId ? `${message} · Cloudbeds Request ID ${requestId}` : message,
        result: conflicts.length ? { conflicts } : null,
      });
    }
  };

  const jump = (days) => setAnchorDate(addDays(anchorDate, days));
  const monthGroups = useMemo(() => {
    const groups = [];
    dates.forEach((date) => {
      const label = formatMonth(date);
      const previous = groups[groups.length - 1];
      if (previous?.label === label) previous.count += 1;
      else groups.push({ label, count: 1 });
    });
    return groups;
  }, [dates]);

  if (!status?.authorized && !status?.connected && !loading) {
    return <div className="space-y-6"><PageHeader title="Calendar" description="Read-only hotel room plan from Cloudbeds." /><div className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><div className="text-lg font-bold text-slate-950">Cloudbeds connection required</div><div className="mt-2 text-sm text-slate-500">An Administrator must configure the Cloudbeds integration from Developer Settings.</div></div></div>;
  }

  return <div className="space-y-5">
    <PageHeader
      title="Calendar"
      description="Read-only hotel room plan from Cloudbeds. Reservations cannot be created or changed from SEM PMS in this phase."
      actions={<div className="flex flex-wrap gap-2">
        <button onClick={()=>{setAnchorDate(todayKey()); scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' });}} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Today</button>
        <button onClick={loadCalendar} disabled={calendarLoading} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{calendarLoading ? 'Loading…' : 'Refresh'}</button>
        {canCreate && <button onClick={()=>openNew()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700">+ New reservation</button>}
      </div>}
    />

    {calendarError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{calendarError}</div>}

    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={()=>jump(-7)} className="h-10 rounded-xl border border-slate-300 px-3 text-sm font-black text-slate-700">‹ 7d</button>
          <button onClick={()=>jump(7)} className="h-10 rounded-xl border border-slate-300 px-3 text-sm font-black text-slate-700">7d ›</button>
          <select value={propertyId} onChange={(e)=>setPropertyId(e.target.value)} className="h-10 min-w-52 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold">
            {properties.map((property)=><option key={property.id} value={property.id}>{property.name}</option>)}
          </select>
          <select value={roomTypeFilter} onChange={(e)=>setRoomTypeFilter(e.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm">
            <option value="all">All room types</option>{roomTypes.map((type)=><option key={type}>{type}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search room…" className="h-10 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-500" />
          <select value={daysVisible} onChange={(e)=>setDaysVisible(Number(e.target.value))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value={14}>14 days</option><option value={21}>21 days</option><option value={28}>28 days</option><option value={35}>35 days</option></select>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain">
        <div style={{ minWidth: 220 + dates.length * 92 }}>
          <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
            <div className="sticky left-0 z-30 flex w-[220px] shrink-0 items-end border-r border-slate-200 bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wider text-white">Room / Type</div>
            <div className="flex-1">
              <div className="flex border-b border-slate-100 bg-slate-50">
                {monthGroups.map((group, index)=><div key={`${group.label}-${index}`} style={{ width: group.count * 92 }} className="shrink-0 border-r border-slate-200 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">{group.label}</div>)}
              </div>
              <div className="flex">
                {dates.map((date)=>{
                  const isToday = date === todayKey();
                  const weekend = [0,6].includes(new Date(`${date}T12:00:00`).getDay());
                  return <div key={date} className={`w-[92px] shrink-0 border-r border-slate-100 px-2 py-2 text-center ${isToday?'bg-blue-50':weekend?'bg-slate-50':''}`}><div className={`text-xs font-black ${isToday?'text-blue-700':'text-slate-800'}`}>{formatDay(date)}</div><div className="mt-0.5 text-[10px] text-slate-400">{date.slice(5)}</div></div>;
                })}
              </div>
            </div>
          </div>

          {displayedRooms.length ? displayedRooms.map((room, roomIndex) => {
            const previousType = displayedRooms[roomIndex - 1]?.roomType;
            const showType = roomIndex === 0 || previousType !== room.roomType;
            return <React.Fragment key={room.id}>
              {showType && <div className="flex border-b border-slate-200 bg-slate-100/90"><div className="sticky left-0 z-10 w-[220px] shrink-0 border-r border-slate-200 bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-slate-600">{room.roomType || 'Other'}</div><div className="text-[11px] font-semibold text-slate-500 px-3 py-2">{displayedRooms.filter((candidate)=>candidate.roomType===room.roomType).length} rooms</div></div>}
              <div className="flex min-h-[58px] border-b border-slate-100 bg-white hover:bg-slate-50/50">
                <div className="sticky left-0 z-10 flex w-[220px] shrink-0 items-center justify-between gap-3 border-r border-slate-200 bg-white px-4 py-2 shadow-[3px_0_8px_-8px_rgba(15,23,42,.5)]">
                  <div className="min-w-0"><div className="truncate text-sm font-black text-slate-950">{room.roomNumber || room.id}</div><div className="truncate text-[11px] text-slate-500">{room.roomType || 'Room'}</div></div>
                  {room.housekeepingStatus && <span className="h-2.5 w-2.5 rounded-full bg-slate-300" title={room.housekeepingStatus}/>} 
                </div>
                <div className="flex">
                  {dates.map((date) => {
                    const reservation = reservationFor(room.id, date);
                    const block = !reservation ? blockFor(room.id, date) : null;
                    const isStart = reservation && date === reservation.arrivalDate;
                    const isLast = reservation && addDays(date, 1) === reservation.departureDate;
                    const isToday = date === todayKey();
                    return <button
                      key={date}
                      type="button"
                      onClick={()=>!reservation && !block && canCreate && openNew(room, date)}
                      disabled={Boolean(reservation || block || !canCreate)}
                      title={reservation ? `${reservation.guestName} · ${reservation.arrivalDate} → ${reservation.departureDate}` : block ? (block.roomBlockReason || block.reason || 'Room blocked') : 'Available · read only'}
                      className={`relative h-[58px] w-[92px] shrink-0 border-r border-slate-100 text-left transition ${isToday?'bg-blue-50/40':''} ${!reservation&&!block&&canCreate?'hover:bg-blue-50 cursor-pointer':'cursor-default'}`}
                    >
                      {reservation && <div className={`absolute inset-y-2 left-0 right-0 flex items-center overflow-hidden border-y px-2 text-[10px] font-bold ${statusTone(reservation.status)} ${isStart?'ml-1 rounded-l-lg border-l':''} ${isLast?'mr-1 rounded-r-lg border-r':''}`}><span className="truncate">{isStart ? reservation.guestName : '•'}</span></div>}
                      {block && <div className="absolute inset-2 flex items-center justify-center rounded-lg border border-dashed border-slate-400 bg-slate-100 px-1 text-center text-[9px] font-bold uppercase text-slate-500">Blocked</div>}
                      {!reservation && !block && canCreate && <span className="absolute inset-0 flex items-center justify-center text-lg font-light text-slate-200 opacity-0 hover:opacity-100">+</span>}
                    </button>;
                  })}
                </div>
              </div>
            </React.Fragment>;
          }) : <div className="p-10 text-center text-sm text-slate-500">No rooms match this view.</div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 border-t border-slate-200 px-4 py-3 text-[11px] font-semibold text-slate-500"><Legend className="bg-blue-600" label="Confirmed"/><Legend className="bg-emerald-600" label="In house"/><Legend className="bg-amber-200" label="Pending"/><Legend className="border border-dashed border-slate-400 bg-slate-100" label="Blocked"/><span className="ml-auto">Check-out date is free for the next arrival.</span></div>
    </div>

    {modalOpen && booking && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <div className="max-h-[96vh] w-full overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:max-w-3xl sm:rounded-[28px]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
          <div><div className="text-lg font-black text-slate-950">New Cloudbeds reservation</div><div className="mt-0.5 text-xs text-slate-500">Availability and sellable room-type inventory are checked again immediately before creation.</div></div>
          <button onClick={()=>setModalOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600">×</button>
        </div>
        <form onSubmit={createReservation} className="space-y-6 p-5 sm:p-7">
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between"><div><div className="text-sm font-black text-slate-950">Stay & availability</div><div className="text-xs text-slate-500">Only physical rooms that are free and sellable for the complete stay can be selected.</div></div>{availabilityLoading && <span className="text-xs font-bold text-blue-600">Checking…</span>}</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Property"><select value={booking.propertyId} onChange={(e)=>setBooking({...booking,propertyId:e.target.value,roomId:''})} className={inputClass}>{properties.map((property)=><option key={property.id} value={property.id}>{property.name}</option>)}</select></Field>
              <div className="hidden sm:block" />
              <Field label="Check-in"><input required type="date" min={todayKey()} value={booking.startDate} onChange={(e)=>setBooking({...booking,startDate:e.target.value,endDate:e.target.value>=booking.endDate?addDays(e.target.value,1):booking.endDate,roomId:''})} className={inputClass}/></Field>
              <Field label="Check-out"><input required type="date" min={addDays(booking.startDate,1)} value={booking.endDate} onChange={(e)=>setBooking({...booking,endDate:e.target.value,roomId:''})} className={inputClass}/></Field>
              <Field label="Adults"><input required min="1" type="number" value={booking.adults} onChange={(e)=>setBooking({...booking,adults:Number(e.target.value)})} className={inputClass}/></Field>
              <Field label="Children"><input min="0" type="number" value={booking.children} onChange={(e)=>setBooking({...booking,children:Number(e.target.value)})} className={inputClass}/></Field>
              <Field label="Physical room"><select required value={booking.roomId} onChange={(e)=>setBooking({...booking,roomId:e.target.value})} className={inputClass}><option value="">Select an available room…</option>{availableRooms.map((room)=><option key={room.id} value={room.id}>{room.roomNumber || room.id} · {room.roomType || 'Room'}</option>)}</select></Field>
              <Field label="Arrival time"><input type="time" value={booking.arrivalTime} onChange={(e)=>setBooking({...booking,arrivalTime:e.target.value})} className={inputClass}/></Field>
            </div>
            {dateValid && availability && !availabilityLoading && <div className={`mt-4 rounded-xl border px-3.5 py-3 text-xs font-semibold ${booking.roomId ? (selectedAvailable?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-rose-200 bg-rose-50 text-rose-800') : 'border-blue-200 bg-blue-50 text-blue-800'}`}>{booking.roomId ? (selectedAvailable ? `${selectedRoom?.roomNumber || 'Selected room'} is free and sellable for all ${dayDiff(booking.startDate,booking.endDate)} night(s).` : (availability.error || (selectedTypeSellable ? 'This room is not available for the complete stay. Choose another room.' : 'The physical room is free, but Cloudbeds reports no sellable inventory for its room type on these dates.'))) : `${availableRooms.length} sellable physical room(s) currently available in Cloudbeds.`}</div>}
            {(availability?.conflicts || []).length > 0 && <div className="mt-3 rounded-xl border border-rose-200 bg-white p-3"><div className="text-xs font-black text-rose-800">Booking conflict detected</div>{availability.conflicts.map((conflict)=><div key={conflict.reservationId} className="mt-1 text-xs text-rose-700">Reservation {conflict.reservationId}: {conflict.guestName} · {conflict.startDate} → {conflict.endDate}</div>)}</div>}
          </section>

          <section><div className="mb-4"><div className="text-sm font-black text-slate-950">Guest details</div><div className="text-xs text-slate-500">Required Cloudbeds create fields are sent with the reservation, including postal code and payment method.</div></div><div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name"><input required value={booking.firstName} onChange={(e)=>setBooking({...booking,firstName:e.target.value})} className={inputClass}/></Field>
            <Field label="Last name"><input required value={booking.lastName} onChange={(e)=>setBooking({...booking,lastName:e.target.value})} className={inputClass}/></Field>
            <Field label="Email"><input required type="email" value={booking.email} onChange={(e)=>setBooking({...booking,email:e.target.value})} className={inputClass}/></Field>
            <Field label="Phone"><input value={booking.phone} onChange={(e)=>setBooking({...booking,phone:e.target.value})} className={inputClass}/></Field>
            <Field label="Country code"><input required maxLength="2" value={booking.country} onChange={(e)=>setBooking({...booking,country:e.target.value.toUpperCase()})} className={inputClass}/></Field>
            <Field label="Postal / ZIP code"><input required autoComplete="postal-code" value={booking.zip} onChange={(e)=>setBooking({...booking,zip:e.target.value})} className={inputClass}/></Field>
            <Field label="Nationality"><input maxLength="2" value={booking.nationality} onChange={(e)=>setBooking({...booking,nationality:e.target.value.toUpperCase()})} className={inputClass}/></Field>
            <Field label="Payment method"><select value={booking.paymentMethod} onChange={(e)=>setBooking({...booking,paymentMethod:e.target.value})} className={inputClass}><option value="cash">Cash / pay at property</option><option value="credit">Credit card</option><option value="ebanking">E-banking</option><option value="pay_pal">PayPal</option></select></Field>
            <Field label="Booking source"><select value={booking.sourceId} onChange={(e)=>setBooking({...booking,sourceId:e.target.value})} className={inputClass}><option value="">Cloudbeds default / direct</option>{(calendar.sources || []).map((source)=><option key={source.sourceID || source.id} value={source.sourceID || source.id}>{source.sourceName || source.name || source.sourceID || source.id}</option>)}</select></Field>
            <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"><input type="checkbox" checked={booking.sendEmailConfirmation} onChange={(e)=>setBooking({...booking,sendEmailConfirmation:e.target.checked})} className="h-4 w-4"/><span className="text-sm font-semibold text-slate-700">Send Cloudbeds confirmation email</span></label>
          </div><div className="mt-3 text-[11px] text-slate-500">For manual Front Desk bookings, Cash / pay at property is the safe default. No payment is charged by this form.</div></section>

          {submitState.error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><div className="text-sm font-black text-rose-900">Reservation not created</div><div className="mt-1 text-sm text-rose-700">{submitState.error}</div>{submitState.result?.conflicts?.map((conflict)=><div key={conflict.reservationId} className="mt-2 text-xs text-rose-700">Conflict: {conflict.guestName} · {conflict.startDate} → {conflict.endDate}</div>)}</div>}
          {submitState.result?.partial && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4"><div className="text-sm font-black text-amber-950">Reservation created — room assignment needs attention</div><div className="mt-1 text-sm text-amber-800">Cloudbeds reservation {submitState.result.reservationId} exists. Do not submit again. Open the reservation and assign a physical room.</div><div className="mt-2 text-xs text-amber-700">{submitState.result.assignmentError?.message}</div></div>}
          {submitState.result && !submitState.result.partial && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Reservation {submitState.result.reservationId} created and room assignment verified in Cloudbeds.</div>}

          <div className="sticky bottom-0 -mx-5 -mb-5 flex gap-3 border-t border-slate-200 bg-white/95 p-5 backdrop-blur sm:-mx-7 sm:-mb-7 sm:px-7">
            <button type="button" onClick={()=>setModalOpen(false)} className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">Cancel</button>
            <button type="submit" disabled={submitState.loading || availabilityLoading || !selectedAvailable || !dateValid || !String(booking.zip || '').trim() || Boolean(submitState.result?.partial)} className="flex-[1.5] rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{submitState.loading ? 'Creating in Cloudbeds…' : 'Create reservation'}</button>
          </div>
        </form>
      </div>
    </div>}
  </div>;
};

const Field = ({ label, children }) => <label><span className={labelClass}>{label}</span>{children}</label>;
const Legend = ({ className, label }) => <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${className}`}/>{label}</span>;

export default CalendarPage;

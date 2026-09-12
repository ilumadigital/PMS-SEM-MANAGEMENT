import React, { useContext, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import {
  EmptyState,
  PageHeader,
  Panel,
  StatusBadge,
  TableShell,
  Td,
  Th,
  addDaysKey,
  formatDate,
  formatTime,
  todayKey,
} from '../components/PmsUi';

const inputClass = 'w-full min-w-[104px] rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const compactSelect = 'min-w-[92px] rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-500';

const reservationUsesRoom = (reservation, roomId) => {
  const ids = reservation.roomIds?.length ? reservation.roomIds.map(String) : [String(reservation.roomId || '')];
  return ids.includes(String(roomId));
};

const guestCountForRoom = (reservation, roomId) => {
  if (!reservation) return '—';
  const roomCount = reservation.roomGuestCounts?.[String(roomId)];
  if (Number(roomCount) > 0) return Number(roomCount);
  if (Number(reservation.guestCount) > 0) return Number(reservation.guestCount);
  return 1;
};

const DashboardPage = () => {
  const { user } = useContext(AuthContext);
  const {
    reservations,
    properties,
    rooms,
    housekeeping,
    status,
    loading,
    error,
    connect,
    updateReservation,
    updateHousekeeping,
  } = useContext(CloudbedsDataContext);

  const role = String(user?.role || '').toLowerCase();
  const canEditFrontDesk = ['admin', 'management', 'reception', 'supervisor'].includes(role);
  const canEditHousekeeping = ['admin', 'management', 'reception', 'supervisor', 'cleaner', 'cleaning'].includes(role);

  const [propertyFilter, setPropertyFilter] = useState('all');
  const [frontDrafts, setFrontDrafts] = useState({});
  const [housekeepingDrafts, setHousekeepingDrafts] = useState({});
  const [savingKey, setSavingKey] = useState('');
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');

  const today = todayKey();
  const tomorrow = addDaysKey(1);

  const propertyName = (propertyId) =>
    properties.find((property) => String(property.id) === String(propertyId))?.name || 'Cloudbeds Property';

  const scopedReservations = useMemo(
    () => propertyFilter === 'all'
      ? reservations
      : reservations.filter((reservation) => String(reservation.propertyId) === String(propertyFilter)),
    [reservations, propertyFilter]
  );

  const frontDeskRows = useMemo(
    () => scopedReservations
      .filter((reservation) =>
        [today, tomorrow].includes(String(reservation.arrivalDate || '')) &&
        !['cancelled', 'no_show'].includes(String(reservation.status || '').toLowerCase())
      )
      .sort((a, b) => {
        const byDate = String(a.arrivalDate || '').localeCompare(String(b.arrivalDate || ''));
        if (byDate) return byDate;
        return String(a.arrivalTime || '99:99').localeCompare(String(b.arrivalTime || '99:99'));
      }),
    [scopedReservations, today, tomorrow]
  );

  const scopedRooms = useMemo(
    () => (propertyFilter === 'all' ? rooms : rooms.filter((room) => String(room.propertyId) === String(propertyFilter)))
      .slice()
      .sort((a, b) => {
        const pa = propertyName(a.propertyId);
        const pb = propertyName(b.propertyId);
        const prop = pa.localeCompare(pb);
        if (prop) return prop;
        return String(a.roomNumber || a.id).localeCompare(String(b.roomNumber || b.id), undefined, { numeric: true });
      }),
    [rooms, properties, propertyFilter] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const housekeepingRows = useMemo(() => scopedRooms.map((room) => {
    const roomReservations = reservations
      .filter((reservation) => reservationUsesRoom(reservation, room.id) && reservation.status !== 'cancelled')
      .sort((a, b) => String(a.arrivalDate || '').localeCompare(String(b.arrivalDate || '')));

    const checkout = roomReservations.find((reservation) => reservation.departureDate === today);
    const checkinToday = roomReservations.find((reservation) => reservation.arrivalDate === today);
    const checkinTomorrow = roomReservations.find((reservation) => reservation.arrivalDate === tomorrow);
    const inHouse = roomReservations.find((reservation) =>
      reservation.arrivalDate && reservation.departureDate &&
      reservation.arrivalDate <= today && reservation.departureDate > today &&
      !['checked_out', 'cancelled', 'no_show'].includes(String(reservation.status || ''))
    );
    const incoming = checkinToday || checkinTomorrow || inHouse || null;
    const guestReservation = incoming || checkout || null;
    const hk = housekeeping.find((item) => String(item.roomId) === String(room.id)) || {};

    return {
      room,
      propertyName: propertyName(room.propertyId),
      housekeeping: hk,
      checkOutTime: checkout?.departureTime || (inHouse?.departureDate === today ? inHouse?.departureTime : '') || '',
      checkInTime: incoming?.arrivalTime || '',
      guestCount: guestCountForRoom(guestReservation, room.id),
      movement: checkinToday ? 'Arrival today' : checkinTomorrow ? 'Arrival tomorrow' : checkout ? 'Checkout today' : inHouse ? 'In house' : 'No movement',
    };
  }), [scopedRooms, reservations, housekeeping, today, tomorrow, properties]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftValue = (collection, id, key, fallback = '') => {
    const row = collection[String(id)] || {};
    return Object.prototype.hasOwnProperty.call(row, key) ? row[key] : fallback;
  };

  const setFrontDraft = (id, key, value) => {
    setFrontDrafts((current) => ({
      ...current,
      [String(id)]: { ...(current[String(id)] || {}), [key]: value },
    }));
  };

  const clearFrontDraft = (id, key) => {
    setFrontDrafts((current) => {
      const next = { ...current };
      const row = { ...(next[String(id)] || {}) };
      delete row[key];
      if (Object.keys(row).length) next[String(id)] = row;
      else delete next[String(id)];
      return next;
    });
  };

  const saveFrontDesk = async (reservation, key, value) => {
    const actionKey = `reservation:${reservation.id}:${key}`;
    setSavingKey(actionKey); setLocalError(''); setNotice('');
    const payload = key === 'arrivalTime'
      ? { arrivalTime: value }
      : key === 'departureTime'
        ? { departureTime: value }
        : key === 'onlineCheckin'
          ? { onlineCheckin: value }
          : { notes: value };
    try {
      await updateReservation(reservation.id, payload);
      clearFrontDraft(reservation.id, key);
      setNotice(`${reservation.guestName} updated.`);
    } catch (requestError) {
      setLocalError(requestError.response?.data?.message || requestError.message || 'Front Desk update failed.');
    } finally {
      setSavingKey('');
    }
  };

  const setHousekeepingDraft = (roomId, key, value) => {
    setHousekeepingDrafts((current) => ({
      ...current,
      [String(roomId)]: { ...(current[String(roomId)] || {}), [key]: value },
    }));
  };

  const clearHousekeepingDraft = (roomId, key) => {
    setHousekeepingDrafts((current) => {
      const next = { ...current };
      const row = { ...(next[String(roomId)] || {}) };
      delete row[key];
      if (Object.keys(row).length) next[String(roomId)] = row;
      else delete next[String(roomId)];
      return next;
    });
  };

  const saveHousekeeping = async (room, key, value) => {
    const actionKey = `room:${room.id}:${key}`;
    setSavingKey(actionKey); setLocalError(''); setNotice('');
    const payload = {
      propertyId: room.propertyId,
      roomNumber: room.roomNumber,
      [key]: value,
    };
    try {
      await updateHousekeeping(room.id, payload);
      clearHousekeepingDraft(room.id, key === 'roomCondition' ? 'roomCondition' : key);
      setNotice(`Room ${room.roomNumber || room.id} updated.`);
    } catch (requestError) {
      setLocalError(requestError.response?.data?.message || requestError.message || 'Housekeeping update failed.');
    } finally {
      setSavingKey('');
    }
  };

  const todayCount = frontDeskRows.filter((reservation) => reservation.arrivalDate === today).length;
  const tomorrowCount = frontDeskRows.filter((reservation) => reservation.arrivalDate === tomorrow).length;
  const dirtyCount = housekeepingRows.filter((row) => String(row.housekeeping.roomCondition || 'dirty') === 'dirty').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Front Desk and Housekeeping operational view. Cloudbeds supplies reservations, properties and rooms; all editable operational fields are stored locally in SEM PMS."
        actions={
          <>
            <select
              value={propertyFilter}
              onChange={(event) => setPropertyFilter(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="all">All properties</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
            {!status?.connected && !loading && (
              <button onClick={connect} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white">Connect Cloudbeds</button>
            )}
            {status?.connected && <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">Live sync</div>}
          </>
        }
      />

      {(error || localError) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {localError || error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {notice}
        </div>
      )}

      <Panel
        title="1. Front Desk"
        description="Today's and tomorrow's arrivals across all properties. Arrival/departure times, online check-in and notes are SEM PMS fields."
        action={
          <div className="flex gap-2 text-xs font-bold">
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">Today {todayCount}</span>
            <span className="rounded-full bg-violet-50 px-3 py-1.5 text-violet-700">Tomorrow {tomorrowCount}</span>
          </div>
        }
      >
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading Front Desk…</div>
        ) : frontDeskRows.length ? (
          <TableShell>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Property</Th>
                <Th>Guest</Th>
                <Th>Guests</Th>
                <Th>Arrival time</Th>
                <Th>Departure time</Th>
                <Th>Phone</Th>
                <Th>Online check-in</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {frontDeskRows.map((reservation) => {
                const isTomorrow = reservation.arrivalDate === tomorrow;
                const arrivalValue = draftValue(frontDrafts, reservation.id, 'arrivalTime', reservation.arrivalTime || '');
                const departureValue = draftValue(frontDrafts, reservation.id, 'departureTime', reservation.departureTime || '');
                const onlineValue = draftValue(frontDrafts, reservation.id, 'onlineCheckin', Boolean(reservation.onlineCheckin));
                const notesValue = draftValue(frontDrafts, reservation.id, 'notes', reservation.guestNotes || '');
                return (
                  <tr key={reservation.id} className="align-top hover:bg-slate-50/60">
                    <Td>
                      <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${isTomorrow ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>
                        {isTomorrow ? 'Tomorrow' : 'Today'}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">{formatDate(reservation.arrivalDate)}</div>
                    </Td>
                    <Td><div className="max-w-40 text-sm font-semibold text-slate-800">{propertyName(reservation.propertyId)}</div></Td>
                    <Td>
                      <div className="font-semibold text-slate-950">{reservation.guestName}</div>
                      <div className="mt-1 text-[10px] font-mono text-slate-400">#{reservation.id}</div>
                    </Td>
                    <Td className="font-bold text-slate-900">{Number(reservation.guestCount || 1)}</Td>
                    <Td>
                      <input
                        type="time"
                        value={arrivalValue}
                        disabled={!canEditFrontDesk}
                        onChange={(event) => setFrontDraft(reservation.id, 'arrivalTime', event.target.value)}
                        onBlur={(event) => {
                          if (event.target.value !== String(reservation.arrivalTime || '')) saveFrontDesk(reservation, 'arrivalTime', event.target.value);
                        }}
                        className={inputClass}
                      />
                      {savingKey === `reservation:${reservation.id}:arrivalTime` && <div className="mt-1 text-[10px] font-bold text-blue-600">Saving…</div>}
                    </Td>
                    <Td>
                      <input
                        type="time"
                        value={departureValue}
                        disabled={!canEditFrontDesk}
                        onChange={(event) => setFrontDraft(reservation.id, 'departureTime', event.target.value)}
                        onBlur={(event) => {
                          if (event.target.value !== String(reservation.departureTime || '')) saveFrontDesk(reservation, 'departureTime', event.target.value);
                        }}
                        className={inputClass}
                      />
                    </Td>
                    <Td>
                      {reservation.guestPhone ? <a href={`tel:${reservation.guestPhone}`} className="whitespace-nowrap text-sm font-semibold text-blue-700">{reservation.guestPhone}</a> : <span className="text-slate-400">—</span>}
                    </Td>
                    <Td>
                      <select
                        value={onlineValue ? 'yes' : 'no'}
                        disabled={!canEditFrontDesk}
                        onChange={(event) => {
                          const next = event.target.value === 'yes';
                          setFrontDraft(reservation.id, 'onlineCheckin', next);
                          saveFrontDesk(reservation, 'onlineCheckin', next);
                        }}
                        className={compactSelect}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </Td>
                    <Td>
                      <textarea
                        rows={2}
                        value={notesValue}
                        disabled={!canEditFrontDesk}
                        onChange={(event) => setFrontDraft(reservation.id, 'notes', event.target.value)}
                        onBlur={(event) => {
                          if (event.target.value !== String(reservation.guestNotes || '')) saveFrontDesk(reservation, 'notes', event.target.value);
                        }}
                        placeholder="Notes…"
                        className="min-w-[180px] resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="No arrivals today or tomorrow" description="No active Cloudbeds reservations match the selected property." />
        )}
      </Panel>

      <Panel
        title="2. Housekeeping"
        description="Room readiness and supplies. Check-in time, check-out time and guest count are read automatically from the Front Desk / reservation data."
        action={<span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">Dirty {dirtyCount}</span>}
      >
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading Housekeeping…</div>
        ) : housekeepingRows.length ? (
          <TableShell>
            <thead>
              <tr>
                <Th>Property</Th>
                <Th>Room</Th>
                <Th>Cleanliness</Th>
                <Th>Refill</Th>
                <Th>Extra linens</Th>
                <Th>Check-out time</Th>
                <Th>Check-in time</Th>
                <Th>Guests</Th>
                <Th>Movement</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {housekeepingRows.map(({ room, propertyName: roomProperty, housekeeping: hk, checkOutTime, checkInTime, guestCount, movement }) => {
                const conditionFallback = ['clean', 'dirty', 'inspected'].includes(String(hk.roomCondition || '')) ? hk.roomCondition : 'dirty';
                const condition = draftValue(housekeepingDrafts, room.id, 'roomCondition', conditionFallback);
                const refill = draftValue(housekeepingDrafts, room.id, 'refill', Boolean(hk.refill));
                const extraLinens = draftValue(housekeepingDrafts, room.id, 'extraLinens', hk.extraLinens || '');
                return (
                  <tr key={room.id} className="align-top hover:bg-slate-50/60">
                    <Td><div className="max-w-44 text-sm font-semibold text-slate-800">{roomProperty}</div></Td>
                    <Td>
                      <div className="font-bold text-slate-950">{room.roomNumber || room.id}</div>
                      <div className="mt-1 text-[11px] text-slate-400">{room.roomType || 'Room'}</div>
                    </Td>
                    <Td>
                      <select
                        value={condition}
                        disabled={!canEditHousekeeping}
                        onChange={(event) => {
                          const next = event.target.value;
                          setHousekeepingDraft(room.id, 'roomCondition', next);
                          saveHousekeeping(room, 'roomCondition', next);
                        }}
                        className={compactSelect}
                      >
                        <option value="clean">Clean</option>
                        <option value="dirty">Dirty</option>
                        <option value="inspected">Inspected</option>
                      </select>
                    </Td>
                    <Td>
                      <select
                        value={refill ? 'yes' : 'no'}
                        disabled={!canEditHousekeeping}
                        onChange={(event) => {
                          const next = event.target.value === 'yes';
                          setHousekeepingDraft(room.id, 'refill', next);
                          saveHousekeeping(room, 'refill', next);
                        }}
                        className={compactSelect}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </Td>
                    <Td>
                      <input
                        value={extraLinens}
                        disabled={!canEditHousekeeping}
                        onChange={(event) => setHousekeepingDraft(room.id, 'extraLinens', event.target.value)}
                        onBlur={(event) => {
                          if (event.target.value !== String(hk.extraLinens || '')) saveHousekeeping(room, 'extraLinens', event.target.value);
                        }}
                        placeholder="e.g. 2 towels"
                        className={inputClass}
                      />
                    </Td>
                    <Td className="font-semibold text-slate-900">{formatTime(checkOutTime)}</Td>
                    <Td className="font-semibold text-slate-900">{formatTime(checkInTime)}</Td>
                    <Td className="font-bold text-slate-950">{guestCount}</Td>
                    <Td><StatusBadge status={movement} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="No rooms available" description="Cloudbeds did not return rooms for the selected property." />
        )}
      </Panel>
    </div>
  );
};

export default DashboardPage;

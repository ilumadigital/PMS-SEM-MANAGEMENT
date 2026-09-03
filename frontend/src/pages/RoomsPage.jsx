import React, { useContext, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import {
  EmptyState,
  MetricCard,
  PageHeader,
  Panel,
  StatusBadge,
  TableShell,
  Td,
  Th,
  formatDate,
} from '../components/PmsUi';

const RoomsPage = () => {
  const {
    rooms,
    properties,
    reservations,
    housekeeping,
    diagnostics,
    loading,
    error,
    status,
    refresh,
    connect,
  } = useContext(CloudbedsDataContext);

  const [propertyFilter, setPropertyFilter] = useState('all');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rooms
      .map((room) => {
        const property = properties.find((item) => item.id === room.propertyId);
        const roomReservations = reservations
          .filter((reservation) => {
            const ids = reservation.roomIds?.length
              ? reservation.roomIds.map(String)
              : [String(reservation.roomId || '')];
            return ids.includes(String(room.id));
          })
          .sort((a, b) => String(a.arrivalDate || '').localeCompare(String(b.arrivalDate || '')));

        const nextReservation =
          roomReservations.find((reservation) => reservation.id === room.nextArrivalBookingId) ||
          roomReservations.find(
            (reservation) =>
              reservation.arrivalDate &&
              reservation.arrivalDate >= new Date().toISOString().slice(0, 10) &&
              reservation.status !== 'cancelled'
          ) ||
          null;

        const hk =
          room.housekeeping ||
          housekeeping.find((item) => String(item.roomId) === String(room.id)) ||
          null;

        return { ...room, property, nextReservation, housekeeping: hk };
      })
      .filter((room) => {
        const propertyMatch =
          propertyFilter === 'all' || room.propertyId === propertyFilter;
        if (!propertyMatch) return false;
        if (!term) return true;

        return [
          room.roomNumber,
          room.roomType,
          room.property?.name,
          room.currentGuest,
          room.housekeeping?.status,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      });
  }, [rooms, properties, reservations, housekeeping, propertyFilter, search]);

  const occupied = rooms.filter((room) =>
    ['occupied', 'checkout_today'].includes(room.occupancyStatus)
  ).length;
  const dirty = housekeeping.filter((item) => item.roomCondition === 'dirty').length;
  const clean = housekeeping.filter((item) => item.roomCondition === 'clean').length;
  const missingRoomScope = (diagnostics?.missingScopes || []).includes('read:room');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rooms"
        description="Live Cloudbeds rooms, occupancy, next arrival and housekeeping status."
        actions={
          <button
            onClick={status?.connected ? refresh : connect}
            className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {status?.connected ? 'Refresh Cloudbeds' : 'Connect Cloudbeds'}
          </button>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {missingRoomScope && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Cloudbeds is connected, but <strong>Rooms READ</strong> is not granted. Room rows may be inferred from reservations instead of the official room inventory.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard label="Rooms" value={loading ? '…' : rooms.length} helper="Cloudbeds inventory / assigned rooms" />
        <MetricCard label="Occupied" value={loading ? '…' : occupied} tone="blue" />
        <MetricCard label="Dirty" value={loading ? '…' : dirty} tone={dirty ? 'amber' : 'default'} />
        <MetricCard label="Clean" value={loading ? '…' : clean} tone="green" />
      </div>

      <Panel title="Room overview" description="Search room inventory and current operational state.">
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_240px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search room, type, guest, property or housekeeping status…"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
          />
          <select
            value={propertyFilter}
            onChange={(event) => setPropertyFilter(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
          >
            <option value="all">All properties</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>{property.name}</option>
            ))}
          </select>
        </div>

        {rows.length ? (
          <TableShell>
            <thead>
              <tr>
                <Th>Room</Th>
                <Th>Room type</Th>
                <Th>Property</Th>
                <Th>Occupancy</Th>
                <Th>Current guest</Th>
                <Th>Housekeeping</Th>
                <Th>Next arrival</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((room) => (
                <tr key={room.id} className="hover:bg-slate-50">
                  <Td>
                    <div className="font-semibold text-slate-950">{room.roomNumber || room.id}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500">{room.id}</div>
                  </Td>
                  <Td>{room.roomType || '—'}</Td>
                  <Td>{room.property?.name || 'Cloudbeds property'}</Td>
                  <Td><StatusBadge status={room.occupancyStatus || 'unknown'} /></Td>
                  <Td>{room.currentGuest || '—'}</Td>
                  <Td>
                    <StatusBadge status={room.housekeeping?.status || room.housekeepingStatus || 'not tracked'} />
                  </Td>
                  <Td>
                    {room.nextReservation ? (
                      <div>
                        <div className="font-medium text-slate-900">{room.nextReservation.guestName}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{formatDate(room.nextReservation.arrivalDate)}</div>
                      </div>
                    ) : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState
            title="No rooms returned"
            description={status?.connected
              ? 'Cloudbeds did not return room inventory for the connected property.'
              : 'Connect Cloudbeds to load room inventory.'}
          />
        )}
      </Panel>
    </div>
  );
};

export default RoomsPage;

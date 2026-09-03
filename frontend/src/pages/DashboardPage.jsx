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
  addDaysKey,
  formatDate,
  formatTime,
  todayKey,
} from '../components/PmsUi';

const DashboardPage = () => {
  const {
    reservations,
    properties,
    rooms,
    customers,
    housekeeping,
    dashboard,
    diagnostics,
    status,
    loading,
    error,
    refresh,
    connect,
  } = useContext(CloudbedsDataContext);

  const [propertyFilter, setPropertyFilter] = useState('all');

  const scopedReservations = useMemo(
    () =>
      propertyFilter === 'all'
        ? reservations
        : reservations.filter((reservation) => reservation.propertyId === propertyFilter),
    [reservations, propertyFilter]
  );

  const today = todayKey();
  const weekEnd = addDaysKey(7);

  const todayArrivals = scopedReservations
    .filter((reservation) => reservation.arrivalDate === today && reservation.status !== 'cancelled')
    .sort((a, b) => String(a.arrivalTime || '99:99').localeCompare(String(b.arrivalTime || '99:99')));

  const todayDepartures = scopedReservations
    .filter((reservation) => reservation.departureDate === today && reservation.status !== 'cancelled')
    .sort((a, b) => String(a.departureTime || '99:99').localeCompare(String(b.departureTime || '99:99')));

  const inHouse = scopedReservations.filter((reservation) => {
    if (reservation.status === 'in_house') return true;
    return (
      reservation.arrivalDate &&
      reservation.departureDate &&
      reservation.arrivalDate <= today &&
      reservation.departureDate > today &&
      reservation.status !== 'cancelled'
    );
  });

  const upcoming = scopedReservations
    .filter(
      (reservation) =>
        reservation.arrivalDate > today &&
        reservation.arrivalDate <= weekEnd &&
        reservation.status !== 'cancelled'
    )
    .sort((a, b) => String(a.arrivalDate).localeCompare(String(b.arrivalDate)))
    .slice(0, 8);

  const missingInfo = scopedReservations.filter(
    (reservation) => (reservation.missingFields || []).length > 0 && reservation.status !== 'cancelled'
  );

  const scopedRooms =
    propertyFilter === 'all' ? rooms : rooms.filter((room) => room.propertyId === propertyFilter);

  const occupiedRooms = scopedRooms.filter((room) =>
    ['occupied', 'checkout_today'].includes(room.occupancyStatus)
  ).length;

  const derivedOccupancy = scopedRooms.length
    ? Math.round((occupiedRooms / scopedRooms.length) * 100)
    : 0;

  const useCloudbedsDashboard = propertyFilter === 'all' && dashboard;
  const displayArrivals = useCloudbedsDashboard ? Number(dashboard.arrivals || 0) : todayArrivals.length;
  const displayDepartures = useCloudbedsDashboard ? Number(dashboard.departures || 0) : todayDepartures.length;
  const displayInHouse = useCloudbedsDashboard ? Number(dashboard.inHouse || 0) : inHouse.length;
  const occupancy = useCloudbedsDashboard
    ? Number(dashboard.percentageOccupied || derivedOccupancy || 0)
    : derivedOccupancy;

  const accessCounts = diagnostics?.counts || {
    reservations: reservations.length,
    guests: customers.length,
    rooms: rooms.length,
    housekeeping: housekeeping.length,
  };
  const missingScopes = diagnostics?.missingScopes || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Live operational overview from the connected Cloudbeds sandbox."
        actions={
          <>
            <select
              value={propertyFilter}
              onChange={(event) => setPropertyFilter(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="all">All properties</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>{property.name}</option>
              ))}
            </select>
            <button
              onClick={status?.connected ? refresh : connect}
              className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              {status?.connected ? 'Refresh Cloudbeds' : 'Connect Cloudbeds'}
            </button>
          </>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <div className="text-sm font-semibold text-rose-800">Cloudbeds sync issue</div>
          <div className="mt-1 text-xs text-rose-700">{error}</div>
        </div>
      )}

      {!status?.connected && !loading && !error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Connect Cloudbeds to populate the PMS with live reservations, guests and rooms.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Arrivals today" value={loading ? '…' : displayArrivals} helper={`${upcoming.length} arriving in next 7 days`} tone="blue" />
        <MetricCard label="Departures today" value={loading ? '…' : displayDepartures} helper="Scheduled departures" />
        <MetricCard label="In house" value={loading ? '…' : displayInHouse} helper="Currently staying" tone="green" />
        <MetricCard label="Occupancy" value={loading ? '…' : `${occupancy}%`} helper={`${occupiedRooms}/${scopedRooms.length} tracked rooms`} />
        <MetricCard label="Missing info" value={loading ? '…' : missingInfo.length} helper="Arrival/departure details" tone={missingInfo.length ? 'amber' : 'green'} />
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.65fr_0.85fr]">
        <Panel
          title="Today's arrivals"
          description="Guests due to arrive today, ordered by arrival time."
          action={<a href="/reception" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Open Front Desk</a>}
        >
          {todayArrivals.length ? (
            <TableShell>
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Guest</Th>
                  <Th>Reservation</Th>
                  <Th>Room</Th>
                  <Th>Status</Th>
                  <Th>Property</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {todayArrivals.map((reservation) => (
                  <tr key={reservation.id} className="hover:bg-slate-50/70">
                    <Td className="font-semibold text-slate-950">{formatTime(reservation.arrivalTime)}</Td>
                    <Td>
                      <div className="font-semibold text-slate-950">{reservation.guestName}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{reservation.guestEmail || reservation.guestPhone || 'No contact details'}</div>
                    </Td>
                    <Td className="font-mono text-xs">{reservation.id}</Td>
                    <Td>{reservation.roomNumber || 'Unassigned'}</Td>
                    <Td><StatusBadge status={reservation.status} /></Td>
                    <Td>{reservation.property?.name || 'Cloudbeds property'}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          ) : (
            <EmptyState title="No arrivals today" description="Cloudbeds has no active arrivals for the selected property today." />
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="Front desk snapshot" description="Today's movement">
            <div className="divide-y divide-slate-100">
              <SnapshotRow label="Arrivals" value={displayArrivals} />
              <SnapshotRow label="Departures" value={displayDepartures} />
              <SnapshotRow label="In-house guests" value={displayInHouse} />
              <SnapshotRow label="Reservations needing info" value={missingInfo.length} warning={missingInfo.length > 0} />
            </div>
          </Panel>

          <Panel title="Cloudbeds connection" description="Sandbox integration status">
            <div className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Status</span>
                <StatusBadge status={error ? 'error' : status?.connected ? 'healthy' : 'not connected'} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Reservations loaded</span>
                <span className="text-sm font-semibold text-slate-950">{reservations.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Properties detected</span>
                <span className="text-sm font-semibold text-slate-950">{properties.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">API target</span>
                <span className="max-w-[220px] truncate text-right text-xs font-medium text-slate-700" title={status?.cloudbedsApiBase || ''}>
                  {status?.cloudbedsApiBase ? status.cloudbedsApiBase.replace(/^https?:\/\//, '') : 'Resolving…'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Property IDs</span>
                <span className="max-w-[220px] truncate text-right text-xs font-medium text-slate-700">
                  {(status?.connectedPropertyIds || []).join(', ') || 'Not detected yet'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                <div>
                  <div className="text-slate-500">Guests</div>
                  <div className="mt-1 font-bold text-slate-900">{accessCounts.guests || 0}</div>
                </div>
                <div>
                  <div className="text-slate-500">Rooms</div>
                  <div className="mt-1 font-bold text-slate-900">{accessCounts.rooms || 0}</div>
                </div>
                <div>
                  <div className="text-slate-500">Housekeeping</div>
                  <div className="mt-1 font-bold text-slate-900">{accessCounts.housekeeping || 0}</div>
                </div>
                <div>
                  <div className="text-slate-500">Reservation API</div>
                  <div className="mt-1 truncate font-bold text-slate-900" title={status?.cloudbedsReservationEndpoint || diagnostics?.reservationEndpoint || ''}>
                    {status?.cloudbedsReservationEndpoint || diagnostics?.reservationEndpoint || '—'}
                  </div>
                </div>
              </div>
              {missingScopes.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs font-semibold text-amber-800">Cloudbeds permissions still missing</div>
                  <div className="mt-1 text-xs text-amber-700">{missingScopes.join(', ')}</div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Last sync</span>
                <span className="text-right text-xs font-medium text-slate-700">{status?.lastSyncAt || 'Live request'}</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Upcoming arrivals" description="Next seven days from Cloudbeds">
        {upcoming.length ? (
          <TableShell>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Guest</Th>
                <Th>Room</Th>
                <Th>Nights</Th>
                <Th>Source</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {upcoming.map((reservation) => (
                <tr key={reservation.id} className="hover:bg-slate-50/70">
                  <Td className="font-semibold text-slate-950">{formatDate(reservation.arrivalDate)}</Td>
                  <Td>{reservation.guestName}</Td>
                  <Td>{reservation.roomNumber || 'Unassigned'}</Td>
                  <Td>{reservation.nights || '—'}</Td>
                  <Td>{reservation.cloudbedsSource || 'Cloudbeds'}</Td>
                  <Td><StatusBadge status={reservation.status} /></Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="No upcoming arrivals" description="No arrivals are scheduled in the next seven days." />
        )}
      </Panel>
    </div>
  );
};

const SnapshotRow = ({ label, value, warning = false }) => (
  <div className="flex items-center justify-between px-5 py-3.5">
    <span className="text-sm text-slate-600">{label}</span>
    <span className={`text-sm font-bold ${warning ? 'text-amber-700' : 'text-slate-950'}`}>{value}</span>
  </div>
);

export default DashboardPage;

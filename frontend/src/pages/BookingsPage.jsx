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
  formatMoney,
} from '../components/PmsUi';

const BookingsPage = () => {
  const { reservations, properties, diagnostics, loading, status, error, refresh, connect, reauthorize } =
    useContext(CloudbedsDataContext);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return reservations.filter((reservation) => {
      const searchMatch =
        !term ||
        [
          reservation.id,
          reservation.guestName,
          reservation.guestEmail,
          reservation.guestPhone,
          reservation.roomNumber,
          reservation.roomType,
          reservation.cloudbedsSource,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));

      const statusMatch =
        statusFilter === 'all' || reservation.status === statusFilter;
      const propertyMatch =
        propertyFilter === 'all' || reservation.propertyId === propertyFilter;

      return searchMatch && statusMatch && propertyMatch;
    });
  }, [reservations, search, statusFilter, propertyFilter]);

  const selected =
    reservations.find((reservation) => reservation.id === selectedId) ||
    filtered[0] ||
    null;

  const confirmed = reservations.filter((item) => item.status === 'confirmed').length;
  const inHouse = reservations.filter((item) => item.status === 'in_house').length;
  const cancelled = reservations.filter((item) => item.status === 'cancelled').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservations"
        description="All reservations loaded directly from the connected Cloudbeds sandbox."
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
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <div className="text-sm font-semibold text-rose-800">Cloudbeds sync issue</div>
          <div className="mt-1 text-xs text-rose-700">{error}</div>
        </div>
      )}
      {status?.connected && !loading && reservations.length === 0 && !error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-amber-900">
                Cloudbeds is connected, but no reservation records were returned
              </div>
              <div className="mt-1 text-xs leading-5 text-amber-800">
                API: {status?.cloudbedsReservationEndpoint || diagnostics?.reservationEndpoint || 'getReservations'} ·
                Property IDs: {(status?.connectedPropertyIds || []).join(', ') || 'not captured'}.
                {(diagnostics?.missingScopes || []).length
                  ? ` Missing permissions: ${diagnostics.missingScopes.join(', ')}.`
                  : ''}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={refresh} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900">
                Retry API
              </button>
              <button onClick={reauthorize} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800">
                Disconnect & re-authorize
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard label="Total" value={loading ? '…' : reservations.length} helper="Cloudbeds records" />
        <MetricCard label="Confirmed" value={loading ? '…' : confirmed} tone="green" />
        <MetricCard label="In house" value={loading ? '…' : inHouse} tone="blue" />
        <MetricCard label="Cancelled" value={loading ? '…' : cancelled} tone={cancelled ? 'rose' : 'default'} />
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1fr_360px]">
        <Panel title="Reservation list" description="Search and filter Cloudbeds reservations.">
          <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_180px_220px_auto]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reservation, guest, email, phone or room…"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_house">In house</option>
              <option value="pending_confirmation">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={propertyFilter}
              onChange={(event) => setPropertyFilter(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">All properties</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setPropertyFilter('all');
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset
            </button>
          </div>

          {filtered.length ? (
            <TableShell>
              <thead>
                <tr>
                  <Th>Reservation</Th>
                  <Th>Guest</Th>
                  <Th>Check-in</Th>
                  <Th>Check-out</Th>
                  <Th>Room</Th>
                  <Th>Nights</Th>
                  <Th>Status</Th>
                  <Th>Source</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((reservation) => (
                  <tr
                    key={reservation.id}
                    onClick={() => setSelectedId(reservation.id)}
                    className={[
                      'cursor-pointer hover:bg-slate-50',
                      selected?.id === reservation.id ? 'bg-blue-50/60' : '',
                    ].join(' ')}
                  >
                    <Td className="font-mono text-xs font-semibold text-slate-800">
                      {reservation.id}
                    </Td>
                    <Td>
                      <div className="font-semibold text-slate-950">{reservation.guestName}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {reservation.guestEmail || reservation.guestPhone || 'No contact details'}
                      </div>
                    </Td>
                    <Td>{formatDate(reservation.arrivalDate)}</Td>
                    <Td>{formatDate(reservation.departureDate)}</Td>
                    <Td>
                      <div className="font-semibold text-slate-900">{reservation.roomNumber || 'Unassigned'}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{reservation.roomType || '—'}</div>
                    </Td>
                    <Td>{reservation.nights || '—'}</Td>
                    <Td><StatusBadge status={reservation.status} /></Td>
                    <Td>{reservation.cloudbedsSource || 'Cloudbeds'}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          ) : (
            <EmptyState
              title="No reservations found"
              description={
                status?.connected && reservations.length === 0
                  ? 'The connected Cloudbeds token returned no reservations. Use the diagnostic banner above to retry or re-authorize the property.'
                  : status?.connected
                    ? 'Try changing the filters.'
                    : 'Connect Cloudbeds to load reservations.'
              }
            />
          )}
        </Panel>

        <Panel title="Reservation details" description="Selected Cloudbeds record">
          {selected ? (
            <div className="space-y-5 p-5">
              <div>
                <div className="text-lg font-bold text-slate-950">{selected.guestName}</div>
                <div className="mt-1 font-mono text-xs text-slate-500">{selected.id}</div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <Detail label="Check-in" value={formatDate(selected.arrivalDate)} />
                <Detail label="Check-out" value={formatDate(selected.departureDate)} />
                <Detail label="Room" value={selected.roomNumber || 'Unassigned'} />
                <Detail label="Room type" value={selected.roomType || '—'} />
                <Detail label="Nights" value={selected.nights || '—'} />
                <Detail label="Total" value={formatMoney(selected.totalPrice)} />
                <Detail label="Source" value={selected.cloudbedsSource || 'Cloudbeds'} />
                <Detail label="Property" value={selected.property?.name || 'Cloudbeds property'} />
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Guest contact</div>
                <div className="mt-2 text-sm text-slate-800">{selected.guestEmail || 'No email available'}</div>
                <div className="mt-1 text-sm text-slate-800">{selected.guestPhone || 'No phone available'}</div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
                  <StatusBadge status={selected.status} />
                </div>
              </div>

              {(selected.missingFields || []).length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs font-semibold text-amber-800">Missing operational info</div>
                  <div className="mt-1 text-xs text-amber-700">{selected.missingFields.join(', ')}</div>
                </div>
              )}

              {selected.guestNotes && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Internal notes</div>
                  <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{selected.guestNotes}</div>
                </div>
              )}

              {(selected.specialRequests || []).length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Special requests</div>
                  <div className="mt-2 space-y-2">
                    {selected.specialRequests.map((request, index) => (
                      <div key={`${request}-${index}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700">
                        {request}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState title="Select a reservation" description="Choose a reservation from the list." />
          )}
        </Panel>
      </div>
    </div>
  );
};

const Detail = ({ label, value }) => (
  <div>
    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
  </div>
);

export default BookingsPage;

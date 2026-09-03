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
  formatTime,
  todayKey,
} from '../components/PmsUi';

const ReceptionDash = () => {
  const { reservations, loading, refresh } = useContext(CloudbedsDataContext);
  const [view, setView] = useState('today');
  const [search, setSearch] = useState('');

  const today = todayKey();

  const arrivals = reservations.filter(
    (reservation) => reservation.arrivalDate === today && reservation.status !== 'cancelled'
  );
  const departures = reservations.filter(
    (reservation) => reservation.departureDate === today && reservation.status !== 'cancelled'
  );
  const inHouse = reservations.filter((reservation) => {
    if (reservation.status === 'in_house') return true;
    return (
      reservation.arrivalDate &&
      reservation.departureDate &&
      reservation.arrivalDate <= today &&
      reservation.departureDate > today &&
      reservation.status !== 'cancelled'
    );
  });

  const rows = useMemo(() => {
    let list;
    if (view === 'arrivals') list = arrivals.map((reservation) => ({ ...reservation, movement: 'Arrival' }));
    else if (view === 'departures') list = departures.map((reservation) => ({ ...reservation, movement: 'Departure' }));
    else if (view === 'inhouse') list = inHouse.map((reservation) => ({ ...reservation, movement: 'In house' }));
    else {
      list = [
        ...arrivals.map((reservation) => ({ ...reservation, movement: 'Arrival' })),
        ...departures.map((reservation) => ({ ...reservation, movement: 'Departure' })),
      ];
    }

    const term = search.trim().toLowerCase();
    return list
      .filter((reservation) => {
        if (!term) return true;
        return [reservation.guestName, reservation.id, reservation.roomNumber, reservation.guestEmail, reservation.guestPhone]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .sort((a, b) => {
        const aTime = a.movement === 'Departure' ? a.departureTime : a.arrivalTime;
        const bTime = b.movement === 'Departure' ? b.departureTime : b.arrivalTime;
        return String(aTime || '99:99').localeCompare(String(bTime || '99:99'));
      });
  }, [view, search, arrivals, departures, inHouse]);

  const missingInfo = reservations.filter(
    (reservation) => (reservation.missingFields || []).length > 0 && reservation.status !== 'cancelled'
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Front Desk"
        description="Today's Cloudbeds arrivals, departures and in-house guests in one operational view."
        actions={
          <button onClick={refresh} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Refresh Cloudbeds
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard label="Arrivals" value={loading ? '…' : arrivals.length} helper="Today" tone="blue" />
        <MetricCard label="Departures" value={loading ? '…' : departures.length} helper="Today" />
        <MetricCard label="In house" value={loading ? '…' : inHouse.length} helper="Active stays" tone="green" />
        <MetricCard label="Missing info" value={loading ? '…' : missingInfo} helper="Needs reception review" tone={missingInfo ? 'amber' : 'green'} />
      </div>

      <Panel
        title="Guest movement"
        description="Live front desk queue from Cloudbeds."
        action={
          <div className="flex flex-wrap gap-2">
            {[
              ['today', 'Today'],
              ['arrivals', 'Arrivals'],
              ['departures', 'Departures'],
              ['inhouse', 'In house'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={[
                  'rounded-lg px-3 py-1.5 text-xs font-semibold',
                  view === key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <div className="border-b border-slate-100 p-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search guest, reservation, room, email or phone…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
          />
        </div>

        {rows.length ? (
          <TableShell>
            <thead>
              <tr>
                <Th>Movement</Th>
                <Th>Time</Th>
                <Th>Guest</Th>
                <Th>Room</Th>
                <Th>Stay</Th>
                <Th>Status</Th>
                <Th>Contact</Th>
                <Th>Info</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((reservation) => {
                const time = reservation.movement === 'Departure' ? reservation.departureTime : reservation.arrivalTime;
                return (
                  <tr key={`${reservation.movement}-${reservation.id}`} className="hover:bg-slate-50">
                    <Td>
                      <span className={[
                        'rounded-full px-2.5 py-1 text-xs font-semibold',
                        reservation.movement === 'Arrival'
                          ? 'bg-blue-50 text-blue-700'
                          : reservation.movement === 'Departure'
                            ? 'bg-violet-50 text-violet-700'
                            : 'bg-emerald-50 text-emerald-700',
                      ].join(' ')}>
                        {reservation.movement}
                      </span>
                    </Td>
                    <Td className="font-semibold text-slate-950">{formatTime(time)}</Td>
                    <Td>
                      <div className="font-semibold text-slate-950">{reservation.guestName}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-500">{reservation.id}</div>
                    </Td>
                    <Td>{reservation.roomNumber || 'Unassigned'}</Td>
                    <Td>
                      <div className="text-xs text-slate-700">{formatDate(reservation.arrivalDate)}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">to {formatDate(reservation.departureDate)}</div>
                    </Td>
                    <Td><StatusBadge status={reservation.status} /></Td>
                    <Td><div className="text-xs text-slate-700">{reservation.guestEmail || reservation.guestPhone || '—'}</div></Td>
                    <Td>
                      {(reservation.missingFields || []).length
                        ? <span className="text-xs font-semibold text-amber-700">{(reservation.missingFields || []).length} missing</span>
                        : <span className="text-xs font-semibold text-emerald-700">Complete</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="No guest movements" description="No Cloudbeds reservations match this view." />
        )}
      </Panel>
    </div>
  );
};

export default ReceptionDash;

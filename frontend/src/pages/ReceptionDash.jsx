import React, { useContext, useMemo, useState } from 'react';
import api from '../services/api';
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
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);

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

  const baseRows = useMemo(() => {
    if (view === 'arrivals') return arrivals.map((reservation) => ({ ...reservation, movement: 'Arrival' }));
    if (view === 'departures') return departures.map((reservation) => ({ ...reservation, movement: 'Departure' }));
    if (view === 'inhouse') return inHouse.map((reservation) => ({ ...reservation, movement: 'In house' }));

    const map = new Map();
    arrivals.forEach((reservation) => map.set(`a-${reservation.id}`, { ...reservation, movement: 'Arrival' }));
    departures.forEach((reservation) => map.set(`d-${reservation.id}`, { ...reservation, movement: 'Departure' }));
    return Array.from(map.values());
  }, [view, arrivals, departures, inHouse]);

  const filteredRows = baseRows
    .filter((reservation) => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return [
        reservation.guestName,
        reservation.guestEmail,
        reservation.guestPhone,
        reservation.id,
        reservation.roomNumber,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    })
    .sort((a, b) => {
      const aTime = a.movement === 'Departure' ? a.departureTime : a.arrivalTime;
      const bTime = b.movement === 'Departure' ? b.departureTime : b.arrivalTime;
      return String(aTime || '99:99').localeCompare(String(bTime || '99:99'));
    });

  const selected =
    reservations.find((reservation) => reservation.id === selectedId) ||
    (filteredRows.length ? filteredRows[0] : null);

  const missingInfo = reservations.filter(
    (reservation) => (reservation.missingFields || []).length > 0 && reservation.status !== 'cancelled'
  );

  const saveField = async (reservationId, field, value) => {
    setSaving(true);
    try {
      await api.put(
        `/integrations/cloudbeds/reservations/${encodeURIComponent(reservationId)}/operations`,
        { [field]: value }
      );
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Front Desk"
        description="Today's arrivals, departures and in-house guests from Cloudbeds."
        actions={
          <button onClick={refresh} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Refresh
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard label="Arrivals" value={loading ? '…' : arrivals.length} helper="Today" tone="blue" />
        <MetricCard label="Departures" value={loading ? '…' : departures.length} helper="Today" />
        <MetricCard label="In house" value={loading ? '…' : inHouse.length} helper="Active stays" tone="green" />
        <MetricCard label="Missing info" value={loading ? '…' : missingInfo.length} helper="Needs front desk action" tone={missingInfo.length ? 'amber' : 'green'} />
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.7fr_0.8fr]">
        <Panel
          title="Guest movement"
          description="Use the filters to focus on arrivals, departures or guests currently in house."
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
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    view === key
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
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
              placeholder="Search guest, reservation, room, email or phone..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500"
            />
          </div>

          {filteredRows.length ? (
            <TableShell>
              <thead>
                <tr>
                  <Th>Movement</Th>
                  <Th>Time</Th>
                  <Th>Guest</Th>
                  <Th>Room</Th>
                  <Th>Stay</Th>
                  <Th>Status</Th>
                  <Th>Info</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((reservation) => {
                  const active = selected?.id === reservation.id;
                  return (
                    <tr
                      key={`${reservation.movement}-${reservation.id}`}
                      onClick={() => setSelectedId(reservation.id)}
                      className={`cursor-pointer ${active ? 'bg-blue-50/70' : 'hover:bg-slate-50/70'}`}
                    >
                      <Td>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          reservation.movement === 'Arrival'
                            ? 'bg-blue-50 text-blue-700'
                            : reservation.movement === 'Departure'
                              ? 'bg-violet-50 text-violet-700'
                              : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {reservation.movement}
                        </span>
                      </Td>
                      <Td className="font-semibold text-slate-950">
                        {reservation.movement === 'Departure'
                          ? formatTime(reservation.departureTime)
                          : formatTime(reservation.arrivalTime)}
                      </Td>
                      <Td>
                        <div className="font-semibold text-slate-950">{reservation.guestName}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-slate-500">{reservation.id}</div>
                      </Td>
                      <Td>{reservation.roomNumber || 'Unassigned'}</Td>
                      <Td>
                        <div className="text-xs text-slate-700">{formatDate(reservation.arrivalDate)}</div>
                        <div className="mt-0.5 text-[11px] text--slate-500">to {formatDate(reservation.departureDate)}</div>
                      </Td>
                      <Td><StatusBadge status={reservation.status} /></Td>
                      <Td>
                        {(reservation.missingFields || []).length ? (
                          <span className="text-xs font-semibold text-amber-700">
                            {(reservation.missingFields || []).length} missing
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-700">Complete</span>
                        )}
                      </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="No guests in this view" description="No Cloudbeds reservations match the selected front desk filter." />
        )}
      </Panel>

      <Panel title="Reservation control" description="Operational details saved locally in SEM PMS">
        {selected ? (
          <ReservationControl reservation={selected} onSave={saveField} saving={saving} />
        ) : (
          <EmptyState title="Select a reservation" description="Choose a guest from the front desk list." />
        )}
      </Panel>
    </div>
  </div>
  );
};

const ReservationControl = ({ reservation, onSave, saving }) => {
  const [arrivalTime, setArrivalTime] = useState(reservation.arrivalTime || '');
  const [departureTime, setDepartureTime] = useState(reservation.departureTime || '');
  const [guestNotes, setGuestNotes] = useState(reservation.guestNotes || '');

  React.useEffect(() => {
    setArrivalTime(reservation.arrivalTime || '');
    setDepartureTime(reservation.departureTime || '');
    setGuestNotes(reservation.guestNotes || '');
  }, [reservation.id, reservation.arrivalTime, reservation.departureTime, reservation.guestNotes]);

  return (
    <div className="space-y-5 p-5">
      <div>
        <div className="text-lg font-bold text-slate-950">{reservation.guestName}</div>
        <div className="mt-1 text-xs text-slate-500">Reservation {reservation.id}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Info label="Room" value={reservation.roomNumber || 'Unassigned'} />
        <Info label="Status" value={<StatusBadge status={reservation.status} />} />
        <Info label="Check-in" value={formatDate(reservation.arrivalDate)} />
        <Info label="Check-out" value={formatDate(reservation.departureDate)} />
      </div>

      <div className="rounded-xl bg-slate-50 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Guest contact</div>
        <div className="mt-2 text-sm text-slate-800">{reservation.guestEmail || 'No email available'}</div>
        <div className="mt-1 text-sm text-slate-800">{reservation.guestPhone || 'No phone available'}</div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Arrival time</label>
        <div className="flex gap-2">
          <input
            type="time"
            value={arrivalTime}
            onChange={(event) => setArrivalTime(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <button
            disabled={saving}
            onClick={() => onSave(reservation.id, 'arrivalTime', arrivalTime)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Departure time</label>
        <div className="flex gap-2">
          <input
            type="time"
            value={departureTime}
            onChange={(event) => setDepartureTime(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <button
            disabled={saving}
            onClick={() => onSave(reservation.id, 'departureTime', departureTime)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Internal guest notes</label>
        <textarea
          rows="4"
          value={guestNotes}
          onChange={(event) => setGuestNotes(event.target.value)}
          placeholder="Add front desk notes..."
          className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          disabled={saving}
          onClick={() => onSave(reservation.id, 'guestNotes', guestNotes)}
          className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? 'Saving…* : 'Save notes"}
        </button>
      </div>

      {(reservation.specialRequests || []).length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Special requests</div>
          <div className="mt-2 space-y-2">
            {reservation.specialRequests.map((request, index) => (
              <div key={`${request}-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                {request}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const Info = ({ label, value }) => (
  <div>
    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
  </div>
);

export default ReceptionDash;

import React, { useMemo, useState } from 'react';

import {
  properties,
  reservations,
  shuttleRequests as initialShuttleRequests,
} from '../data/semDemoData';

import {
  getPropertyById,
} from '../utils/semOperationsMetrics';

const drivers = [
  'Nikos',
  'Dimitris',
  'Alexandros',
  'External Partner',
];

const vehicles = [
  'Mercedes V-Class',
  'BMW X5',
  'Mercedes Sprinter',
  'Tesla Model Y',
];

const ShuttlePage = () => {
  const [shuttleRequests, setShuttleRequests] = useState(initialShuttleRequests);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRequestId, setSelectedRequestId] = useState(
    initialShuttleRequests[0]?.id || null
  );

  const enrichedRequests = useMemo(() => {
    return shuttleRequests.map((request) => {
      const reservation = reservations.find(
        (item) => item.id === request.reservationId
      );

      const property = reservation
        ? getPropertyById(properties, reservation.propertyId)
        : null;

      return {
        ...request,
        reservation,
        property,
        riskLevel: calculateShuttleRisk(request, reservation),
      };
    });
  }, [shuttleRequests]);

  const filteredRequests = enrichedRequests.filter((request) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'critical') return request.riskLevel === 'critical';
    return request.status === statusFilter;
  });

  const selectedRequest =
    enrichedRequests.find((request) => request.id === selectedRequestId) ||
    enrichedRequests[0];

  const summary = {
    total: enrichedRequests.length,
    open: enrichedRequests.filter((request) => request.status !== 'completed').length,
    unassigned: enrichedRequests.filter((request) => request.status === 'unassigned').length,
    scheduled: enrichedRequests.filter((request) => request.status === 'scheduled').length,
    completed: enrichedRequests.filter((request) => request.status === 'completed').length,
    critical: enrichedRequests.filter((request) => request.riskLevel === 'critical').length,
  };

  const updateRequest = (requestId, updates) => {
    setShuttleRequests((currentRequests) =>
      currentRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              ...updates,
            }
          : request
      )
    );
  };

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-[#C9A46A]/20 bg-[#111110] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 opacity-[0.045] bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_0)] [background-size:24px_24px]" />
        <div className="absolute right-[-140px] top-[-140px] h-[420px] w-[420px] rounded-full bg-[#C9A46A]/15 blur-3xl" />

        <div className="relative grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-8 p-8 xl:p-10">
          <div>
            <div className="inline-flex rounded-full border border-[#C9A46A]/25 bg-[#C9A46A]/8 px-4 py-2">
              <span className="text-[10px] uppercase tracking-[0.32em] text-[#C9A46A] font-bold">
                Shuttle Operations · Phase C
              </span>
            </div>

            <h1 className="mt-8 max-w-4xl text-5xl xl:text-6xl font-semibold tracking-[-0.055em] leading-[0.95] text-white">
              Airport transfers,
              <span className="block text-[#C9A46A]">assigned before risk.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-[#BEB7AD]">
              Control shuttle requests, flight details, drivers, vehicles, guest notes
              and transfer status from one operational dispatch board.
            </p>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-3">
              <HeroMetric label="Total requests" value={summary.total} />
              <HeroMetric label="Open" value={summary.open} tone={summary.open ? 'warning' : 'good'} />
              <HeroMetric label="Unassigned" value={summary.unassigned} tone={summary.unassigned ? 'critical' : 'good'} />
              <HeroMetric label="Completed" value={summary.completed} tone="good" />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-[#090909]/70 p-6 backdrop-blur">
            <div className="flex items-start justify-between border-b border-white/[0.06] pb-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#8F8A82]">
                  Dispatch control
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {summary.critical} transfer risks
                </div>
              </div>

              <StatusPill status={summary.critical ? 'Critical' : 'Stable'} />
            </div>

            <div className="mt-6 space-y-4">
              <BriefRow label="Scheduled routes" value={summary.scheduled} />
              <BriefRow label="Missing driver" value={summary.unassigned} />
              <BriefRow label="Completed transfers" value={summary.completed} />
              <BriefRow label="Active vehicles" value={vehicles.length} />
            </div>

            <div className="mt-7 rounded-2xl border border-[#C9A46A]/15 bg-[#C9A46A]/8 p-5">
              <div className="text-[10px] uppercase tracking-[0.26em] text-[#C9A46A] font-bold">
                Dispatcher next action
              </div>
              <p className="mt-3 text-sm leading-6 text-[#E8E1D5]">
                Assign driver and vehicle to all unassigned airport pickups before
                Reception sends final shuttle information to the guest.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <OperationsCard
          label="Open shuttle requests"
          value={summary.open}
          description="Transfers that still require operational monitoring"
        />
        <OperationsCard
          label="Unassigned"
          value={summary.unassigned}
          description="Requests without confirmed driver or vehicle"
        />
        <OperationsCard
          label="Scheduled"
          value={summary.scheduled}
          description="Routes assigned and ready for driver execution"
        />
        <OperationsCard
          label="Completed"
          value={summary.completed}
          description="Transfers marked as completed by operations"
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_430px] gap-6">
        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <div className="space-y-5 px-6 py-5 border-b border-white/[0.05]">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
                  Dispatch board
                </div>
                <h2 className="mt-2 text-xl font-semibold text-white tracking-[-0.02em]">
                  Shuttle requests
                </h2>
              </div>

              <button className="rounded-full border border-[#C9A46A]/25 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-[#C9A46A] hover:bg-[#C9A46A]/10 transition-all">
                New shuttle request
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterButton active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
                All
              </FilterButton>
              <FilterButton active={statusFilter === 'critical'} onClick={() => setStatusFilter('critical')}>
                Critical
              </FilterButton>
              <FilterButton active={statusFilter === 'unassigned'} onClick={() => setStatusFilter('unassigned')}>
                Unassigned
              </FilterButton>
              <FilterButton active={statusFilter === 'scheduled'} onClick={() => setStatusFilter('scheduled')}>
                Scheduled
              </FilterButton>
              <FilterButton active={statusFilter === 'completed'} onClick={() => setStatusFilter('completed')}>
                Completed
              </FilterButton>
            </div>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {filteredRequests.map((request) => (
              <ShuttleRow
                key={request.id}
                request={request}
                active={selectedRequest?.id === request.id}
                onSelect={() => setSelectedRequestId(request.id)}
                onUpdate={updateRequest}
              />
            ))}

            {filteredRequests.length === 0 && (
              <div className="p-10 text-center">
                <div className="text-base font-semibold text-white">
                  No shuttle requests found.
                </div>
                <p className="mt-3 text-sm text-[#8F8A82]">
                  Change filter to view more transfer requests.
                </p>
              </div>
            )}
          </div>
        </div>

        {selectedRequest && (
          <ShuttleDetailPanel
            request={selectedRequest}
            onUpdate={updateRequest}
          />
        )}
      </section>

      <section className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
        <SectionHeader
          eyebrow="Drivers"
          title="Driver and vehicle workload"
          action="Manage"
        />

        <div className="grid grid-cols-1 xl:grid-cols-4 border-t border-white/[0.05]">
          {drivers.map((driver) => {
            const assigned = enrichedRequests.filter(
              (request) => request.driver === driver
            );

            return (
              <DriverCard
                key={driver}
                driver={driver}
                assigned={assigned}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
};

const ShuttleRow = ({ request, active, onSelect, onUpdate }) => {
  const nextStatus = getNextShuttleStatus(request.status);

  return (
    <button
      onClick={onSelect}
      className={[
        'w-full text-left px-6 py-5 transition-all',
        active ? 'bg-[#C9A46A]/8' : 'hover:bg-white/[0.025]',
      ].join(' ')}
    >
      <div className="grid grid-cols-1 2xl:grid-cols-[1fr_160px_170px_170px_160px] gap-5 items-start 2xl:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={request.riskLevel} />
            <StatusPill status={request.status} />
            <StatusPill status={request.flightInfo ? 'flight info' : 'flight missing'} />
          </div>

          <div className="mt-4 text-lg font-semibold text-white">
            {request.guestName}
          </div>

          <div className="mt-1 text-sm text-[#8F8A82]">
            {request.id} · {request.pickupLocation} to {request.dropoffLocation}
          </div>

          <p className="mt-3 text-sm leading-6 text-[#BEB7AD]">
            {request.notes || 'No shuttle notes.'}
          </p>
        </div>

        <SmallInfo label="Pickup" value={request.pickupTime} />
        <SmallInfo label="Driver" value={request.driver || 'Unassigned'} />
        <SmallInfo label="Vehicle" value={request.vehicle || 'Unassigned'} />

        <div onClick={(event) => event.stopPropagation()}>
          {request.status !== 'completed' ? (
            <button
              onClick={() => onUpdate(request.id, { status: nextStatus })}
              className="w-full rounded-2xl bg-[#C9A46A] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#090909] transition-all hover:bg-[#D7B984]"
            >
              Mark {formatStatus(nextStatus)}
            </button>
          ) : (
            <StatusPill status="Completed" />
          )}
        </div>
      </div>
    </button>
  );
};

const ShuttleDetailPanel = ({ request, onUpdate }) => {
  const [driver, setDriver] = useState(request.driver || '');
  const [vehicle, setVehicle] = useState(request.vehicle || '');
  const [pickupTime, setPickupTime] = useState(request.pickupTime || '');
  const [flightInfo, setFlightInfo] = useState(request.flightInfo || '');
  const [notes, setNotes] = useState(request.notes || '');

  const saveDispatchDetails = () => {
    onUpdate(request.id, {
      driver: driver || null,
      vehicle: vehicle || null,
      pickupTime,
      flightInfo: flightInfo || null,
      notes,
      status: driver && vehicle && request.status === 'unassigned'
        ? 'scheduled'
        : request.status,
    });
  };

  return (
    <aside className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
      <div className="px-6 py-5 border-b border-white/[0.05]">
        <div className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
          Shuttle detail
        </div>

        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
          {request.guestName}
        </h2>

        <div className="mt-3 flex flex-wrap gap-2">
          <StatusPill status={request.status} />
          <StatusPill status={request.riskLevel} />
          <StatusPill status={request.flightInfo ? 'flight info' : 'flight missing'} />
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <DetailBox label="Request ID" value={request.id} />
          <DetailBox label="Booking" value={request.reservationId || 'Manual'} />
          <DetailBox label="Passengers" value={request.passengers} />
          <DetailBox label="Luggage" value={request.luggage} />
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[#C9A46A] font-bold">
            Dispatch assignment
          </div>

          <div className="mt-5 space-y-4">
            <Field label="Pickup time" value={pickupTime} onChange={setPickupTime} />
            <Field label="Flight info" value={flightInfo} onChange={setFlightInfo} />

            <div>
              <label className="block text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
                Driver
              </label>
              <select
                value={driver}
                onChange={(event) => setDriver(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#111110] px-4 py-3 text-sm text-white outline-none focus:border-[#C9A46A]/40"
              >
                <option value="">Unassigned</option>
                {drivers.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
                Vehicle
              </label>
              <select
                value={vehicle}
                onChange={(event) => setVehicle(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#111110] px-4 py-3 text-sm text-white outline-none focus:border-[#C9A46A]/40"
              >
                <option value="">Unassigned</option>
                {vehicles.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
                Shuttle notes
              </label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                className="w-full resize-none rounded-2xl border border-white/10 bg-[#111110] px-4 py-3 text-sm text-white outline-none placeholder:text-[#6F6B66] focus:border-[#C9A46A]/40"
              />
            </div>

            <button
              onClick={saveDispatchDetails}
              className="w-full rounded-2xl bg-[#C9A46A] px-5 py-4 text-sm font-bold uppercase tracking-[0.2em] text-[#090909] transition-all hover:bg-[#D7B984]"
            >
              Save dispatch details
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[#C9A46A] font-bold">
            Route
          </div>

          <div className="mt-5 space-y-4">
            <RouteLine label="Pickup" value={request.pickupLocation} />
            <RouteLine label="Drop-off" value={request.dropoffLocation} />
            <RouteLine label="Property" value={request.property?.name || 'No linked property'} />
          </div>
        </div>
      </div>
    </aside>
  );
};

const DriverCard = ({ driver, assigned }) => (
  <div className="border-b border-white/[0.05] p-6 xl:border-b-0 xl:border-r last:border-r-0">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-lg font-semibold text-white">
          {driver}
        </div>
        <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[#8F8A82]">
          {assigned.length} assigned routes
        </div>
      </div>

      <StatusPill status={assigned.length > 2 ? 'High load' : 'Available'} />
    </div>

    <div className="mt-5 space-y-3">
      {assigned.length > 0 ? (
        assigned.map((request) => (
          <div
            key={request.id}
            className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-4"
          >
            <div className="text-sm font-semibold text-white">
              {request.pickupTime} · {request.guestName}
            </div>
            <div className="mt-1 text-xs text-[#8F8A82]">
              {request.vehicle || 'Vehicle not assigned'}
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-4 text-sm text-[#8F8A82]">
          No routes assigned.
        </div>
      )}
    </div>
  </div>
);

const RouteLine = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4">
    <span className="text-sm text-[#9E978E]">{label}</span>
    <span className="max-w-[220px] text-right text-sm font-semibold text-white">
      {value}
    </span>
  </div>
);

const Field = ({ label, value, onChange }) => (
  <div>
    <label className="block text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
      {label}
    </label>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-2xl border border-white/10 bg-[#111110] px-4 py-3 text-sm text-white outline-none placeholder:text-[#6F6B66] focus:border-[#C9A46A]/40"
    />
  </div>
);

const HeroMetric = ({ label, value, tone }) => (
  <div className="rounded-2xl border border-white/[0.07] bg-[#090909]/60 px-5 py-4">
    <div className="text-[10px] uppercase tracking-[0.24em] text-[#8F8A82]">
      {label}
    </div>
    <div
      className={[
        'mt-2 text-sm font-semibold',
        tone === 'critical' ? 'text-[#F0D6A5]' : tone === 'warning' ? 'text-[#D9B381]' : tone === 'good' ? 'text-[#C9A46A]' : 'text-white',
      ].join(' ')}
    >
      {value}
    </div>
  </div>
);

const BriefRow = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-[#9E978E]">{label}</span>
    <span className="text-xl font-semibold text-white">{value}</span>
  </div>
);

const OperationsCard = ({ label, value, description }) => (
  <div className="rounded-[1.5rem] border border-white/[0.07] bg-[#161615] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#C9A46A]/30">
    <div className="text-[10px] uppercase tracking-[0.26em] text-[#8F8A82] font-bold">
      {label}
    </div>
    <div className="mt-8 text-5xl font-semibold tracking-[-0.06em] text-white">
      {value}
    </div>
    <p className="mt-5 text-sm leading-6 text-[#9E978E]">
      {description}
    </p>
  </div>
);

const SectionHeader = ({ eyebrow, title, action }) => (
  <div className="flex items-center justify-between px-6 py-5">
    <div>
      <div className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-xl font-semibold text-white tracking-[-0.02em]">
        {title}
      </h2>
    </div>

    <button className="rounded-full border border-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-[#BEB7AD] hover:border-[#C9A46A]/35 hover:text-white transition-all">
      {action}
    </button>
  </div>
);

const FilterButton = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={[
      'rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.22em] transition-all',
      active
        ? 'border-[#C9A46A]/40 bg-[#C9A46A]/10 text-[#C9A46A]'
        : 'border-white/10 text-[#BEB7AD] hover:border-[#C9A46A]/30 hover:text-white',
    ].join(' ')}
  >
    {children}
  </button>
);

const SmallInfo = ({ label, value }) => (
  <div>
    <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
      {label}
    </div>
    <div className="text-sm font-semibold text-white">
      {value || '—'}
    </div>
  </div>
);

const DetailBox = ({ label, value }) => (
  <div className="rounded-2xl border border-white/[0.06] bg-[#111110] p-4">
    <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82]">
      {label}
    </div>
    <div className="mt-2 text-sm font-semibold text-white">
      {value || '—'}
    </div>
  </div>
);

const StatusPill = ({ status }) => {
  const normalized = String(status).toLowerCase();

  const isCritical =
    normalized.includes('critical') ||
    normalized.includes('unassigned') ||
    normalized.includes('missing') ||
    normalized.includes('high');

  const isWarning =
    normalized.includes('scheduled') ||
    normalized.includes('on the way') ||
    normalized.includes('requested') ||
    normalized.includes('medium');

  const isGood =
    normalized.includes('completed') ||
    normalized.includes('stable') ||
    normalized.includes('available') ||
    normalized.includes('flight info');

  const classes = isCritical
    ? 'border-[#F0D6A5]/40 bg-[#F0D6A5]/12 text-[#F0D6A5]'
    : isWarning
      ? 'border-[#D9B381]/35 bg-[#D9B381]/10 text-[#D9B381]'
      : isGood
        ? 'border-[#C9A46A]/35 bg-[#C9A46A]/10 text-[#C9A46A]'
        : 'border-white/10 bg-white/[0.04] text-[#BEB7AD]';

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${classes}`}>
      {formatStatus(status)}
    </span>
  );
};

const calculateShuttleRisk = (request, reservation) => {
  if (request.status === 'unassigned') return 'critical';
  if (!request.driver || !request.vehicle) return 'critical';
  if (!request.flightInfo) return 'medium';
  if (reservation?.missingFields?.includes('arrivalTime')) return 'medium';
  if (request.status === 'completed') return 'stable';

  return 'controlled';
};

const getNextShuttleStatus = (status) => {
  if (status === 'unassigned') return 'scheduled';
  if (status === 'scheduled') return 'on_the_way';
  if (status === 'on_the_way') return 'completed';
  return 'completed';
};

const formatStatus = (status) => {
  return String(status)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export default ShuttlePage;
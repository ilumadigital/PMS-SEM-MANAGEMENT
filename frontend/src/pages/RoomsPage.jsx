import React, { useMemo, useState } from 'react';

import {
  cleaningTasks,
  properties,
  reservations,
  rooms as initialRooms,
  shuttleRequests,
} from '../data/semDemoData';

import {
  getPropertyById,
} from '../utils/semOperationsMetrics';

const RoomsPage = () => {
  const [rooms, setRooms] = useState(initialRooms);
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRoomId, setSelectedRoomId] = useState(initialRooms[0]?.id || null);

  const enrichedRooms = useMemo(() => {
    return rooms.map((room) => {
      const property = getPropertyById(properties, room.propertyId);
      const nextReservation = reservations.find(
        (reservation) => reservation.id === room.nextArrivalBookingId
      );
      const currentReservation = reservations.find(
        (reservation) =>
          reservation.roomId === room.id &&
          ['in_house', 'confirmed', 'pending_confirmation'].includes(reservation.status)
      );
      const cleaningTask = cleaningTasks.find((task) => task.roomId === room.id);
      const shuttleRequest = nextReservation
        ? shuttleRequests.find((request) => request.id === nextReservation.shuttleRequestId)
        : null;

      return {
        ...room,
        property,
        nextReservation,
        currentReservation,
        cleaningTask,
        shuttleRequest,
        readinessRisk: calculateRoomRisk(room, nextReservation, cleaningTask, shuttleRequest),
      };
    });
  }, [rooms]);

  const filteredRooms = enrichedRooms.filter((room) => {
    const matchesProperty =
      propertyFilter === 'all' || room.propertyId === propertyFilter;

    const matchesStatus =
      statusFilter === 'all' ||
      room.housekeepingStatus === statusFilter ||
      room.occupancyStatus === statusFilter ||
      room.readinessRisk === statusFilter;

    return matchesProperty && matchesStatus;
  });

  const selectedRoom =
    enrichedRooms.find((room) => room.id === selectedRoomId) || enrichedRooms[0];

  const summary = {
    total: enrichedRooms.length,
    ready: enrichedRooms.filter((room) => room.housekeepingStatus === 'ready').length,
    dirty: enrichedRooms.filter((room) => room.housekeepingStatus === 'dirty').length,
    inProgress: enrichedRooms.filter((room) => room.housekeepingStatus === 'in_progress').length,
    inspection: enrichedRooms.filter((room) => room.housekeepingStatus === 'pending_inspection').length,
    blocked: enrichedRooms.filter((room) => room.readinessRisk === 'blocked').length,
    attention: enrichedRooms.filter((room) => room.readinessRisk === 'attention').length,
  };

  const updateRoomStatus = (roomId, housekeepingStatus) => {
    setRooms((currentRooms) =>
      currentRooms.map((room) =>
        room.id === roomId
          ? {
              ...room,
              housekeepingStatus,
              lastUpdatedAt: 'Now',
            }
          : room
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
                Rooms · Readiness Control
              </span>
            </div>

            <h1 className="mt-8 max-w-4xl text-5xl xl:text-6xl font-semibold tracking-[-0.055em] leading-[0.95] text-white">
              Room readiness,
              <span className="block text-[#C9A46A]">connected to Reception.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-[#BEB7AD]">
              Track every room status, cleaning dependency, upcoming arrival,
              missing guest information and check-in blocker from one operational matrix.
            </p>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-3">
              <HeroMetric label="Tracked rooms" value={summary.total} />
              <HeroMetric label="Ready" value={summary.ready} tone="good" />
              <HeroMetric label="Blocked" value={summary.blocked} tone="critical" />
              <HeroMetric label="Attention" value={summary.attention} tone="warning" />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-[#090909]/70 p-6 backdrop-blur">
            <div className="flex items-start justify-between border-b border-white/[0.06] pb-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#8F8A82]">
                  Room operations
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {summary.blocked + summary.attention} rooms need control
                </div>
              </div>

              <StatusPill status={summary.blocked ? 'Blocked' : summary.attention ? 'Attention' : 'Stable'} />
            </div>

            <div className="mt-6 space-y-4">
              <BriefRow label="Dirty rooms" value={summary.dirty} />
              <BriefRow label="Cleaning in progress" value={summary.inProgress} />
              <BriefRow label="Pending inspection" value={summary.inspection} />
              <BriefRow label="Ready for Reception" value={summary.ready} />
            </div>

            <div className="mt-7 rounded-2xl border border-[#C9A46A]/15 bg-[#C9A46A]/8 p-5">
              <div className="text-[10px] uppercase tracking-[0.26em] text-[#C9A46A] font-bold">
                Next room action
              </div>
              <p className="mt-3 text-sm leading-6 text-[#E8E1D5]">
                Prioritize rooms with upcoming arrivals and pending inspection before
                Reception confirms final check-in readiness.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <OperationsCard
          label="Ready rooms"
          value={summary.ready}
          description="Rooms that Reception can safely use for arrivals"
        />
        <OperationsCard
          label="Dirty rooms"
          value={summary.dirty}
          description="Rooms requiring cleaning after departure"
        />
        <OperationsCard
          label="In progress"
          value={summary.inProgress}
          description="Cleaning tasks currently active"
        />
        <OperationsCard
          label="Inspection pending"
          value={summary.inspection}
          description="Rooms requiring supervisor approval"
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_430px] gap-6">
        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <div className="space-y-5 px-6 py-5 border-b border-white/[0.05]">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
                  Matrix
                </div>
                <h2 className="mt-2 text-xl font-semibold text-white tracking-[-0.02em]">
                  Room readiness board
                </h2>
              </div>

              <button className="rounded-full border border-[#C9A46A]/25 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-[#C9A46A] hover:bg-[#C9A46A]/10 transition-all">
                Add room note
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <select
                value={propertyFilter}
                onChange={(event) => setPropertyFilter(event.target.value)}
                className="rounded-2xl border border-white/10 bg-[#090909] px-5 py-3 text-sm text-white outline-none focus:border-[#C9A46A]/40"
              >
                <option value="all">All properties</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-2xl border border-white/10 bg-[#090909] px-5 py-3 text-sm text-white outline-none focus:border-[#C9A46A]/40"
              >
                <option value="all">All statuses</option>
                <option value="ready">Ready</option>
                <option value="dirty">Dirty</option>
                <option value="in_progress">In Progress</option>
                <option value="pending_inspection">Pending Inspection</option>
                <option value="blocked">Blocked</option>
                <option value="attention">Attention</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {filteredRooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                active={selectedRoom?.id === room.id}
                onSelect={() => setSelectedRoomId(room.id)}
                onUpdateStatus={updateRoomStatus}
              />
            ))}

            {filteredRooms.length === 0 && (
              <div className="p-10 text-center">
                <div className="text-base font-semibold text-white">
                  No rooms found.
                </div>
                <p className="mt-3 text-sm text-[#8F8A82]">
                  Change filters to view more rooms.
                </p>
              </div>
            )}
          </div>
        </div>

        {selectedRoom && (
          <RoomDetailPanel
            room={selectedRoom}
            onUpdateStatus={updateRoomStatus}
          />
        )}
      </section>

      <section className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
        <SectionHeader
          eyebrow="Properties"
          title="Readiness by property"
          action="Export"
        />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-0 border-t border-white/[0.05]">
          {properties.map((property) => {
            const propertyRooms = enrichedRooms.filter(
              (room) => room.propertyId === property.id
            );

            return (
              <PropertyRoomCard
                key={property.id}
                property={property}
                rooms={propertyRooms}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
};

const RoomRow = ({ room, active, onSelect, onUpdateStatus }) => (
  <button
    onClick={onSelect}
    className={[
      'w-full text-left px-6 py-5 transition-all',
      active ? 'bg-[#C9A46A]/8' : 'hover:bg-white/[0.025]',
    ].join(' ')}
  >
    <div className="grid grid-cols-1 2xl:grid-cols-[1fr_160px_180px_190px_170px] gap-5 items-start 2xl:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={room.readinessRisk} />
          <StatusPill status={room.housekeepingStatus} />
          <StatusPill status={room.occupancyStatus} />
        </div>

        <div className="mt-4 text-lg font-semibold text-white">
          Room {room.roomNumber}
        </div>

        <div className="mt-1 text-sm text-[#8F8A82]">
          {room.property?.name} · Updated {room.lastUpdatedAt}
        </div>

        {room.nextReservation && (
          <p className="mt-3 text-sm leading-6 text-[#BEB7AD]">
            Next arrival: {room.nextReservation.guestName} at{' '}
            {room.nextReservation.arrivalTime || 'missing arrival time'}.
          </p>
        )}
      </div>

      <SmallInfo label="Cleaning task" value={room.cleaningTask ? formatTaskType(room.cleaningTask.type) : 'No task'} />
      <SmallInfo label="Due" value={room.cleaningTask?.dueTime || '—'} />

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
          Shuttle
        </div>
        <StatusPill status={room.shuttleRequest?.status || 'none'} />
      </div>

      <div onClick={(event) => event.stopPropagation()}>
        <select
          value={room.housekeepingStatus}
          onChange={(event) => onUpdateStatus(room.id, event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-[#090909] px-4 py-3 text-sm text-white outline-none focus:border-[#C9A46A]/40"
        >
          <option value="ready">Ready</option>
          <option value="dirty">Dirty</option>
          <option value="in_progress">In Progress</option>
          <option value="pending_inspection">Pending Inspection</option>
        </select>
      </div>
    </div>
  </button>
);

const RoomDetailPanel = ({ room, onUpdateStatus }) => (
  <aside className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
    <div className="px-6 py-5 border-b border-white/[0.05]">
      <div className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
        Room detail
      </div>

      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">
        Room {room.roomNumber}
      </h2>

      <div className="mt-3 flex flex-wrap gap-2">
        <StatusPill status={room.housekeepingStatus} />
        <StatusPill status={room.occupancyStatus} />
        <StatusPill status={room.readinessRisk} />
      </div>
    </div>

    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <DetailBox label="Property" value={room.property?.name} />
        <DetailBox label="Room ID" value={room.id} />
        <DetailBox label="Updated" value={room.lastUpdatedAt} />
        <DetailBox label="Current guest" value={room.currentGuest || 'None'} />
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
        <div className="text-[10px] uppercase tracking-[0.24em] text-[#C9A46A] font-bold">
          Housekeeping control
        </div>

        <div className="mt-5">
          <label className="block text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
            Room status
          </label>
          <select
            value={room.housekeepingStatus}
            onChange={(event) => onUpdateStatus(room.id, event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-[#111110] px-4 py-3 text-sm text-white outline-none focus:border-[#C9A46A]/40"
          >
            <option value="ready">Ready</option>
            <option value="dirty">Dirty</option>
            <option value="in_progress">In Progress</option>
            <option value="pending_inspection">Pending Inspection</option>
          </select>
        </div>

        <div className="mt-5 rounded-2xl border border-[#C9A46A]/15 bg-[#C9A46A]/8 p-4">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[#C9A46A] font-bold">
            Reception visibility
          </div>
          <p className="mt-3 text-sm leading-6 text-[#E8E1D5]">
            When this room becomes Ready, Reception can treat it as available
            for check-in or guest movement.
          </p>
        </div>
      </div>

      {room.nextReservation && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[#C9A46A] font-bold">
            Next arrival dependency
          </div>

          <div className="mt-4 text-base font-semibold text-white">
            {room.nextReservation.guestName}
          </div>

          <div className="mt-2 text-sm text-[#9E978E]">
            {room.nextReservation.id} · Arrival {room.nextReservation.arrivalDate} ·{' '}
            {room.nextReservation.arrivalTime || 'arrival time missing'}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {room.nextReservation.missingFields.length > 0 ? (
              room.nextReservation.missingFields.map((field) => (
                <StatusPill key={field} status={field} />
              ))
            ) : (
              <StatusPill status="guest data complete" />
            )}
          </div>
        </div>
      )}

      {room.cleaningTask && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[#C9A46A] font-bold">
            Linked cleaning task
          </div>

          <div className="mt-4 text-base font-semibold text-white">
            {formatTaskType(room.cleaningTask.type)}
          </div>

          <div className="mt-2 text-sm text-[#9E978E]">
            Assigned to {room.cleaningTask.assignedTo || 'Not assigned'} · Due {room.cleaningTask.dueTime}
          </div>

          <p className="mt-4 text-sm leading-6 text-[#BEB7AD]">
            {room.cleaningTask.notes}
          </p>
        </div>
      )}
    </div>
  </aside>
);

const PropertyRoomCard = ({ property, rooms }) => {
  const ready = rooms.filter((room) => room.housekeepingStatus === 'ready').length;
  const blocked = rooms.filter((room) => room.readinessRisk === 'blocked').length;
  const attention = rooms.filter((room) => room.readinessRisk === 'attention').length;
  const readinessRate = rooms.length ? Math.round((ready / rooms.length) * 100) : 0;

  return (
    <div className="border-b border-white/[0.05] p-6 xl:border-b-0 xl:border-r last:border-r-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
            {property.code}
          </div>
          <h3 className="mt-2 text-xl font-semibold text-white">
            {property.name}
          </h3>
          <div className="mt-1 text-sm text-[#8F8A82]">
            {property.location}
          </div>
        </div>

        <StatusPill status={blocked ? 'Blocked' : attention ? 'Attention' : 'Stable'} />
      </div>

      <div className="mt-6 h-2 rounded-full bg-white/[0.05] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#C9A46A]"
          style={{ width: `${readinessRate}%` }}
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2">
        <MiniStat label="Ready" value={ready} />
        <MiniStat label="Blocked" value={blocked} />
        <MiniStat label="Attention" value={attention} />
      </div>
    </div>
  );
};

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

const MiniStat = ({ label, value }) => (
  <div className="rounded-2xl border border-white/[0.06] bg-[#111110] p-3">
    <div className="text-[9px] uppercase tracking-[0.18em] text-[#8F8A82]">
      {label}
    </div>
    <div className="mt-2 text-sm font-semibold text-white">
      {value}
    </div>
  </div>
);

const StatusPill = ({ status }) => {
  const normalized = String(status).toLowerCase();

  const isCritical =
    normalized.includes('blocked') ||
    normalized.includes('dirty') ||
    normalized.includes('missing') ||
    normalized.includes('unassigned');

  const isWarning =
    normalized.includes('attention') ||
    normalized.includes('pending') ||
    normalized.includes('in_progress') ||
    normalized.includes('checkout') ||
    normalized.includes('arriving');

  const isGood =
    normalized.includes('stable') ||
    normalized.includes('ready') ||
    normalized.includes('complete') ||
    normalized.includes('completed');

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

const calculateRoomRisk = (room, nextReservation, cleaningTask, shuttleRequest) => {
  const hasArrivalToday = nextReservation?.arrivalDate === '2026-07-08';
  const hasArrivalTomorrow = nextReservation?.arrivalDate === '2026-07-09';
  const roomNotReady = room.housekeepingStatus !== 'ready';
  const cleaningNotCompleted = cleaningTask && cleaningTask.status !== 'completed';
  const missingArrivalInfo = nextReservation?.missingFields?.includes('arrivalTime');
  const shuttleUnassigned = shuttleRequest?.status === 'unassigned';

  if (hasArrivalToday && roomNotReady) return 'blocked';
  if (hasArrivalToday && cleaningNotCompleted) return 'blocked';
  if (hasArrivalToday && shuttleUnassigned) return 'attention';
  if (hasArrivalTomorrow && missingArrivalInfo) return 'attention';
  if (room.housekeepingStatus === 'pending_inspection') return 'attention';
  if (room.housekeepingStatus === 'dirty') return 'blocked';

  return 'stable';
};

const formatStatus = (status) => {
  return String(status)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const formatTaskType = (type) => {
  return String(type)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export default RoomsPage;
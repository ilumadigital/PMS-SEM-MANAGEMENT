import React, { useContext, useMemo, useState } from 'react';
import {
  getPropertyById,
  getRoomById,
  getTodayArrivals,
  getTodayDepartures,
  getTomorrowArrivals,
  getTomorrowDepartures,
  getMissingInfoReservations,
  getCleaningSummary,
  getRoomStatusSummary,
  getShuttleSummary,
} from '../utils/semOperationsMetrics';

const ReceptionDash = () => {
  const { reservations, properties, rooms, status, loading, error, refresh, connect } = useContext(CloudbedsDataContext);
  const cleaningTasks = [];
  const shuttleRequests = [];
  const [selectedFilter, setSelectedFilter] = useState('today');

  const receptionData = useMemo(() => {
    const todayArrivals = getTodayArrivals(reservations);
    const todayDepartures = getTodayDepartures(reservations);
    const tomorrowArrivals = getTomorrowArrivals(reservations);
    const tomorrowDepartures = getTomorrowDepartures(reservations);
    const missingInfo = getMissingInfoReservations(reservations);
    const cleaning = getCleaningSummary(cleaningTasks);
    const roomStatus = getRoomStatusSummary(rooms);
    const shuttle = getShuttleSummary(shuttleRequests);

    const flowItems = [
      ...todayArrivals.map((reservation) => ({
        ...reservation,
        flowType: 'arrival',
        flowDate: reservation.arrivalDate,
        flowTime: reservation.arrivalTime,
      })),
      ...todayDepartures.map((reservation) => ({
        ...reservation,
        flowType: 'departure',
        flowDate: reservation.arrivalDate,
        flowTime: reservation.departureTime,
      })),
    ].sort((a, b) => String(a.flowTime || '99:99').localeCompare(String(b.flowTime || '99:99')));

    const enrichedFlow = flowItems.map((reservation) => {
      const property = getPropertyById(properties, reservation.propertyId);
      const room = getRoomById(rooms, reservation.roomId);
      const cleaningTask = cleaningTasks.find((task) => task.reservationId === reservation.id);
      const shuttleRequest = shuttleRequests.find((request) => request.id === reservation.shuttleRequestId);

      return {
        reservation,
        property,
        room,
        cleaningTask,
        shuttleRequest,
      };
    });

    return {
      todayArrivals,
      todayDepartures,
      tomorrowArrivals,
      tomorrowDepartures,
      missingInfo,
      cleaning,
      roomStatus,
      shuttle,
      enrichedFlow,
    };
  }, [reservations, properties, rooms]);

  const priorityQueue = [
    ...receptionData.missingInfo.map((reservation) => ({
      id: `missing-${reservation.id}`,
      type: 'Missing info',
      severity: 'high',
      title: reservation.guestName,
      description: `Missing: ${reservation.missingFields.join(', ')}`,
      reservationId: reservation.id,
      action: 'Complete details',
    })),
    ...cleaningTasks
      .filter((task) => task.status !== 'completed' && task.priority === 'high')
      .map((task) => ({
        id: `cleaning-${task.id}`,
        type: 'Cleaning alert',
        severity: 'critical',
        title: `Room ${task.roomNumber}`,
        description: `${formatTaskType(task.type)} must be completed before ${task.dueTime}`,
        reservationId: task.reservationId,
        action: 'Check room status',
      })),
    ...shuttleRequests
      .filter((request) => request.status === 'unassigned')
      .map((request) => ({
        id: `shuttle-${request.id}`,
        type: 'Shuttle alert',
        severity: 'critical',
        title: request.guestName,
        description: `Pickup at ${request.pickupTime} has no driver or vehicle assigned`,
        reservationId: request.reservationId,
        action: 'Assign shuttle',
      })),
  ];

  const visibleFlow =
    selectedFilter === 'arrivals'
      ? receptionData.enrichedFlow.filter((item) => item.reservation.flowType === 'arrival')
      : selectedFilter === 'departures'
        ? receptionData.enrichedFlow.filter((item) => item.reservation.flowType === 'departure')
        : receptionData.enrichedFlow;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-[#C9A46A]/20 bg-[#111110] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 opacity-[0.045] bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_0)] [background-size:24px_24px]" />
        <div className="absolute right-[-140px] top-[-140px] h-[420px] w-[420px] rounded-full bg-[#C9A46A]/15 blur-3xl" />

        <div className="relative grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-8 p-8 xl:p-10">
          <div>
            <div className="inline-flex rounded-full border border-[#C9A46A]/25 bg-[#C9A46A]/8 px-4 py-2">
              <span className="text-[10px] uppercase tracking-[0.32em] text-[#C9A46A] font-bold">
                Reception Operations · Phase A
              </span>
            </div>

            <h1 className="mt-8 max-w-4xl text-5xl xl:text-6xl font-semibold tracking-[-0.055em] leading-[0.95] text-white">
              Daily guest flow,
              <span className="block text-[#C9A46A]">controlled before arrival.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-[#BEB7AD]">
              Live reception view from the connected Cloudbeds sandbox: arrivals, departures and missing guest information,
              cleaning readiness, shuttle requests and reception notes from one place.
            </p>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-3">
              <HeroMetric label="Arrivals today" value={receptionData.todayArrivals.length} />
              <HeroMetric label="Departures today" value={receptionData.todayDepartures.length} />
              <HeroMetric label="Missing info" value={receptionData.missingInfo.length} tone="warning" />
              <HeroMetric label="Cloudbeds rooms" value={rooms.length} />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-[#090909]/70 p-6 backdrop-blur">
            <div className="flex items-start justify-between border-b border-white/[0.06] pb-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#8F8A82]">
                  Reception queue
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {priorityQueue.length} operational items
                </div>
              </div>

              <StatusPill status={priorityQueue.length > 3 ? 'High focus' : 'Stable'} />
            </div>

            <div className="mt-6 space-y-4">
              <BriefRow label="Tomorrow arrivals" value={receptionData.tomorrowArrivals.length} />
              <BriefRow label="Tomorrow departures" value={receptionData.tomorrowDepartures.length} />
              <BriefRow label="Cleaning pending" value={receptionData.cleaning.pending} />
              <BriefRow label="Shuttle unassigned" value={receptionData.shuttle.unassigned} />
            </div>

            <div className="mt-7 rounded-2xl border border-[#C9A46A]/15 bg-[#C9A46A]/8 p-5">
              <div className="text-[10px] uppercase tracking-[0.26em] text-[#C9A46A] font-bold">
                Reception next action
              </div>
              <p className="mt-3 text-sm leading-6 text-[#E8E1D5]">
                Complete missing departure/arrival times and confirm shuttle assignment
                before sending final guest instructions.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <OperationsCard
          label="Check-in control"
          value={`${receptionData.todayArrivals.length}`}
          description={`${receptionData.todayArrivals.filter((item) => item.checkinStatus === 'pending').length} pending check-ins today`}
        />
        <OperationsCard
          label="Check-out control"
          value={`${receptionData.todayDepartures.length}`}
          description={`${receptionData.todayDepartures.filter((item) => item.checkoutStatus === 'pending').length} pending check-outs today`}
        />
        <OperationsCard
          label="Guest data gaps"
          value={receptionData.missingInfo.length}
          description="Arrival/departure times or shuttle details missing"
        />
        <OperationsCard
          label="Live cleaning alerts"
          value={receptionData.cleaning.pending + receptionData.cleaning.inProgress}
          description={`${receptionData.cleaning.completed} completed tasks visible to Reception`}
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-6">
        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <div className="flex flex-col gap-5 px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
                Today
              </div>
              <h2 className="mt-2 text-xl font-semibold text-white tracking-[-0.02em]">
                Arrival / departure control
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterButton active={selectedFilter === 'today'} onClick={() => setSelectedFilter('today')}>
                All
              </FilterButton>
              <FilterButton active={selectedFilter === 'arrivals'} onClick={() => setSelectedFilter('arrivals')}>
                Arrivals
              </FilterButton>
              <FilterButton active={selectedFilter === 'departures'} onClick={() => setSelectedFilter('departures')}>
                Departures
              </FilterButton>
            </div>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {visibleFlow.map((item) => (
              <FlowRow key={`${item.reservation.id}-${item.reservation.flowType}`} item={item} />
            ))}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <SectionHeader
            eyebrow="Priority"
            title="Reception attention list"
            action="Resolve"
          />

          <div className="p-5 space-y-4">
            {priorityQueue.slice(0, 5).map((item) => (
              <PriorityCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
        <SectionHeader
          eyebrow="Room readiness"
          title="Cleaning status visible to Reception"
          action="Open rooms"
        />

        <div className="grid grid-cols-1 lg:grid-cols-5 border-y border-white/[0.05] bg-[#0B0B0B]/60">
          <RoomStatusTile label="Ready" value={receptionData.roomStatus.ready} />
          <RoomStatusTile label="Dirty" value={receptionData.roomStatus.dirty} />
          <RoomStatusTile label="In progress" value={receptionData.roomStatus.inProgress} />
          <RoomStatusTile label="Inspection" value={receptionData.roomStatus.pendingInspection} />
          <RoomStatusTile label="Total tracked" value={receptionData.roomStatus.total} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.05]">
                <TableHead>Room</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reception note</TableHead>
              </tr>
            </thead>
            <tbody>
              {cleaningTasks.map((task) => {
                const property = getPropertyById(properties, task.propertyId);

                return (
                  <tr
                    key={task.id}
                    className="border-b border-white/[0.05] hover:bg-white/[0.025] transition-colors"
                  >
                    <TableCell strong>{task.roomNumber}</TableCell>
                    <TableCell>{property?.name}</TableCell>
                    <TableCell>{formatTaskType(task.type)}</TableCell>
                    <TableCell>{task.assignedTo || 'Not assigned'}</TableCell>
                    <TableCell>{task.dueTime}</TableCell>
                    <TableCell>
                      <StatusPill status={task.status} />
                    </TableCell>
                    <TableCell>{task.notes}</TableCell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
        <SectionHeader
          eyebrow="Guest details"
          title="Missing information panel"
          action="Request info"
        />

        <div className="divide-y divide-white/[0.05]">
          {receptionData.missingInfo.map((reservation) => {
            const property = getPropertyById(properties, reservation.propertyId);

            return (
              <MissingInfoRow
                key={reservation.id}
                reservation={reservation}
                property={property}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
};

const FlowRow = ({ item }) => {
  const { reservation, property, room, cleaningTask, shuttleRequest } = item;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[90px_1fr_190px_190px_170px] gap-5 px-6 py-5 items-start xl:items-center">
      <div>
        <div className="text-2xl font-semibold tracking-[-0.04em] text-white">
          {reservation.flowTime || '—'}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[#8F8A82]">
          {reservation.flowType}
        </div>
      </div>

      <div>
        <div className="text-base font-semibold text-white">
          {reservation.guestName}
        </div>
        <div className="mt-1 text-sm text-[#8F8A82]">
          {reservation.id} · {property?.name} · Room {reservation.roomNumber}
        </div>
        <div className="mt-3 text-sm leading-6 text-[#BEB7AD]">
          {reservation.guestNotes || 'No reception notes yet.'}
        </div>

        {reservation.specialRequests.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {reservation.specialRequests.map((request) => (
              <span
                key={request}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#BEB7AD]"
              >
                {request}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
          Cleaning
        </div>
        <StatusPill status={cleaningTask?.status || room?.housekeepingStatus || 'not assigned'} />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
          Shuttle
        </div>
        <StatusPill status={shuttleRequest?.status || (reservation.shuttleRequested ? 'requested' : 'none')} />
      </div>

      <button className="rounded-full border border-[#C9A46A]/20 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-[#C9A46A] hover:bg-[#C9A46A]/10 transition-all">
        Open record
      </button>
    </div>
  );
};

const MissingInfoRow = ({ reservation, property }) => (
  <div className="grid grid-cols-1 xl:grid-cols-[1fr_220px_260px_auto] gap-5 px-6 py-5 items-start xl:items-center">
    <div>
      <div className="text-base font-semibold text-white">{reservation.guestName}</div>
      <div className="mt-1 text-sm text-[#8F8A82]">
        {reservation.id} · {property?.name} · Room {reservation.roomNumber}
      </div>
    </div>

    <div>
      <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
        Source
      </div>
      <StatusPill status={reservation.source} />
    </div>

    <div>
      <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
        Missing fields
      </div>
      <div className="flex flex-wrap gap-2">
        {reservation.missingFields.map((field) => (
          <StatusPill key={field} status={field} />
        ))}
      </div>
    </div>

    <button className="rounded-full border border-[#C9A46A]/20 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-[#C9A46A] hover:bg-[#C9A46A]/10 transition-all">
      Complete
    </button>
  </div>
);

const PriorityCard = ({ item }) => (
  <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#C9A46A] font-bold">
          {item.type}
        </div>
        <div className="mt-3 text-base font-semibold text-white">
          {item.title}
        </div>
        <p className="mt-3 text-sm leading-6 text-[#9E978E]">
          {item.description}
        </p>
      </div>

      <StatusPill status={item.severity} />
    </div>

    <button className="mt-5 w-full rounded-full border border-[#C9A46A]/20 px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-[#C9A46A] hover:bg-[#C9A46A]/10 transition-all">
      {item.action}
    </button>
  </div>
);

const HeroMetric = ({ label, value, tone }) => (
  <div className="rounded-2xl border border-white/[0.07] bg-[#090909]/60 px-5 py-4">
    <div className="text-[10px] uppercase tracking-[0.24em] text-[#8F8A82]">
      {label}
    </div>
    <div className={`mt-2 text-sm font-semibold ${tone === 'warning' ? 'text-[#D9B381]' : 'text-white'}`}>
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

const RoomStatusTile = ({ label, value }) => (
  <div className="border-b border-white/[0.05] p-5 lg:border-b-0 lg:border-r last:border-r-0">
    <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82]">
      {label}
    </div>
    <div className="mt-3 text-3xl font-semibold text-white">
      {value}
    </div>
  </div>
);

const StatusPill = ({ status }) => {
  const normalized = String(status).toLowerCase();

  const isCritical =
    normalized.includes('critical') ||
    normalized.includes('high') ||
    normalized.includes('missing') ||
    normalized.includes('unassigned') ||
    normalized.includes('dirty') ||
    normalized.includes('pending_inspection');

  const isWarning =
    normalized.includes('pending') ||
    normalized.includes('in_progress') ||
    normalized.includes('requested') ||
    normalized.includes('warning');

  const isGood =
    normalized.includes('complete') ||
    normalized.includes('completed') ||
    normalized.includes('ready') ||
    normalized.includes('scheduled') ||
    normalized.includes('cloudbeds') ||
    normalized.includes('hosthub');

  const classes = isCritical
    ? 'border-[#F0D6A5]/40 bg-[#F0D6A5]/12 text-[#F0D6A5]'
    : isWarning
      ? 'border-[#D9B381]/35 bg-[#D9B381]/10 text-[#D9B381]'
      : isGood
        ? 'border-[#C9A46A]/35 bg-[#C9A46A]/10 text-[#C9A46A]'
        : 'border-white/10 bg-white/[0.04] text-[#BEB7AD]';

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${classes}`}>
      {String(status).replaceAll('_', ' ')}
    </span>
  );
};

const TableHead = ({ children }) => (
  <th className="px-6 py-4 text-[10px] uppercase tracking-[0.26em] text-[#C9A46A] font-bold">
    {children}
  </th>
);

const TableCell = ({ children, strong = false }) => (
  <td className={`px-6 py-5 text-sm ${strong ? 'text-white font-semibold' : 'text-[#BEB7AD]'}`}>
    {children}
  </td>
);

const formatTaskType = (type) => {
  return String(type)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export default ReceptionDash;
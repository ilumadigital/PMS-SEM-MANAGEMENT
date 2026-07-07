import React from 'react';

import {
  cleaningTasks,
  communications,
  linenInventory,
  properties,
  reservations,
  rooms,
  shuttleRequests,
  syncEvents,
} from '../data/semDemoData';

import {
  buildSemDashboardMetrics,
  getPropertyById,
} from '../utils/semOperationsMetrics';

const DashboardPage = () => {
  const metrics = buildSemDashboardMetrics({
    properties,
    rooms,
    reservations,
    cleaningTasks,
    shuttleRequests,
    syncEvents,
    communications,
    linenInventory,
  });

  const arrivalRows = metrics.todayArrivals.map((reservation) => ({
    ...reservation,
    property: getPropertyById(properties, reservation.propertyId),
  }));

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-[#C9A46A]/20 bg-[#111110] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 opacity-[0.045] bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_0)] [background-size:24px_24px]" />
        <div className="absolute right-[-140px] top-[-140px] h-[420px] w-[420px] rounded-full bg-[#C9A46A]/15 blur-3xl" />

        <div className="relative grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-8 p-8 xl:p-10">
          <div>
            <div className="inline-flex rounded-full border border-[#C9A46A]/25 bg-[#C9A46A]/8 px-4 py-2">
              <span className="text-[10px] uppercase tracking-[0.32em] text-[#C9A46A] font-bold">
                SEM Operations Hub · Phase A
              </span>
            </div>

            <h1 className="mt-8 max-w-4xl text-5xl xl:text-6xl font-semibold tracking-[-0.055em] leading-[0.95] text-white">
              Reservations, reception
              <span className="block text-[#C9A46A]">and cleaning in one flow.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-[#BEB7AD]">
              Unified control center for Cloudbeds and Hosthub reservations,
              check-in/out details, room readiness, cleaning tasks and shuttle requests.
            </p>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-3">
              <HeroMetric label="Cloudbeds / Hosthub" value={`${metrics.sync.healthy}/${metrics.sync.healthy + metrics.sync.warning + metrics.sync.error} healthy`} />
              <HeroMetric label="Missing info" value={metrics.missingInfoReservations.length} tone={metrics.missingInfoReservations.length ? 'warning' : 'good'} />
              <HeroMetric label="Occupancy" value={`${metrics.occupancyRate}%`} />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-[#090909]/70 p-6 backdrop-blur">
            <div className="flex items-start justify-between border-b border-white/[0.06] pb-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#8F8A82]">
                  Live bottlenecks
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {metrics.bottlenecks.length} items need attention
                </div>
              </div>

              <StatusPill status={metrics.bottlenecks.length > 3 ? 'High focus' : 'Stable'} />
            </div>

            <div className="mt-6 space-y-4">
              <BriefRow label="High priority cleaning" value={metrics.cleaning.overdue} />
              <BriefRow label="Unassigned shuttle" value={metrics.shuttle.unassigned} />
              <BriefRow label="Pending messages" value={metrics.communication.pending} />
              <BriefRow label="Low linen stock" value={metrics.linen.lowStock} />
            </div>

            <div className="mt-7 rounded-2xl border border-[#C9A46A]/15 bg-[#C9A46A]/8 p-5">
              <div className="text-[10px] uppercase tracking-[0.26em] text-[#C9A46A] font-bold">
                Next best action
              </div>
              <p className="mt-3 text-sm leading-6 text-[#E8E1D5]">
                Complete missing arrival/departure times, assign the unassigned shuttle
                request and clear high priority cleaning before check-in.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <OperationsCard
          label="Arrivals today"
          value={metrics.todayArrivals.length}
          description={`${metrics.tomorrowArrivals.length} arrivals tomorrow`}
        />
        <OperationsCard
          label="Departures today"
          value={metrics.todayDepartures.length}
          description={`${metrics.tomorrowDepartures.length} departures tomorrow`}
        />
        <OperationsCard
          label="Cleaning progress"
          value={`${metrics.cleaning.completed}/${metrics.cleaning.total}`}
          description={`${metrics.cleaning.pending} pending · ${metrics.cleaning.inProgress} in progress`}
        />
        <OperationsCard
          label="Room readiness"
          value={metrics.roomStatus.ready}
          description={`${metrics.roomStatus.dirty + metrics.roomStatus.pendingInspection} rooms not ready`}
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-6">
        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <SectionHeader
            eyebrow="Reception queue"
            title="Operational bottlenecks"
            action="Resolve"
          />

          <div className="divide-y divide-white/[0.05]">
            {metrics.bottlenecks.slice(0, 6).map((item) => (
              <BottleneckRow key={item.id} item={item} />
            ))}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <SectionHeader
            eyebrow="Sync layer"
            title="Cloudbeds / Hosthub"
            action="Logs"
          />

          <div className="p-5 space-y-4">
            {syncEvents.map((event) => (
              <SyncCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
        <SectionHeader
          eyebrow="Today"
          title="Arrivals requiring reception control"
          action="Open reception"
        />

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-y border-white/[0.05] bg-[#0B0B0B]/60">
                <TableHead>Time</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Missing info</TableHead>
                <TableHead>Shuttle</TableHead>
              </tr>
            </thead>
            <tbody>
              {arrivalRows.map((reservation) => (
                <tr
                  key={reservation.id}
                  className="border-b border-white/[0.05] hover:bg-white/[0.025] transition-colors"
                >
                  <TableCell strong>{reservation.arrivalTime || 'Missing'}</TableCell>
                  <TableCell>
                    <div className="text-white font-semibold">{reservation.guestName}</div>
                    <div className="mt-1 text-xs text-[#8F8A82]">{reservation.id}</div>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={reservation.source} />
                  </TableCell>
                  <TableCell>{reservation.property?.name}</TableCell>
                  <TableCell>{reservation.roomNumber}</TableCell>
                  <TableCell>
                    {reservation.missingFields.length ? (
                      <StatusPill status={reservation.missingFields.join(', ')} />
                    ) : (
                      <StatusPill status="complete" />
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={reservation.shuttleRequested ? 'requested' : 'none'} />
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {properties.map((property) => (
          <PropertyOpsCard
            key={property.id}
            property={property}
            rooms={rooms.filter((room) => room.propertyId === property.id)}
            tasks={cleaningTasks.filter((task) => task.propertyId === property.id)}
          />
        ))}
      </section>
    </div>
  );
};

const HeroMetric = ({ label, value, tone }) => (
  <div className="rounded-2xl border border-white/[0.07] bg-[#090909]/60 px-5 py-4">
    <div className="text-[10px] uppercase tracking-[0.24em] text-[#8F8A82]">
      {label}
    </div>
    <div className={`mt-2 text-sm font-semibold ${tone === 'warning' ? 'text-[#D9B381]' : tone === 'good' ? 'text-[#C9A46A]' : 'text-white'}`}>
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

const BottleneckRow = ({ item }) => (
  <div className="grid grid-cols-1 lg:grid-cols-[110px_130px_1fr_auto] gap-5 px-6 py-5 items-start lg:items-center">
    <StatusPill status={item.severity} />
    <div className="text-[10px] uppercase tracking-[0.22em] text-[#C9A46A] font-bold">
      {item.module}
    </div>
    <div>
      <div className="text-base font-semibold text-white">{item.title}</div>
      <div className="mt-2 text-sm leading-6 text-[#9E978E]">{item.description}</div>
    </div>
    <button className="rounded-full border border-[#C9A46A]/20 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-[#C9A46A] hover:bg-[#C9A46A]/10 transition-all">
      {item.action}
    </button>
  </div>
);

const SyncCard = ({ event }) => (
  <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-base font-semibold text-white">{event.provider}</div>
        <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[#8F8A82]">
          Last sync {event.lastSyncAt}
        </div>
      </div>
      <StatusPill status={event.status} />
    </div>

    <p className="mt-4 text-sm leading-6 text-[#BEB7AD]">
      {event.message}
    </p>

    <div className="mt-5 grid grid-cols-3 gap-2">
      <MiniStat label="New" value={event.newReservations} />
      <MiniStat label="Modified" value={event.modifiedReservations} />
      <MiniStat label="Cancelled" value={event.cancelledReservations} />
    </div>
  </div>
);

const PropertyOpsCard = ({ property, rooms, tasks }) => {
  const ready = rooms.filter((room) => room.housekeepingStatus === 'ready').length;
  const pending = tasks.filter((task) => task.status !== 'completed').length;

  return (
    <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] p-6">
      <div className="flex items-start justify-between">
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
        <div className="text-right">
          <div className="text-2xl font-semibold text-white">{ready}/{rooms.length}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[#8F8A82]">
            Ready rooms
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <MiniStat label="Open tasks" value={pending} />
        <MiniStat label="Total rooms" value={property.totalRooms} />
      </div>
    </div>
  );
};

const MiniStat = ({ label, value }) => (
  <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-4">
    <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82]">
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
    normalized.includes('critical') ||
    normalized.includes('high') ||
    normalized.includes('unassigned') ||
    normalized.includes('missing') ||
    normalized.includes('warning');

  const isGood =
    normalized.includes('healthy') ||
    normalized.includes('complete') ||
    normalized.includes('completed') ||
    normalized.includes('ready') ||
    normalized.includes('synced');

  const classes = isCritical
    ? 'border-[#F0D6A5]/40 bg-[#F0D6A5]/12 text-[#F0D6A5]'
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

export default DashboardPage;
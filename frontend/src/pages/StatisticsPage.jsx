import React, { useMemo, useState } from 'react';

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

const StatisticsPage = () => {
  const [selectedScope, setSelectedScope] = useState('all');

  const metrics = useMemo(() => {
    return buildSemDashboardMetrics({
      properties,
      rooms,
      reservations,
      cleaningTasks,
      shuttleRequests,
      syncEvents,
      communications,
      linenInventory,
    });
  }, []);

  const propertyAnalytics = useMemo(() => {
    return properties.map((property) => {
      const propertyReservations = reservations.filter(
        (reservation) => reservation.propertyId === property.id
      );

      const propertyRooms = rooms.filter(
        (room) => room.propertyId === property.id
      );

      const propertyTasks = cleaningTasks.filter(
        (task) => task.propertyId === property.id
      );

      const readyRooms = propertyRooms.filter(
        (room) => room.housekeepingStatus === 'ready'
      ).length;

      const dirtyRooms = propertyRooms.filter(
        (room) => room.housekeepingStatus === 'dirty'
      ).length;

      const openCleaningTasks = propertyTasks.filter(
        (task) => task.status !== 'completed'
      ).length;

      const arrivalsToday = propertyReservations.filter(
        (reservation) => reservation.arrivalDate === '2026-07-08'
      ).length;

      const departuresToday = propertyReservations.filter(
        (reservation) => reservation.departureDate === '2026-07-08'
      ).length;

      const missingInfo = propertyReservations.filter(
        (reservation) => reservation.missingFields.length > 0
      ).length;

      const readinessRate = propertyRooms.length
        ? Math.round((readyRooms / propertyRooms.length) * 100)
        : 0;

      return {
        property,
        reservations: propertyReservations.length,
        rooms: propertyRooms.length,
        readyRooms,
        dirtyRooms,
        openCleaningTasks,
        arrivalsToday,
        departuresToday,
        missingInfo,
        readinessRate,
      };
    });
  }, []);

  const sourceAnalytics = useMemo(() => {
    const sources = ['cloudbeds', 'hosthub', 'manual'];

    return sources.map((source) => {
      const records = reservations.filter(
        (reservation) => reservation.source === source
      );

      return {
        source,
        total: records.length,
        missingInfo: records.filter((record) => record.missingFields.length > 0).length,
        modified: records.filter((record) => record.syncEvent === 'modified_reservation').length,
        confirmed: records.filter((record) => record.status === 'confirmed').length,
      };
    }).filter((item) => item.total > 0);
  }, []);

  const filteredPropertyAnalytics =
    selectedScope === 'all'
      ? propertyAnalytics
      : propertyAnalytics.filter((item) => item.property.id === selectedScope);

  const completionRate = metrics.cleaning.total
    ? Math.round((metrics.cleaning.completed / metrics.cleaning.total) * 100)
    : 0;

  const syncWarningCount = syncEvents.filter(
    (event) => event.status !== 'healthy'
  ).length;

  const shuttleAssignmentRate = metrics.shuttle.total
    ? Math.round(((metrics.shuttle.total - metrics.shuttle.unassigned) / metrics.shuttle.total) * 100)
    : 100;

  const communicationSendRate =
    metrics.communication.pending + metrics.communication.sent
      ? Math.round(
          (metrics.communication.sent /
            (metrics.communication.pending + metrics.communication.sent)) *
            100
        )
      : 0;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-[#C9A46A]/20 bg-[#111110] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 opacity-[0.045] bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_0)] [background-size:24px_24px]" />
        <div className="absolute right-[-140px] top-[-140px] h-[420px] w-[420px] rounded-full bg-[#C9A46A]/15 blur-3xl" />

        <div className="relative grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-8 p-8 xl:p-10">
          <div>
            <div className="inline-flex rounded-full border border-[#C9A46A]/25 bg-[#C9A46A]/8 px-4 py-2">
              <span className="text-[10px] uppercase tracking-[0.32em] text-[#C9A46A] font-bold">
                Management Reporting · SEM Operations
              </span>
            </div>

            <h1 className="mt-8 max-w-4xl text-5xl xl:text-6xl font-semibold tracking-[-0.055em] leading-[0.95] text-white">
              Operational performance,
              <span className="block text-[#C9A46A]">measured daily.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-[#BEB7AD]">
              Management analytics for reservations, Cloudbeds / Hosthub sync,
              room readiness, cleaning completion, shuttle assignment, guest communication
              and linen stock risks.
            </p>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-3">
              <HeroMetric label="Occupancy" value={`${metrics.occupancyRate}%`} />
              <HeroMetric label="Cleaning SLA" value={`${completionRate}%`} tone={completionRate < 70 ? 'warning' : 'good'} />
              <HeroMetric label="Shuttle assigned" value={`${shuttleAssignmentRate}%`} tone={shuttleAssignmentRate < 80 ? 'warning' : 'good'} />
              <HeroMetric label="Sync warnings" value={syncWarningCount} tone={syncWarningCount ? 'warning' : 'good'} />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-[#090909]/70 p-6 backdrop-blur">
            <div className="flex items-start justify-between border-b border-white/[0.06] pb-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#8F8A82]">
                  Executive summary
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {metrics.bottlenecks.length} active bottlenecks
                </div>
              </div>

              <StatusPill status={metrics.bottlenecks.length > 4 ? 'High focus' : 'Controlled'} />
            </div>

            <div className="mt-6 space-y-4">
              <BriefRow label="Arrivals today" value={metrics.todayArrivals.length} />
              <BriefRow label="Departures today" value={metrics.todayDepartures.length} />
              <BriefRow label="Missing reservation info" value={metrics.missingInfoReservations.length} />
              <BriefRow label="Low linen stock alerts" value={metrics.linen.lowStock} />
            </div>

            <div className="mt-7 rounded-2xl border border-[#C9A46A]/15 bg-[#C9A46A]/8 p-5">
              <div className="text-[10px] uppercase tracking-[0.26em] text-[#C9A46A] font-bold">
                Management note
              </div>
              <p className="mt-3 text-sm leading-6 text-[#E8E1D5]">
                Current operational risk is driven mainly by missing reservation details,
                pending cleaning tasks and unassigned shuttle requests.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <OperationsCard
          label="Reservations tracked"
          value={reservations.length}
          description="Unified records from Cloudbeds, Hosthub and manual entries"
        />
        <OperationsCard
          label="Room readiness"
          value={`${metrics.roomStatus.ready}/${metrics.roomStatus.total}`}
          description={`${metrics.roomStatus.dirty + metrics.roomStatus.pendingInspection} rooms require attention`}
        />
        <OperationsCard
          label="Cleaning completion"
          value={`${metrics.cleaning.completed}/${metrics.cleaning.total}`}
          description={`${metrics.cleaning.pending} pending · ${metrics.cleaning.inProgress} in progress`}
        />
        <OperationsCard
          label="Guest messages"
          value={`${communicationSendRate}%`}
          description={`${metrics.communication.pending} pending automated communications`}
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_430px] gap-6">
        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <div className="space-y-5 px-6 py-5 border-b border-white/[0.05]">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
                  Unit performance
                </div>
                <h2 className="mt-2 text-xl font-semibold text-white tracking-[-0.02em]">
                  Property operations analytics
                </h2>
              </div>

              <select
                value={selectedScope}
                onChange={(event) => setSelectedScope(event.target.value)}
                className="rounded-2xl border border-white/10 bg-[#090909] px-5 py-3 text-sm text-white outline-none focus:border-[#C9A46A]/40"
              >
                <option value="all">All properties</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {filteredPropertyAnalytics.map((item) => (
              <PropertyAnalyticsRow key={item.property.id} item={item} />
            ))}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <SectionHeader
            eyebrow="Sources"
            title="Cloudbeds / Hosthub quality"
            action="Sync logs"
          />

          <div className="p-5 space-y-4">
            {sourceAnalytics.map((item) => (
              <SourceAnalyticsCard key={item.source} item={item} />
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <AnalyticsPanel
          eyebrow="Cleaning"
          title="Cleaning pipeline"
          rows={[
            ['Pending', metrics.cleaning.pending],
            ['In progress', metrics.cleaning.inProgress],
            ['Completed', metrics.cleaning.completed],
            ['High priority', metrics.cleaning.overdue],
          ]}
        />

        <AnalyticsPanel
          eyebrow="Shuttle"
          title="Transfer workload"
          rows={[
            ['Open', metrics.shuttle.open],
            ['Unassigned', metrics.shuttle.unassigned],
            ['Scheduled', metrics.shuttle.scheduled],
            ['Completed', metrics.shuttle.completed],
          ]}
        />

        <AnalyticsPanel
          eyebrow="Inventory"
          title="Linen stock health"
          rows={[
            ['Low stock alerts', metrics.linen.lowStock],
            ['Clean stock', metrics.linen.totalClean],
            ['Dirty stock', metrics.linen.totalDirty],
            ['Tracked items', linenInventory.length],
          ]}
        />
      </section>

      <section className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
        <SectionHeader
          eyebrow="Bottlenecks"
          title="Operational risk register"
          action="Export"
        />

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-y border-white/[0.05] bg-[#0B0B0B]/60">
                <TableHead>Module</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Action</TableHead>
              </tr>
            </thead>
            <tbody>
              {metrics.bottlenecks.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-white/[0.05] hover:bg-white/[0.025] transition-colors"
                >
                  <TableCell strong>{item.module}</TableCell>
                  <TableCell>
                    <StatusPill status={item.severity} />
                  </TableCell>
                  <TableCell>{item.title}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell>
                    <button className="rounded-full border border-[#C9A46A]/20 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-[#C9A46A] hover:bg-[#C9A46A]/10 transition-all">
                      {item.action}
                    </button>
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

const PropertyAnalyticsRow = ({ item }) => (
  <div className="grid grid-cols-1 2xl:grid-cols-[1fr_150px_150px_150px_150px] gap-5 px-6 py-5 items-start 2xl:items-center">
    <div>
      <div className="text-lg font-semibold text-white">
        {item.property.name}
      </div>
      <div className="mt-1 text-sm text-[#8F8A82]">
        {item.property.location} · {item.rooms} tracked rooms
      </div>

      <div className="mt-5 h-2 rounded-full bg-white/[0.05] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#C9A46A]"
          style={{ width: `${item.readinessRate}%` }}
        />
      </div>
    </div>

    <SmallInfo label="Readiness" value={`${item.readinessRate}%`} />
    <SmallInfo label="Arrivals" value={item.arrivalsToday} />
    <SmallInfo label="Departures" value={item.departuresToday} />
    <SmallInfo label="Missing info" value={item.missingInfo} />
  </div>
);

const SourceAnalyticsCard = ({ item }) => (
  <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-base font-semibold text-white">
          {formatStatus(item.source)}
        </div>
        <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[#8F8A82]">
          {item.total} synced records
        </div>
      </div>

      <StatusPill status={item.missingInfo ? 'Review' : 'Healthy'} />
    </div>

    <div className="mt-5 grid grid-cols-3 gap-2">
      <MiniStat label="Missing" value={item.missingInfo} />
      <MiniStat label="Modified" value={item.modified} />
      <MiniStat label="Confirmed" value={item.confirmed} />
    </div>
  </div>
);

const AnalyticsPanel = ({ eyebrow, title, rows }) => (
  <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
    <SectionHeader eyebrow={eyebrow} title={title} action="Details" />

    <div className="p-5 space-y-3">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#090909]/60 px-5 py-4"
        >
          <span className="text-sm text-[#9E978E]">{label}</span>
          <span className="text-lg font-semibold text-white">{value}</span>
        </div>
      ))}
    </div>
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
        tone === 'warning' ? 'text-[#D9B381]' : tone === 'good' ? 'text-[#C9A46A]' : 'text-white',
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
      {value}
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
    normalized.includes('critical') ||
    normalized.includes('high') ||
    normalized.includes('review') ||
    normalized.includes('warning') ||
    normalized.includes('unassigned') ||
    normalized.includes('low');

  const isGood =
    normalized.includes('healthy') ||
    normalized.includes('controlled') ||
    normalized.includes('complete') ||
    normalized.includes('completed') ||
    normalized.includes('ready') ||
    normalized.includes('stable');

  const classes = isCritical
    ? 'border-[#F0D6A5]/40 bg-[#F0D6A5]/12 text-[#F0D6A5]'
    : isGood
      ? 'border-[#C9A46A]/35 bg-[#C9A46A]/10 text-[#C9A46A]'
      : 'border-white/10 bg-white/[0.04] text-[#BEB7AD]';

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${classes}`}>
      {formatStatus(status)}
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

const formatStatus = (status) => {
  return String(status)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export default StatisticsPage;
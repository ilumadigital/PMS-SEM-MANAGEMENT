import React, { useContext, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import {
  getPropertyById,
  getRoomById,
} from '../utils/semOperationsMetrics';

const SupervisorPanel = () => {
  const { reservations, properties, rooms } = useContext(CloudbedsDataContext);
  const cleaningTasks = [];
  const shuttleRequests = [];
  const [tasks, setTasks] = useState(cleaningTasks);
  const [activeFilter, setActiveFilter] = useState('all');

  const enrichedTasks = useMemo(() => {
    return tasks.map((task) => {
      const property = getPropertyById(properties, task.propertyId);
      const room = getRoomById(rooms, task.roomId);
      const reservation = reservations.find((item) => item.id === task.reservationId);
      const shuttle = shuttleRequests.find(
        (item) => item.reservationId === task.reservationId
      );

      return {
        ...task,
        property,
        room,
        reservation,
        shuttle,
        riskLevel: calculateTaskRisk(task, reservation, shuttle),
      };
    });
  }, [tasks]);

  const workload = useMemo(() => {
    const grouped = {};

    enrichedTasks.forEach((task) => {
      const owner = task.assignedTo || 'Unassigned';

      if (!grouped[owner]) {
        grouped[owner] = {
          owner,
          total: 0,
          pending: 0,
          inProgress: 0,
          completed: 0,
          highPriority: 0,
        };
      }

      grouped[owner].total += 1;

      if (task.status === 'pending') grouped[owner].pending += 1;
      if (task.status === 'in_progress') grouped[owner].inProgress += 1;
      if (task.status === 'completed') grouped[owner].completed += 1;
      if (task.priority === 'high') grouped[owner].highPriority += 1;
    });

    return Object.values(grouped);
  }, [enrichedTasks]);

  const filteredTasks = enrichedTasks.filter((task) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'critical') return task.riskLevel === 'critical';
    if (activeFilter === 'open') return task.status !== 'completed';
    if (activeFilter === 'completed') return task.status === 'completed';
    return task.status === activeFilter;
  });

  const summary = {
    total: enrichedTasks.length,
    open: enrichedTasks.filter((task) => task.status !== 'completed').length,
    critical: enrichedTasks.filter((task) => task.riskLevel === 'critical').length,
    unassigned: enrichedTasks.filter((task) => !task.assignedTo).length,
    completed: enrichedTasks.filter((task) => task.status === 'completed').length,
  };

  const updateTaskStatus = (taskId, status) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status,
            }
          : task
      )
    );
  };

  const assignTask = (taskId, assignee) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              assignedTo: assignee,
            }
          : task
      )
    );
  };

  const criticalTasks = enrichedTasks.filter((task) => task.riskLevel === 'critical');

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-[#C9A46A]/20 bg-[#111110] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 opacity-[0.045] bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_0)] [background-size:24px_24px]" />
        <div className="absolute right-[-140px] top-[-140px] h-[420px] w-[420px] rounded-full bg-[#C9A46A]/15 blur-3xl" />

        <div className="relative grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-8 p-8 xl:p-10">
          <div>
            <div className="inline-flex rounded-full border border-[#C9A46A]/25 bg-[#C9A46A]/8 px-4 py-2">
              <span className="text-[10px] uppercase tracking-[0.32em] text-[#C9A46A] font-bold">
                Supervisor Control · Cleaning Operations
              </span>
            </div>

            <h1 className="mt-8 max-w-4xl text-5xl xl:text-6xl font-semibold tracking-[-0.055em] leading-[0.95] text-white">
              Control every room,
              <span className="block text-[#C9A46A]">before Reception waits.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-[#BEB7AD]">
              Live supervision for cleaning tasks, team workload, unassigned rooms,
              high-priority inspections and arrival-driven room readiness.
            </p>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-3">
              <HeroMetric label="Open tasks" value={summary.open} tone={summary.open ? 'warning' : 'good'} />
              <HeroMetric label="Critical rooms" value={summary.critical} tone={summary.critical ? 'critical' : 'good'} />
              <HeroMetric label="Unassigned" value={summary.unassigned} tone={summary.unassigned ? 'warning' : 'good'} />
              <HeroMetric label="Completed" value={summary.completed} />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-[#090909]/70 p-6 backdrop-blur">
            <div className="flex items-start justify-between border-b border-white/[0.06] pb-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#8F8A82]">
                  Supervisor risk queue
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {criticalTasks.length} rooms need immediate control
                </div>
              </div>

              <StatusPill status={criticalTasks.length ? 'Critical' : 'Stable'} />
            </div>

            <div className="mt-6 space-y-4">
              <BriefRow label="High priority tasks" value={enrichedTasks.filter((task) => task.priority === 'high').length} />
              <BriefRow label="In progress" value={enrichedTasks.filter((task) => task.status === 'in_progress').length} />
              <BriefRow label="Pending approval" value={enrichedTasks.filter((task) => task.requiresSupervisorApproval).length} />
              <BriefRow label="Completed today" value={summary.completed} />
            </div>

            <div className="mt-7 rounded-2xl border border-[#C9A46A]/15 bg-[#C9A46A]/8 p-5">
              <div className="text-[10px] uppercase tracking-[0.26em] text-[#C9A46A] font-bold">
                Supervisor next action
              </div>
              <p className="mt-3 text-sm leading-6 text-[#E8E1D5]">
                Prioritize G-302 inspection before the 14:30 arrival and assign
                any unassigned arrival setup tasks before Reception escalates.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <OperationsCard
          label="Team workload"
          value={workload.length}
          description="Active cleaners / teams with assigned rooms"
        />
        <OperationsCard
          label="Room inspections"
          value={enrichedTasks.filter((task) => task.type.includes('inspection')).length}
          description="Supervisor-controlled quality checks"
        />
        <OperationsCard
          label="Arrival blockers"
          value={enrichedTasks.filter((task) => task.riskLevel === 'critical').length}
          description="Rooms that may block guest check-in"
        />
        <OperationsCard
          label="Reception updates"
          value={summary.completed}
          description="Completed tasks visible to Reception"
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-6">
        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <div className="flex flex-col gap-5 px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
                Live supervision
              </div>
              <h2 className="mt-2 text-xl font-semibold text-white tracking-[-0.02em]">
                Cleaning task control board
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterButton active={activeFilter === 'all'} onClick={() => setActiveFilter('all')}>
                All
              </FilterButton>
              <FilterButton active={activeFilter === 'critical'} onClick={() => setActiveFilter('critical')}>
                Critical
              </FilterButton>
              <FilterButton active={activeFilter === 'open'} onClick={() => setActiveFilter('open')}>
                Open
              </FilterButton>
              <FilterButton active={activeFilter === 'completed'} onClick={() => setActiveFilter('completed')}>
                Completed
              </FilterButton>
            </div>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {filteredTasks.map((task) => (
              <SupervisorTaskRow
                key={task.id}
                task={task}
                onStatusChange={updateTaskStatus}
                onAssign={assignTask}
              />
            ))}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <SectionHeader
            eyebrow="Team load"
            title="Cleaning workload"
            action="Balance"
          />

          <div className="p-5 space-y-4">
            {workload.map((item) => (
              <WorkloadCard key={item.owner} item={item} />
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
        <SectionHeader
          eyebrow="Room readiness"
          title="Supervisor readiness matrix"
          action="Export"
        />

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-y border-white/[0.05] bg-[#0B0B0B]/60">
                <TableHead>Room</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Guest dependency</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risk</TableHead>
              </tr>
            </thead>
            <tbody>
              {enrichedTasks.map((task) => (
                <tr
                  key={`matrix-${task.id}`}
                  className="border-b border-white/[0.05] hover:bg-white/[0.025] transition-colors"
                >
                  <TableCell strong>{task.roomNumber}</TableCell>
                  <TableCell>{task.property?.name}</TableCell>
                  <TableCell>{formatTaskType(task.type)}</TableCell>
                  <TableCell>
                    {task.reservation ? (
                      <div>
                        <div className="text-white font-semibold">{task.reservation.guestName}</div>
                        <div className="mt-1 text-xs text-[#8F8A82]">
                          Arrival {task.reservation.arrivalTime || 'missing'}
                        </div>
                      </div>
                    ) : (
                      'No linked reservation'
                    )}
                  </TableCell>
                  <TableCell>{task.dueTime}</TableCell>
                  <TableCell>{task.assignedTo || 'Unassigned'}</TableCell>
                  <TableCell>
                    <StatusPill status={task.status} />
                  </TableCell>
                  <TableCell>
                    <StatusPill status={task.riskLevel} />
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

const SupervisorTaskRow = ({ task, onStatusChange, onAssign }) => {
  const nextStatus = getNextStatus(task.status);

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[1fr_190px_190px_180px] gap-5 px-6 py-5 items-start 2xl:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status={task.riskLevel} />
          <StatusPill status={task.priority} />
          <StatusPill status={task.status} />
        </div>

        <div className="mt-4 text-lg font-semibold text-white">
          Room {task.roomNumber} · {formatTaskType(task.type)}
        </div>

        <div className="mt-1 text-sm text-[#8F8A82]">
          {task.property?.name} · Due {task.dueTime}
        </div>

        <p className="mt-3 text-sm leading-6 text-[#BEB7AD]">
          {task.notes}
        </p>

        {task.reservation && (
          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82]">
              Guest dependency
            </div>
            <div className="mt-2 text-sm text-white font-semibold">
              {task.reservation.guestName}
            </div>
            <div className="mt-1 text-sm text-[#9E978E]">
              Arrival {task.reservation.arrivalDate} · {task.reservation.arrivalTime || 'arrival time missing'}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
          Assigned to
        </div>
        <select
          value={task.assignedTo || 'Unassigned'}
          onChange={(event) => onAssign(task.id, event.target.value === 'Unassigned' ? null : event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-[#090909] px-4 py-3 text-sm text-white outline-none focus:border-[#C9A46A]/40"
        >
          <option>Unassigned</option>
          <option>Cleaning Team A</option>
          <option>Cleaning Team B</option>
          <option>Supervisor</option>
          <option>External Cleaner</option>
        </select>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
          Status control
        </div>
        <select
          value={task.status}
          onChange={(event) => onStatusChange(task.id, event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-[#090909] px-4 py-3 text-sm text-white outline-none focus:border-[#C9A46A]/40"
        >
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="flex flex-col gap-3">
        {task.status !== 'completed' && (
          <button
            onClick={() => onStatusChange(task.id, nextStatus)}
            className="rounded-2xl bg-[#C9A46A] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#090909] transition-all hover:bg-[#D7B984]"
          >
            Mark {formatStatus(nextStatus)}
          </button>
        )}

        <button className="rounded-2xl border border-white/10 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#BEB7AD] transition-all hover:border-[#C9A46A]/35 hover:text-white">
          Open task
        </button>
      </div>
    </div>
  );
};

const WorkloadCard = ({ item }) => {
  const completionRate = item.total
    ? Math.round((item.completed / item.total) * 100)
    : 0;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold text-white">
            {item.owner}
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[#8F8A82]">
            {item.total} assigned tasks
          </div>
        </div>

        <StatusPill status={item.highPriority ? 'High load' : 'Balanced'} />
      </div>

      <div className="mt-5 h-2 rounded-full bg-white/[0.05] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#C9A46A]"
          style={{ width: `${completionRate}%` }}
        />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <MiniStat label="Pending" value={item.pending} />
        <MiniStat label="Progress" value={item.inProgress} />
        <MiniStat label="Done" value={item.completed} />
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
    normalized.includes('unassigned') ||
    normalized.includes('pending_inspection');

  const isWarning =
    normalized.includes('pending') ||
    normalized.includes('in_progress') ||
    normalized.includes('medium') ||
    normalized.includes('high load');

  const isGood =
    normalized.includes('completed') ||
    normalized.includes('ready') ||
    normalized.includes('balanced') ||
    normalized.includes('stable');

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

const calculateTaskRisk = (task, reservation, shuttle) => {
  const isHighPriority = task.priority === 'high';
  const isNotCompleted = task.status !== 'completed';
  const hasArrivalSoon = reservation?.arrivalDate === '2026-07-08';
  const hasUnassignedShuttle = shuttle?.status === 'unassigned';

  if (isHighPriority && isNotCompleted) return 'critical';
  if (hasArrivalSoon && isNotCompleted) return 'high';
  if (hasUnassignedShuttle) return 'high';
  if (task.status === 'completed') return 'stable';

  return 'medium';
};

const getNextStatus = (status) => {
  if (status === 'pending') return 'in_progress';
  if (status === 'in_progress') return 'completed';
  return 'completed';
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

export default SupervisorPanel;
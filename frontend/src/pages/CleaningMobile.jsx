import React, { useMemo, useState } from 'react';

import {
  cleaningTasks,
  linenInventory,
  properties,
  reservations,
  rooms,
} from '../data/semDemoData';

import {
  getPropertyById,
  getRoomById,
} from '../utils/semOperationsMetrics';

const CleaningMobile = () => {
  const [tasks, setTasks] = useState(cleaningTasks);
  const [activeFilter, setActiveFilter] = useState('all');

  const enrichedTasks = useMemo(() => {
    return tasks.map((task) => {
      const property = getPropertyById(properties, task.propertyId);
      const room = getRoomById(rooms, task.roomId);
      const reservation = reservations.find(
        (item) => item.id === task.reservationId
      );

      const linenNeeds = getLinenNeedsForTask(task, property?.id);

      return {
        ...task,
        property,
        room,
        reservation,
        linenNeeds,
      };
    });
  }, [tasks]);

  const filteredTasks = enrichedTasks.filter((task) => {
    if (activeFilter === 'all') return true;
    return task.status === activeFilter;
  });

  const summary = {
    assigned: enrichedTasks.length,
    pending: enrichedTasks.filter((task) => task.status === 'pending').length,
    inProgress: enrichedTasks.filter((task) => task.status === 'in_progress').length,
    completed: enrichedTasks.filter((task) => task.status === 'completed').length,
    highPriority: enrichedTasks.filter((task) => task.priority === 'high').length,
  };

  const updateTaskStatus = (taskId, nextStatus) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: nextStatus,
            }
          : task
      )
    );
  };

  return (
    <div className="mx-auto max-w-[720px] space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-[#C9A46A]/20 bg-[#111110] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 opacity-[0.045] bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_0)] [background-size:22px_22px]" />
        <div className="absolute right-[-120px] top-[-120px] h-[280px] w-[280px] rounded-full bg-[#C9A46A]/15 blur-3xl" />

        <div className="relative">
          <div className="inline-flex rounded-full border border-[#C9A46A]/25 bg-[#C9A46A]/8 px-4 py-2">
            <span className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
              Cleaning Team · Mobile View
            </span>
          </div>

          <h1 className="mt-7 text-4xl font-semibold tracking-[-0.055em] leading-[0.95] text-white">
            Today’s assigned rooms.
          </h1>

          <p className="mt-5 text-sm leading-7 text-[#BEB7AD]">
            Update room status in real time. Completed rooms become visible to Reception
            immediately for check-in readiness.
          </p>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <SummaryTile label="Assigned" value={summary.assigned} />
            <SummaryTile label="High priority" value={summary.highPriority} tone="warning" />
            <SummaryTile label="In progress" value={summary.inProgress} />
            <SummaryTile label="Completed" value={summary.completed} tone="good" />
          </div>
        </div>
      </section>

      <section className="flex gap-2 overflow-x-auto pb-1">
        <FilterButton active={activeFilter === 'all'} onClick={() => setActiveFilter('all')}>
          All
        </FilterButton>
        <FilterButton active={activeFilter === 'pending'} onClick={() => setActiveFilter('pending')}>
          Pending
        </FilterButton>
        <FilterButton active={activeFilter === 'in_progress'} onClick={() => setActiveFilter('in_progress')}>
          In Progress
        </FilterButton>
        <FilterButton active={activeFilter === 'completed'} onClick={() => setActiveFilter('completed')}>
          Completed
        </FilterButton>
      </section>

      <section className="space-y-4">
        {filteredTasks.map((task) => (
          <CleaningTaskCard
            key={task.id}
            task={task}
            onUpdateStatus={updateTaskStatus}
          />
        ))}

        {filteredTasks.length === 0 && (
          <div className="rounded-[1.5rem] border border-white/[0.07] bg-[#161615] p-8 text-center">
            <div className="text-base font-semibold text-white">
              No tasks in this filter.
            </div>
            <p className="mt-3 text-sm text-[#9E978E]">
              Change filter to view all assigned cleaning tasks.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

const CleaningTaskCard = ({ task, onUpdateStatus }) => {
  const nextStatus = getNextStatus(task.status);
  const isCompleted = task.status === 'completed';

  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-[#161615] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      <div className="border-b border-white/[0.06] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
              Room {task.roomNumber}
            </div>

            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">
              {formatTaskType(task.type)}
            </h2>

            <div className="mt-2 text-sm text-[#8F8A82]">
              {task.property?.name} · Due {task.dueTime}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <StatusPill status={task.status} />
            <StatusPill status={task.priority} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <DetailBox label="Assigned to" value={task.assignedTo || 'Not assigned'} />
          <DetailBox label="Source" value={formatCreatedFrom(task.createdFrom)} />
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-[#8F8A82]">
            Reception notes
          </div>
          <p className="mt-2 text-sm leading-6 text-[#E8E1D5]">
            {task.notes || 'No notes available.'}
          </p>
        </div>

        {task.reservation && (
          <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-4">
            <div className="text-[10px] uppercase tracking-[0.24em] text-[#8F8A82]">
              Guest context
            </div>

            <div className="mt-3 text-base font-semibold text-white">
              {task.reservation.guestName}
            </div>

            <div className="mt-2 text-sm text-[#9E978E]">
              Arrival {task.reservation.arrivalDate} · {task.reservation.arrivalTime || 'arrival time missing'}
            </div>

            {task.reservation.specialRequests?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {task.reservation.specialRequests.map((request) => (
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
        )}

        <div className="rounded-2xl border border-[#C9A46A]/15 bg-[#C9A46A]/8 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#C9A46A] font-bold">
                Linen / materials
              </div>
              <div className="mt-3 space-y-2">
                {task.linenNeeds.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-[#E8E1D5]">{item.name}</span>
                    <span className="text-[#C9A46A] font-semibold">{item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>

            <StatusPill status={task.linenNeeds.some((item) => item.lowStock) ? 'Low stock' : 'Available'} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {!isCompleted && (
            <button
              onClick={() => onUpdateStatus(task.id, nextStatus)}
              className="w-full rounded-2xl bg-[#C9A46A] px-5 py-4 text-sm font-bold uppercase tracking-[0.2em] text-[#090909] transition-all hover:bg-[#D7B984]"
            >
              Mark as {formatStatus(nextStatus)}
            </button>
          )}

          {task.status === 'completed' && (
            <div className="rounded-2xl border border-[#C9A46A]/25 bg-[#C9A46A]/10 px-5 py-4 text-center">
              <div className="text-[10px] uppercase tracking-[0.22em] text-[#C9A46A] font-bold">
                Reception notified
              </div>
              <div className="mt-2 text-sm text-[#E8E1D5]">
                Room is visible as completed in Reception dashboard.
              </div>
            </div>
          )}

          {task.status !== 'completed' && (
            <button className="w-full rounded-2xl border border-white/10 px-5 py-4 text-sm font-bold uppercase tracking-[0.2em] text-[#BEB7AD] transition-all hover:border-[#C9A46A]/35 hover:text-white">
              Report issue
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

const getLinenNeedsForTask = (task, propertyId) => {
  const propertyLinen = linenInventory.filter((item) => item.propertyId === propertyId);

  const lowStockItems = propertyLinen.filter((item) => item.status === 'low_stock');

  const baseNeeds = [
    {
      name: 'Bed sheets',
      quantity: task.type === 'checkout_cleaning' ? '2 sets' : '1 set',
      lowStock: lowStockItems.some((item) => item.item === 'Bed sheets'),
    },
    {
      name: 'Bath towels',
      quantity: task.type === 'arrival_setup' ? '4 pcs' : '2 pcs',
      lowStock: lowStockItems.some((item) => item.item === 'Bath towels'),
    },
  ];

  if (task.type === 'arrival_setup') {
    baseNeeds.push({
      name: 'Guest amenities',
      quantity: '1 kit',
      lowStock: false,
    });
  }

  if (task.notes?.toLowerCase().includes('baby cot')) {
    baseNeeds.push({
      name: 'Baby cot setup',
      quantity: '1 unit',
      lowStock: false,
    });
  }

  return baseNeeds;
};

const SummaryTile = ({ label, value, tone }) => (
  <div className="rounded-2xl border border-white/[0.07] bg-[#090909]/60 p-4">
    <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82]">
      {label}
    </div>
    <div
      className={[
        'mt-2 text-3xl font-semibold tracking-[-0.05em]',
        tone === 'warning' ? 'text-[#D9B381]' : tone === 'good' ? 'text-[#C9A46A]' : 'text-white',
      ].join(' ')}
    >
      {value}
    </div>
  </div>
);

const FilterButton = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={[
      'shrink-0 rounded-full border px-4 py-3 text-[10px] uppercase tracking-[0.2em] transition-all',
      active
        ? 'border-[#C9A46A]/40 bg-[#C9A46A]/10 text-[#C9A46A]'
        : 'border-white/10 bg-[#161615] text-[#BEB7AD] hover:border-[#C9A46A]/30 hover:text-white',
    ].join(' ')}
  >
    {children}
  </button>
);

const DetailBox = ({ label, value }) => (
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
    normalized.includes('high') ||
    normalized.includes('low stock') ||
    normalized.includes('not assigned') ||
    normalized.includes('pending_inspection');

  const isWarning =
    normalized.includes('pending') ||
    normalized.includes('in_progress') ||
    normalized.includes('medium');

  const isGood =
    normalized.includes('completed') ||
    normalized.includes('ready') ||
    normalized.includes('available');

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

const formatCreatedFrom = (value) => {
  if (value === 'arrival') return 'Arrival-based task';
  if (value === 'departure') return 'Departure-based task';
  return 'Manual task';
};

export default CleaningMobile;
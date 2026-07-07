import React from 'react';

const kpis = [
  {
    label: 'Today arrivals',
    value: '12',
    detail: '4 airport transfers pending',
    trend: '+18%',
  },
  {
    label: 'Pending bookings',
    value: '5',
    detail: 'Require confirmation',
    trend: '2 urgent',
  },
  {
    label: 'Active guests',
    value: '142',
    detail: 'Across all properties',
    trend: '+9%',
  },
  {
    label: 'Rooms ready',
    value: '8',
    detail: 'Housekeeping completed',
    trend: '92%',
  },
];

const todaySchedule = [
  {
    time: '09:20',
    title: 'Airport pickup',
    guest: 'Maria Papadopoulou',
    property: 'Peony Airport Suites',
    status: 'Confirmed',
  },
  {
    time: '11:45',
    title: 'Check-out inspection',
    guest: 'Room 102',
    property: 'Azura Villa',
    status: 'In progress',
  },
  {
    time: '14:30',
    title: 'VIP arrival',
    guest: 'John Smith',
    property: 'Georgali Residence',
    status: 'Priority',
  },
  {
    time: '18:00',
    title: 'Evening transfer',
    guest: 'Anna Brown',
    property: 'Athens Airport',
    status: 'Scheduled',
  },
];

const propertyStatus = [
  {
    name: 'Azura Villa',
    occupancy: '86%',
    readiness: 'Ready',
    rooms: '6 / 7',
  },
  {
    name: 'Peony Airport Suites',
    occupancy: '74%',
    readiness: 'Attention',
    rooms: '11 / 14',
  },
  {
    name: 'Georgali Residence',
    occupancy: '91%',
    readiness: 'Ready',
    rooms: '10 / 11',
  },
];

const recentBookings = [
  {
    code: 'SEM-1048',
    guest: 'Maria Papadopoulou',
    route: 'Airport to Peony Airport Suites',
    date: '08 Jul 2026',
    status: 'Confirmed',
  },
  {
    code: 'SEM-1049',
    guest: 'John Smith',
    route: 'Port to Azura Villa',
    date: '08 Jul 2026',
    status: 'Pending',
  },
  {
    code: 'SEM-1050',
    guest: 'Anna Brown',
    route: 'Georgali Residence to Airport',
    date: '09 Jul 2026',
    status: 'Scheduled',
  },
];

const DashboardPage = () => {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-[#C9A46A]/20 bg-[#111110] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 opacity-[0.05] bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_0)] [background-size:22px_22px]" />
        <div className="absolute right-[-90px] top-[-120px] h-[340px] w-[340px] rounded-full bg-[#C9A46A]/15 blur-3xl" />
        <div className="absolute bottom-[-120px] left-[20%] h-[260px] w-[260px] rounded-full bg-[#8C7657]/10 blur-3xl" />

        <div className="relative grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-8 p-8 xl:p-10">
          <div className="min-h-[310px] flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-[#C9A46A]/25 bg-[#C9A46A]/8 px-4 py-2">
                <span className="text-[10px] uppercase tracking-[0.32em] text-[#C9A46A] font-bold">
                  Private Operations Center
                </span>
              </div>

              <h1 className="mt-8 max-w-4xl text-5xl xl:text-6xl font-semibold tracking-[-0.055em] leading-[0.95] text-white">
                Precision hospitality,
                <span className="block text-[#C9A46A]">controlled in one view.</span>
              </h1>

              <p className="mt-7 max-w-2xl text-base leading-8 text-[#BEB7AD]">
                Real-time operational overview for arrivals, stays, transfers,
                housekeeping readiness and guest experience across SEM properties.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <HeroMetric label="System status" value="Operational" />
              <HeroMetric label="Today focus" value="Arrivals" />
              <HeroMetric label="Service level" value="Premium" />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-[#090909]/70 p-6 backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#8F8A82]">
                  Today
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  Operations Brief
                </div>
              </div>

              <div className="h-12 w-12 rounded-full border border-[#C9A46A]/30 bg-[#C9A46A]/10 flex items-center justify-center">
                <span className="h-2.5 w-2.5 rounded-full bg-[#C9A46A]" />
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <BriefRow label="Arrivals" value="12" />
              <BriefRow label="Departures" value="5" />
              <BriefRow label="Transfers" value="9" />
              <BriefRow label="Open tasks" value="6" />
            </div>

            <div className="mt-7 rounded-2xl border border-[#C9A46A]/15 bg-[#C9A46A]/8 p-5">
              <div className="text-[10px] uppercase tracking-[0.26em] text-[#C9A46A] font-bold">
                Priority note
              </div>
              <p className="mt-3 text-sm leading-6 text-[#E8E1D5]">
                VIP arrival at 14:30 requires room inspection, welcome setup and
                transfer confirmation before 13:45.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {kpis.map((item) => (
          <KpiCard key={item.label} {...item} />
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <SectionHeader
            eyebrow="Live schedule"
            title="Today’s operational timeline"
            action="View all"
          />

          <div className="divide-y divide-white/[0.05]">
            {todaySchedule.map((item) => (
              <TimelineRow key={`${item.time}-${item.title}`} item={item} />
            ))}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <SectionHeader
            eyebrow="Properties"
            title="Readiness monitor"
            action="Manage"
          />

          <div className="p-5 space-y-4">
            {propertyStatus.map((property) => (
              <PropertyCard key={property.name} property={property} />
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
        <SectionHeader
          eyebrow="Reservations"
          title="Recent bookings"
          action="Open bookings"
        />

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-y border-white/[0.05] bg-[#0B0B0B]/60">
                <TableHead>Booking</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </tr>
            </thead>
            <tbody>
              {recentBookings.map((booking) => (
                <tr
                  key={booking.code}
                  className="border-b border-white/[0.05] hover:bg-white/[0.025] transition-colors"
                >
                  <TableCell>
                    <span className="font-semibold text-white">{booking.code}</span>
                  </TableCell>
                  <TableCell>{booking.guest}</TableCell>
                  <TableCell>{booking.route}</TableCell>
                  <TableCell>{booking.date}</TableCell>
                  <TableCell>
                    <StatusPill status={booking.status} />
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

const HeroMetric = ({ label, value }) => (
  <div className="rounded-2xl border border-white/[0.07] bg-[#090909]/60 px-5 py-4">
    <div className="text-[10px] uppercase tracking-[0.24em] text-[#8F8A82]">
      {label}
    </div>
    <div className="mt-2 text-sm font-semibold text-white">
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

const KpiCard = ({ label, value, detail, trend }) => (
  <div className="group rounded-[1.5rem] border border-white/[0.07] bg-[#161615] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#C9A46A]/30 hover:shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
    <div className="flex items-start justify-between">
      <div className="text-[10px] uppercase tracking-[0.26em] text-[#8F8A82] font-bold">
        {label}
      </div>
      <div className="h-2 w-2 rounded-full bg-[#C9A46A]/60 group-hover:bg-[#C9A46A]" />
    </div>

    <div className="mt-8 text-5xl font-semibold tracking-[-0.06em] text-white">
      {value}
    </div>

    <div className="mt-5 flex items-center justify-between gap-4">
      <div className="text-sm text-[#9E978E]">{detail}</div>
      <div className="shrink-0 rounded-full border border-[#C9A46A]/20 bg-[#C9A46A]/8 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#C9A46A]">
        {trend}
      </div>
    </div>
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

const TimelineRow = ({ item }) => (
  <div className="grid grid-cols-[90px_1fr_auto] gap-5 px-6 py-5 items-center">
    <div className="text-2xl font-semibold tracking-[-0.04em] text-white">
      {item.time}
    </div>

    <div>
      <div className="text-base font-semibold text-white">
        {item.title}
      </div>
      <div className="mt-1 text-sm text-[#8F8A82]">
        {item.guest} · {item.property}
      </div>
    </div>

    <StatusPill status={item.status} />
  </div>
);

const PropertyCard = ({ property }) => (
  <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-base font-semibold text-white">
          {property.name}
        </div>
        <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[#8F8A82]">
          {property.rooms} rooms ready
        </div>
      </div>

      <StatusPill status={property.readiness} />
    </div>

    <div className="mt-5">
      <div className="flex justify-between text-xs text-[#8F8A82] mb-2">
        <span>Occupancy</span>
        <span>{property.occupancy}</span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#C9A46A]"
          style={{ width: property.occupancy }}
        />
      </div>
    </div>
  </div>
);

const StatusPill = ({ status }) => {
  const normalized = status.toLowerCase();

  const isPriority = normalized.includes('priority') || normalized.includes('urgent');
  const isPending = normalized.includes('pending') || normalized.includes('attention');
  const isReady = normalized.includes('ready') || normalized.includes('confirmed');

  const classes = isPriority
    ? 'border-[#D7B984]/40 bg-[#D7B984]/12 text-[#F0D6A5]'
    : isPending
      ? 'border-[#B88A5A]/35 bg-[#B88A5A]/10 text-[#D9B381]'
      : isReady
        ? 'border-[#C9A46A]/35 bg-[#C9A46A]/10 text-[#C9A46A]'
        : 'border-white/10 bg-white/[0.04] text-[#BEB7AD]';

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${classes}`}>
      {status}
    </span>
  );
};

const TableHead = ({ children }) => (
  <th className="px-6 py-4 text-[10px] uppercase tracking-[0.26em] text-[#C9A46A] font-bold">
    {children}
  </th>
);

const TableCell = ({ children }) => (
  <td className="px-6 py-5 text-sm text-[#BEB7AD]">
    {children}
  </td>
);

export default DashboardPage;
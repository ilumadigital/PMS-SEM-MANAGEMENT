import React, { useContext, useEffect, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';

const initialSystemSettings = {
  cloudbedsEnabled: true,
  hosthubEnabled: true,
  realtimeSync: true,
  syncInterval: '5 minutes',
  cleaningAutoTasks: true,
  receptionLiveAlerts: true,
  shuttleModule: true,
  linenModule: true,
  twoFactorAuth: true,
  rememberDevice: true,
  pwaEnabled: true,
  whatsappGateway: true,
  emailGateway: true,
  smsGateway: false,
};

const roleMatrix = [
  {
    role: 'Management',
    description: 'Global overview, reporting, modules and company-level settings.',
    access: ['Dashboard', 'Reservations', 'Rooms', 'Cleaning', 'Shuttle', 'Linen', 'Reports', 'Settings'],
  },
  {
    role: 'Reception',
    description: 'Daily arrivals, departures, guest notes, missing info and shuttle requests.',
    access: ['Reservations', 'Reception', 'Rooms', 'Shuttle', 'Guest Communications'],
  },
  {
    role: 'Cleaning Team',
    description: 'Mobile-first assigned cleaning tasks and room status updates.',
    access: ['Cleaning Mobile', 'Room Notes', 'Report Issues'],
  },
  {
    role: 'Supervisor',
    description: 'Cleaning supervision, task assignment, readiness control and escalations.',
    access: ['Supervisor Panel', 'Rooms', 'Cleaning Tasks', 'Team Workload'],
  },
  {
    role: 'Driver',
    description: 'Mobile shuttle schedule, route details and transfer status updates.',
    access: ['Driver Mobile', 'Shuttle Schedule', 'Guest Transfer Notes'],
  },
  {
    role: 'Warehouse Manager',
    description: 'Linen, materials, stock movements and low-stock alerts.',
    access: ['Inventory', 'Linen Movements', 'Stock Reports'],
  },
];

const automationTemplates = [
  {
    id: 'arrival-time-request',
    title: 'Arrival Time Request',
    trigger: 'New reservation without arrival time',
    channel: 'Email / WhatsApp',
    status: 'active',
  },
  {
    id: 'departure-time-request',
    title: 'Departure Time Request',
    trigger: 'Reservation without departure time',
    channel: 'Email',
    status: 'active',
  },
  {
    id: 'self-checkin',
    title: 'Self Check-in Instructions',
    trigger: 'Late arrival or self check-in flag',
    channel: 'WhatsApp',
    status: 'active',
  },
  {
    id: 'shuttle-info',
    title: 'Shuttle Information',
    trigger: 'Assigned driver / vehicle',
    channel: 'WhatsApp',
    status: 'draft',
  },
];

const phaseModules = [
  {
    phase: 'Phase A',
    title: 'Core Platform, Reception, Sync & Cleaning',
    status: 'active',
    modules: ['Cloudbeds Sandbox Sync', 'Reception Dashboard', 'Cleaning Tasks', 'Mobile Cleaning View'],
  },
  {
    phase: 'Phase B',
    title: 'Linen, Materials & Warehouse Roles',
    status: 'planned',
    modules: ['Linen Inventory', 'Stock Movements', 'Low Stock Alerts', 'Warehouse Manager'],
  },
  {
    phase: 'Phase C',
    title: 'Shuttle, Drivers & Transfer Operations',
    status: 'planned',
    modules: ['Shuttle Requests', 'Driver Assignment', 'Vehicle Management', 'Driver Mobile View'],
  },
];

const SettingsPage = () => {
  const { properties, reservations, status, error, refresh, connect } = useContext(CloudbedsDataContext);
  const communications = [];
  const syncEvents = [
    {
      id: 'cloudbeds-sandbox',
      provider: 'Cloudbeds Sandbox',
      status: status?.connected && !error ? 'healthy' : 'warning',
    },
  ];

  const [settings, setSettings] = useState({
    ...initialSystemSettings,
    hosthubEnabled: false,
  });
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [syncInterval, setSyncInterval] = useState(initialSystemSettings.syncInterval);
  const [defaultCheckinTime, setDefaultCheckinTime] = useState('15:00');
  const [defaultCheckoutTime, setDefaultCheckoutTime] = useState('11:00');
  const [cleaningBuffer, setCleaningBuffer] = useState('90');
  const [shuttleBuffer, setShuttleBuffer] = useState('45');

  useEffect(() => {
    if (!selectedPropertyId && properties[0]?.id) {
      setSelectedPropertyId(properties[0].id);
    }
  }, [properties, selectedPropertyId]);

  const selectedProperty = useMemo(() => {
    return properties.find((property) => property.id === selectedPropertyId);
  }, [properties, selectedPropertyId]);

  const healthySyncCount = syncEvents.filter((event) => event.status === 'healthy').length;
  const warningSyncCount = syncEvents.filter((event) => event.status === 'warning').length;
  const pendingCommunications = communications.filter((item) => item.status === 'pending').length;

  const toggleSetting = (key) => {
    setSettings((current) => ({
      ...current,
      [key]: !current[key],
    }));
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
                SEM System Settings
              </span>
            </div>

            <h1 className="mt-8 max-w-4xl text-5xl xl:text-6xl font-semibold tracking-[-0.055em] leading-[0.95] text-white">
              Configure the platform,
              <span className="block text-[#C9A46A]">around SEM operations.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-[#BEB7AD]">
              Manage PMS integrations, role permissions, reception defaults, cleaning
              automation, shuttle parameters, communication templates and security rules.
            </p>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-3">
              <HeroMetric label="Healthy sync" value={healthySyncCount} tone="good" />
              <HeroMetric label="Sync warnings" value={warningSyncCount} tone={warningSyncCount ? 'warning' : 'good'} />
              <HeroMetric label="Pending messages" value={pendingCommunications} tone={pendingCommunications ? 'warning' : 'good'} />
              <HeroMetric label="Active modules" value={Object.values(settings).filter(Boolean).length} />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-[#090909]/70 p-6 backdrop-blur">
            <div className="flex items-start justify-between border-b border-white/[0.06] pb-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#8F8A82]">
                  Platform readiness
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  Phase A configuration
                </div>
              </div>

              <StatusPill status="Active" />
            </div>

            <div className="mt-6 space-y-4">
              <BriefRow label="Cloudbeds sync" value={settings.cloudbedsEnabled ? 'Enabled' : 'Disabled'} />
              <BriefRow label="Hosthub sync" value={settings.hosthubEnabled ? 'Enabled' : 'Disabled'} />
              <BriefRow label="2FA security" value={settings.twoFactorAuth ? 'Enabled' : 'Disabled'} />
              <BriefRow label="PWA access" value={settings.pwaEnabled ? 'Enabled' : 'Disabled'} />
            </div>

            <div className="mt-7 rounded-2xl border border-[#C9A46A]/15 bg-[#C9A46A]/8 p-5">
              <div className="text-[10px] uppercase tracking-[0.26em] text-[#C9A46A] font-bold">
                System note
              </div>
              <p className="mt-3 text-sm leading-6 text-[#E8E1D5]">
                Keep real-time sync, cleaning auto-tasks and reception alerts enabled
                for the Phase A MVP workflow.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <SettingsCard
          label="Integrations"
          value="2"
          description="Cloudbeds and Hosthub reservation sources"
        />
        <SettingsCard
          label="Roles"
          value={roleMatrix.length}
          description="RBAC profiles for SEM operational teams"
        />
        <SettingsCard
          label="Automations"
          value={automationTemplates.filter((item) => item.status === 'active').length}
          description="Active guest communication templates"
        />
        <SettingsCard
          label="Phases"
          value={phaseModules.length}
          description="Implementation modules configured"
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_430px] gap-6">
        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <SectionHeader
            eyebrow="Integrations"
            title="Cloudbeds Sandbox sync settings"
            action="Test sync"
          />

          <div className="p-6 space-y-5">
            <ToggleRow
              title="Cloudbeds reservation sync"
              description="Automatically receive new reservations, modifications and cancellations."
              enabled={settings.cloudbedsEnabled}
              onToggle={() => toggleSetting('cloudbedsEnabled')}
            />
            <ToggleRow
              title="Hosthub reservation sync"
              description="Unify Hosthub records into the SEM common reservation database."
              enabled={settings.hosthubEnabled}
              onToggle={() => toggleSetting('hosthubEnabled')}
            />
            <ToggleRow
              title="Real-time sync mode"
              description="Use webhooks and frequent polling for operational updates."
              enabled={settings.realtimeSync}
              onToggle={() => toggleSetting('realtimeSync')}
            />

            <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
              <label className="block text-[10px] uppercase tracking-[0.24em] text-[#8F8A82] mb-2">
                Sync interval
              </label>
              <select
                value={syncInterval}
                onChange={(event) => setSyncInterval(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#111110] px-4 py-3 text-sm text-white outline-none focus:border-[#C9A46A]/40"
              >
                <option>1 minute</option>
                <option>5 minutes</option>
                <option>15 minutes</option>
                <option>30 minutes</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {syncEvents.map((event) => (
                <SyncStatusCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <SectionHeader
            eyebrow="Security"
            title="Access and protection"
            action="Audit"
          />

          <div className="p-6 space-y-5">
            <ToggleRow
              title="Email 2FA"
              description="Require second-factor verification for users."
              enabled={settings.twoFactorAuth}
              onToggle={() => toggleSetting('twoFactorAuth')}
            />
            <ToggleRow
              title="Remember trusted device"
              description="Allow trusted devices for a limited period."
              enabled={settings.rememberDevice}
              onToggle={() => toggleSetting('rememberDevice')}
            />
            <ToggleRow
              title="PWA access"
              description="Allow staff to install the app on mobile devices."
              enabled={settings.pwaEnabled}
              onToggle={() => toggleSetting('pwaEnabled')}
            />

            <div className="rounded-2xl border border-[#C9A46A]/15 bg-[#C9A46A]/8 p-5">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#C9A46A] font-bold">
                Production security
              </div>
              <p className="mt-3 text-sm leading-6 text-[#E8E1D5]">
                HTTPS, Cloudflare, Fail2Ban, RBAC and 2FA remain core security
                controls for production deployment.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_430px] gap-6">
        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <SectionHeader
            eyebrow="Operations defaults"
            title="Reception, cleaning and shuttle rules"
            action="Save"
          />

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Default check-in time"
                value={defaultCheckinTime}
                onChange={setDefaultCheckinTime}
              />
              <Field
                label="Default check-out time"
                value={defaultCheckoutTime}
                onChange={setDefaultCheckoutTime}
              />
              <Field
                label="Cleaning buffer minutes"
                value={cleaningBuffer}
                onChange={setCleaningBuffer}
              />
              <Field
                label="Shuttle buffer minutes"
                value={shuttleBuffer}
                onChange={setShuttleBuffer}
              />
            </div>

            <ToggleRow
              title="Automatic cleaning task creation"
              description="Create cleaning tasks from arrivals and departures."
              enabled={settings.cleaningAutoTasks}
              onToggle={() => toggleSetting('cleaningAutoTasks')}
            />
            <ToggleRow
              title="Reception live cleaning alerts"
              description="Notify Reception when a room is completed."
              enabled={settings.receptionLiveAlerts}
              onToggle={() => toggleSetting('receptionLiveAlerts')}
            />
            <ToggleRow
              title="Shuttle module"
              description="Enable shuttle requests, driver assignment and vehicle tracking."
              enabled={settings.shuttleModule}
              onToggle={() => toggleSetting('shuttleModule')}
            />
            <ToggleRow
              title="Linen module"
              description="Enable linen stock monitoring and movement logging."
              enabled={settings.linenModule}
              onToggle={() => toggleSetting('linenModule')}
            />
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <SectionHeader
            eyebrow="Property scope"
            title="Unit configuration"
            action="Edit"
          />

          <div className="p-6 space-y-5">
            <select
              value={selectedPropertyId}
              onChange={(event) => setSelectedPropertyId(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-[#090909] px-5 py-3 text-sm text-white outline-none focus:border-[#C9A46A]/40"
            >
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>

            {selectedProperty && (
              <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#C9A46A] font-bold">
                  Selected unit
                </div>

                <div className="mt-4 text-xl font-semibold text-white">
                  {selectedProperty.name}
                </div>

                <div className="mt-2 text-sm text-[#9E978E]">
                  {selectedProperty.type} · {selectedProperty.location}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <MiniStat label="Code" value={selectedProperty.code} />
                  <MiniStat label="Rooms" value={selectedProperty.totalRooms} />
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-[#C9A46A]/15 bg-[#C9A46A]/8 p-5">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#C9A46A] font-bold">
                Unit note
              </div>
              <p className="mt-3 text-sm leading-6 text-[#E8E1D5]">
                Later this panel can store per-property rules: default cleaning teams,
                warehouses, shuttle pickup notes and self check-in templates.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
        <SectionHeader
          eyebrow="RBAC"
          title="Roles and access matrix"
          action="Manage users"
        />

        <div className="divide-y divide-white/[0.05]">
          {roleMatrix.map((role) => (
            <RoleRow key={role.role} role={role} />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_430px] gap-6">
        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <SectionHeader
            eyebrow="Communications"
            title="Guest automation templates"
            action="New template"
          />

          <div className="divide-y divide-white/[0.05]">
            {automationTemplates.map((template) => (
              <AutomationRow key={template.id} template={template} />
            ))}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <SectionHeader
            eyebrow="Implementation"
            title="Project phases"
            action="Roadmap"
          />

          <div className="p-5 space-y-4">
            {phaseModules.map((phase) => (
              <PhaseCard key={phase.phase} phase={phase} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

const ToggleRow = ({ title, description, enabled, onToggle }) => (
  <div className="flex items-center justify-between gap-5 rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
    <div>
      <div className="text-base font-semibold text-white">
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-[#9E978E]">
        {description}
      </p>
    </div>

    <button
      onClick={onToggle}
      className={[
        'relative h-8 w-14 rounded-full border transition-all',
        enabled
          ? 'border-[#C9A46A]/40 bg-[#C9A46A]/25'
          : 'border-white/10 bg-white/[0.04]',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-1 h-6 w-6 rounded-full transition-all',
          enabled
            ? 'left-7 bg-[#C9A46A]'
            : 'left-1 bg-[#8F8A82]',
        ].join(' ')}
      />
    </button>
  </div>
);

const SyncStatusCard = ({ event }) => (
  <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-base font-semibold text-white">
          {event.provider}
        </div>
        <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[#8F8A82]">
          Last sync {event.lastSyncAt}
        </div>
      </div>

      <StatusPill status={event.status} />
    </div>

    <p className="mt-4 text-sm leading-6 text-[#BEB7AD]">
      {event.message}
    </p>
  </div>
);

const RoleRow = ({ role }) => (
  <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-5 px-6 py-5">
    <div>
      <div className="text-lg font-semibold text-white">
        {role.role}
      </div>
      <p className="mt-2 text-sm leading-6 text-[#9E978E]">
        {role.description}
      </p>
    </div>

    <div className="flex flex-wrap gap-2">
      {role.access.map((item) => (
        <StatusPill key={item} status={item} />
      ))}
    </div>
  </div>
);

const AutomationRow = ({ template }) => (
  <div className="grid grid-cols-1 xl:grid-cols-[1fr_170px_120px] gap-5 px-6 py-5 items-start xl:items-center">
    <div>
      <div className="text-base font-semibold text-white">
        {template.title}
      </div>
      <div className="mt-2 text-sm leading-6 text-[#9E978E]">
        Trigger: {template.trigger}
      </div>
    </div>

    <div>
      <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
        Channel
      </div>
      <div className="text-sm font-semibold text-white">
        {template.channel}
      </div>
    </div>

    <StatusPill status={template.status} />
  </div>
);

const PhaseCard = ({ phase }) => (
  <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.24em] text-[#C9A46A] font-bold">
          {phase.phase}
        </div>
        <div className="mt-3 text-base font-semibold text-white">
          {phase.title}
        </div>
      </div>

      <StatusPill status={phase.status} />
    </div>

    <div className="mt-5 flex flex-wrap gap-2">
      {phase.modules.map((module) => (
        <StatusPill key={module} status={module} />
      ))}
    </div>
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
      className="w-full rounded-2xl border border-white/10 bg-[#090909] px-4 py-3 text-sm text-white outline-none placeholder:text-[#6F6B66] focus:border-[#C9A46A]/40"
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
    <span className="text-sm font-semibold text-white">{value}</span>
  </div>
);

const SettingsCard = ({ label, value, description }) => (
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

  const isWarning =
    normalized.includes('warning') ||
    normalized.includes('draft') ||
    normalized.includes('planned') ||
    normalized.includes('disabled') ||
    normalized.includes('review');

  const isGood =
    normalized.includes('active') ||
    normalized.includes('healthy') ||
    normalized.includes('enabled') ||
    normalized.includes('pwa') ||
    normalized.includes('dashboard') ||
    normalized.includes('settings') ||
    normalized.includes('sync') ||
    normalized.includes('rooms') ||
    normalized.includes('cleaning') ||
    normalized.includes('shuttle') ||
    normalized.includes('linen');

  const classes = isWarning
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

const formatStatus = (status) => {
  return String(status)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export default SettingsPage;
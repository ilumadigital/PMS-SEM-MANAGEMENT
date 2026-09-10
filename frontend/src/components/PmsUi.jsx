import React from 'react';

export const todayKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const addDaysKey = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatDate = (value) => {
  if (!value) return '—';
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
};

export const formatTime = (value) => {
  if (!value) return '—';
  return String(value).slice(0, 5);
};

export const formatMoney = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(number);
};

export const humanize = (value) => String(value || 'unknown').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export const initials = (name) => String(name || '?')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('') || '?';

export const StatusBadge = ({ status }) => {
  const normalized = String(status || '').toLowerCase();
  let classes = 'bg-slate-50 text-slate-700 border-slate-200';

  if (['confirmed', 'healthy', 'complete', 'completed', 'ready', 'synced'].some((key) => normalized.includes(key))) {
    classes = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else if (['in_house', 'checked_in', 'occupied'].some((key) => normalized.includes(key))) {
    classes = 'bg-blue-50 text-blue-700 border-blue-200';
  } else if (['pending', 'review', 'warning', 'missing'].some((key) => normalized.includes(key))) {
    classes = 'bg-amber-50 text-amber-800 border-amber-200';
  } else if (['cancelled', 'canceled', 'error', 'failed'].some((key) => normalized.includes(key))) {
    classes = 'bg-rose-50 text-rose-700 border-rose-200';
  }

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${classes}`}>{humanize(status)}</span>;
};

export const PageHeader = ({ title, description, actions }) => (
  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div className="min-w-0">
      <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-slate-950 sm:text-[28px]">{title}</h1>
      {description ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : null}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </div>
);

export const MetricCard = ({ label, value, helper, tone = 'default' }) => {
  const toneClasses = {
    default: 'bg-white border-slate-200/80',
    blue: 'bg-gradient-to-br from-blue-50 to-white border-blue-100',
    green: 'bg-gradient-to-br from-emerald-50 to-white border-emerald-100',
    amber: 'bg-gradient-to-br from-amber-50 to-white border-amber-100',
    rose: 'bg-gradient-to-br from-rose-50 to-white border-rose-100',
  };

  return (
    <div className={`rounded-[20px] border p-5 shadow-[0_8px_28px_rgba(15,23,42,0.05)] ${toneClasses[tone] || toneClasses.default}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</div>
      <div className="mt-2 text-[30px] font-semibold tracking-[-0.035em] text-slate-950">{value}</div>
      {helper ? <div className="mt-2 text-xs leading-5 text-slate-500">{helper}</div> : null}
    </div>
  );
};

export const Panel = ({ title, description, action, children, className = '' }) => (
  <section className={`overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_10px_34px_rgba(15,23,42,0.05)] ${className}`}>
    {(title || description || action) && (
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {title ? <h2 className="text-[15px] font-semibold text-slate-950">{title}</h2> : null}
          {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);

export const ConnectionBanner = ({ status, loading, error, onRefresh, onConnect }) => {
  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">Loading Cloudbeds data…</div>;
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-sm font-semibold text-rose-800">Cloudbeds sync needs attention</div><div className="mt-1 text-xs text-rose-700">{error}</div></div>
        <button onClick={status?.connected ? onRefresh : onConnect} className="pms-button-secondary">{status?.connected ? 'Retry sync' : 'Connect Cloudbeds'}</button>
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-sm font-semibold text-amber-900">Cloudbeds is not connected</div><div className="mt-1 text-xs text-amber-700">Connect the sandbox property to load reservations and guests.</div></div>
        <button onClick={onConnect} className="pms-button-primary">Connect Cloudbeds</button>
      </div>
    );
  }

  return null;
};

export const EmptyState = ({ title, description }) => (
  <div className="px-6 py-12 text-center">
    <div className="text-sm font-semibold text-slate-800">{title}</div>
    {description ? <div className="mt-1 text-sm leading-6 text-slate-500">{description}</div> : null}
  </div>
);

export const TableShell = ({ children }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-left text-sm">{children}</table>
  </div>
);

export const Th = ({ children }) => (
  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">{children}</th>
);

export const Td = ({ children, className = '' }) => (
  <td className={`border-b border-slate-100 px-4 py-3.5 align-middle text-slate-700 ${className}`}>{children}</td>
);

import React, { useContext, useEffect, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import api from '../services/api';
import { MetricCard, PageHeader, Panel, StatusBadge } from '../components/PmsUi';

const defaultOps = { 'operations.defaultTransferBufferMinutes': '30', 'operations.requireDriverVehicle': 'true', 'housekeeping.priorityWindowHours': '3', 'reports.defaultRangeDays': '30' };

const SettingsPage = () => {
  const cloudbeds = useContext(CloudbedsDataContext);
  const { reservations, customers, rooms, housekeeping, diagnostics, status, loading, error, refresh, connect, reauthorize, disconnect } = cloudbeds;
  const [runtime, setRuntime] = useState(null);
  const [runtimeError, setRuntimeError] = useState('');
  const [ops, setOps] = useState(defaultOps);
  const [opsState, setOpsState] = useState('');

  useEffect(() => {
    let active = true;
    Promise.allSettled([api.get('/integrations/cloudbeds/config'), api.get('/management/settings')]).then(([cloud, settings]) => {
      if (!active) return;
      if (cloud.status === 'fulfilled') setRuntime(cloud.value.data); else setRuntimeError(cloud.reason?.response?.data?.message || cloud.reason?.message || 'Could not load Cloudbeds runtime configuration.');
      if (settings.status === 'fulfilled') setOps((current) => ({ ...current, ...(settings.value.data || {}) }));
    });
    return () => { active = false; };
  }, []);

  const saveOps = async () => {
    setOpsState('saving');
    try { await api.put('/management/settings', ops); setOpsState('saved'); setTimeout(()=>setOpsState(''), 2000); }
    catch { setOpsState('error'); }
  };

  const authorized = Boolean(status?.authorized || status?.connected);
  const ready = Boolean(status?.connected && status?.dataStatus === 'ready');
  const missingScopes = diagnostics?.missingScopes || [];
  const requiredScopes = runtime?.requiredScopes || status?.requiredScopes || [];
  const connectionStatus = error ? 'error' : ready ? 'healthy' : authorized ? 'review' : 'not connected';

  return <div className="space-y-6">
    <PageHeader title="Settings" description="Integrations, PMS behavior and operational defaults." actions={<div className="flex flex-wrap gap-2"><button onClick={refresh} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{loading ? 'Checking…' : 'Test sync'}</button>{authorized ? <button onClick={reauthorize} className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-700">Re-authorize Cloudbeds</button> : <button onClick={connect} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">Connect Cloudbeds</button>}</div>} />

    {(error || runtimeError) && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"><div className="text-sm font-semibold text-rose-800">Configuration issue</div><div className="mt-1 text-xs text-rose-700">{error || runtimeError}</div></div>}

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
      <MetricCard label="Reservations" value={loading ? '…' : reservations.length}/><MetricCard label="Guests" value={loading ? '…' : customers.length}/><MetricCard label="Rooms" value={loading ? '…' : rooms.length}/><MetricCard label="Housekeeping" value={loading ? '…' : housekeeping.length}/><MetricCard label="Sync state" value={ready ? 'Ready' : authorized ? 'Review' : 'Offline'} tone={ready ? 'green' : authorized ? 'amber' : 'default'}/>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Cloudbeds connection" description="Connection health without exposing credentials or secrets."><div className="space-y-4 p-5">
        <Row label="SEM readiness" value={<StatusBadge status={connectionStatus}/>}/><Row label="Authorized" value={authorized ? 'Yes' : 'No'}/><Row label="Environment" value={status?.environment || runtime?.environment || 'sandbox'}/><Row label="Data status" value={status?.dataStatus || 'offline'}/><Row label="Property IDs" value={(status?.connectedPropertyIds || []).join(', ') || 'Not discovered'}/><Row label="Last sync" value={status?.lastSyncAt || 'No successful sync yet'}/>
        {authorized && <button onClick={disconnect} className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Disconnect Cloudbeds</button>}
      </div></Panel>

      <Panel title="Operations defaults" description="Persistent values used across transfers, housekeeping and reports."><div className="grid gap-4 p-5 sm:grid-cols-2">
        <Setting label="Transfer buffer (minutes)" value={ops['operations.defaultTransferBufferMinutes']} onChange={(v)=>setOps({...ops,'operations.defaultTransferBufferMinutes':v})} type="number"/>
        <Setting label="Housekeeping priority window (hours)" value={ops['housekeeping.priorityWindowHours']} onChange={(v)=>setOps({...ops,'housekeeping.priorityWindowHours':v})} type="number"/>
        <Setting label="Default report range (days)" value={ops['reports.defaultRangeDays']} onChange={(v)=>setOps({...ops,'reports.defaultRangeDays':v})} type="number"/>
        <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Require driver + vehicle</span><select value={ops['operations.requireDriverVehicle']} onChange={(e)=>setOps({...ops,'operations.requireDriverVehicle':e.target.value})} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <div className="sm:col-span-2 flex items-center justify-end gap-3"><span className={`text-xs ${opsState==='error'?'text-rose-600':'text-emerald-600'}`}>{opsState==='saved'?'Saved':opsState==='error'?'Save failed':''}</span><button onClick={saveOps} disabled={opsState==='saving'} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{opsState==='saving'?'Saving…':'Save settings'}</button></div>
      </div></Panel>
    </div>

    <Panel title="Required Cloudbeds permissions" description="Scopes required by the currently enabled SEM PMS modules."><div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">{requiredScopes.map((scope)=>{const missing=missingScopes.includes(scope);return <div key={scope} className={`rounded-xl border p-4 ${missing?'border-amber-200 bg-amber-50':'border-emerald-200 bg-emerald-50'}`}><div className={`font-mono text-sm font-semibold ${missing?'text-amber-900':'text-emerald-900'}`}>{scope}</div><div className={`mt-2 text-xs ${missing?'text-amber-700':'text-emerald-700'}`}>{missing?'Permission needs attention':'No scope error detected'}</div></div>})}</div></Panel>
  </div>;
};

const Row = ({label,value}) => <div className="flex items-start justify-between gap-5 border-b border-slate-100 pb-3 last:border-0 last:pb-0"><span className="text-sm text-slate-500">{label}</span><span className="max-w-[65%] break-words text-right text-sm font-semibold text-slate-900">{value}</span></div>;
const Setting = ({label,value,onChange,type='text'}) => <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input type={type} min="0" value={value || ''} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/></label>;
export default SettingsPage;

import React, { useContext, useEffect, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import api from '../services/api';
import { MetricCard, PageHeader, Panel, StatusBadge, TableShell, Td, Th } from '../components/PmsUi';

const defaultOps = { 'operations.defaultTransferBufferMinutes': '30', 'operations.requireDriverVehicle': 'true', 'housekeeping.priorityWindowHours': '3', 'reports.defaultRangeDays': '30' };

const SettingsPage = () => {
  const cloudbeds = useContext(CloudbedsDataContext);
  const { reservations, customers, rooms, housekeeping, diagnostics, status, loading, error, refresh, connect, reauthorize, disconnect, getWriteAudit } = cloudbeds;
  const [runtime, setRuntime] = useState(null);
  const [runtimeError, setRuntimeError] = useState('');
  const [ops, setOps] = useState(defaultOps);
  const [opsState, setOpsState] = useState('');
  const [audit, setAudit] = useState([]);
  const [auditError, setAuditError] = useState('');

  const loadAudit = async () => {
    try { setAudit(await getWriteAudit(100)); setAuditError(''); }
    catch (e) { setAuditError(e.response?.data?.message || e.message || 'Could not load write audit.'); }
  };

  useEffect(() => {
    let active = true;
    Promise.allSettled([api.get('/integrations/cloudbeds/config'), api.get('/management/settings'), getWriteAudit(100)]).then(([cloud, settings, writes]) => {
      if (!active) return;
      if (cloud.status === 'fulfilled') setRuntime(cloud.value.data); else setRuntimeError(cloud.reason?.response?.data?.message || cloud.reason?.message || 'Could not load Cloudbeds runtime configuration.');
      if (settings.status === 'fulfilled') setOps((current) => ({ ...current, ...(settings.value.data || {}) }));
      if (writes.status === 'fulfilled') setAudit(writes.value || []); else setAuditError(writes.reason?.response?.data?.message || writes.reason?.message || 'Could not load write audit.');
    });
    return () => { active = false; };
  }, [getWriteAudit]);

  const saveOps = async () => {
    setOpsState('saving');
    try { await api.put('/management/settings', ops); setOpsState('saved'); setTimeout(()=>setOpsState(''), 2000); }
    catch { setOpsState('error'); }
  };

  const authorized = Boolean(status?.authorized || status?.connected);
  const ready = Boolean(status?.connected && status?.dataStatus === 'ready');
  const missingScopes = diagnostics?.missingScopes || [];
  const requestedScopes = runtime?.authorizationScopes || runtime?.requiredScopes || status?.requiredScopes || [];
  const connectionStatus = error ? 'error' : ready ? 'healthy' : authorized ? 'review' : 'not connected';
  const writeScopes = requestedScopes.filter((scope)=>String(scope).startsWith('write:'));
  // Audit rows are returned newest-first. Only the latest write result should
  // control the warning: a newer successful write clears any older failures.
  const latestWrite = audit[0] || null;
  const latestWriteFailed = latestWrite?.status === 'failed';
  const latestWriteMessage = String(latestWrite?.errorMessage || '').toLowerCase();
  const latestWritePermissionFailure = latestWriteFailed && (
    latestWriteMessage.includes('scope required') ||
    latestWriteMessage.includes('not granted by property') ||
    latestWriteMessage.includes('permission') ||
    latestWriteMessage.includes('authorization')
  );

  return <div className="space-y-6">
    <PageHeader title="Settings" description="Cloudbeds read-only for reservations and inventory, with a controlled housekeeping room-condition sync back to Cloudbeds." actions={<div className="flex flex-wrap gap-2"><button onClick={refresh} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{loading ? 'Checking…' : 'Test sync'}</button>{authorized ? <button onClick={reauthorize} className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-700">Re-authorize Cloudbeds</button> : <button onClick={connect} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">Connect Cloudbeds</button>}</div>} />

    {(error || runtimeError) && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"><div className="text-sm font-semibold text-rose-800">Configuration issue</div><div className="mt-1 text-xs text-rose-700">{error || runtimeError}</div></div>}

    {authorized && latestWriteFailed && <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-black text-amber-950">{latestWritePermissionFailure ? 'Cloudbeds write permissions are missing on the current API key' : 'The latest Cloudbeds write failed'}</div><div className="mt-1 text-xs font-medium text-amber-800">{latestWritePermissionFailure ? 'The latest write was rejected by Cloudbeds authorization. Re-authorize so Cloudbeds can issue a new key with the required write scopes.' : (latestWrite?.errorMessage || 'The latest write operation failed. Check the audit details and retry.')}</div></div>{latestWritePermissionFailure && <button onClick={reauthorize} className="shrink-0 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-700">Re-authorize now</button>}</div>}

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
      <MetricCard label="Reservations" value={loading ? '…' : reservations.length}/><MetricCard label="Guests" value={loading ? '…' : customers.length}/><MetricCard label="Rooms" value={loading ? '…' : rooms.length}/><MetricCard label="Housekeeping" value={loading ? '…' : housekeeping.length}/><MetricCard label="Write scopes" value={writeScopes.length} tone={writeScopes.length?'blue':'default'}/><MetricCard label="Sync state" value={ready ? 'Ready' : authorized ? 'Review' : 'Offline'} tone={ready ? 'green' : authorized ? 'amber' : 'default'}/>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Cloudbeds connection" description="Connection health without exposing credentials or secrets."><div className="space-y-4 p-5">
        <Row label="SEM readiness" value={<StatusBadge status={connectionStatus}/>}/><Row label="Authorized" value={authorized ? 'Yes' : 'No'}/><Row label="Environment" value={status?.environment || runtime?.environment || 'sandbox'}/><Row label="Data status" value={status?.dataStatus || 'offline'}/><Row label="Property IDs" value={(status?.connectedPropertyIds || []).join(', ') || 'Not discovered'}/><Row label="Last sync" value={status?.lastSyncAt || 'No successful sync yet'}/><Row label="Write scopes requested" value={writeScopes.length ? `${writeScopes.length} enabled in OAuth request` : 'None · read-only mode'}/>
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

    <Panel title="Cloudbeds read-only permissions requested by SEM" description="Cloudbeds is read-only for reservations, properties and rooms. Only housekeeping room condition (Clean / Dirty / Inspected) is allowed to sync back; other operational fields stay inside SEM PMS."><div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">{requestedScopes.map((scope)=>{const missing=missingScopes.includes(scope);const write=String(scope).startsWith('write:');return <div key={scope} className={`rounded-xl border p-4 ${missing?'border-amber-200 bg-amber-50':write?'border-blue-200 bg-blue-50':'border-emerald-200 bg-emerald-50'}`}><div className={`font-mono text-xs font-bold ${missing?'text-amber-900':write?'text-blue-900':'text-emerald-900'}`}>{scope}</div><div className={`mt-2 text-[11px] ${missing?'text-amber-700':write?'text-blue-700':'text-emerald-700'}`}>{missing?'Permission needs attention':write?'Unexpected write scope':'Read permission'}</div></div>})}</div></Panel>

    <Panel title="Legacy Cloudbeds write audit" description="Historical write attempts from earlier builds. Current operational changes are stored locally in SEM PMS." action={<button onClick={loadAudit} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Refresh audit</button>}>
      {auditError && <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{auditError}</div>}
      {audit.length ? <TableShell><thead><tr><Th>Time</Th><Th>User</Th><Th>Operation</Th><Th>Entity</Th><Th>Status</Th><Th>Request ID</Th></tr></thead><tbody className="divide-y divide-slate-100">{audit.map((item)=><tr key={item.id}><Td>{formatDateTime(item.createdAt)}</Td><Td><div className="text-xs font-semibold text-slate-800">{item.actorUserId || 'system'}</div><div className="text-[10px] text-slate-400">{item.actorRole || '—'}</div></Td><Td><div className="font-mono text-xs text-slate-700">{item.operation}</div><div className="text-[10px] text-slate-400">{item.endpoint}</div></Td><Td><div className="text-xs font-semibold">{item.entityType}</div><div className="font-mono text-[10px] text-slate-400">{item.externalId || '—'}</div></Td><Td><StatusBadge status={item.status}/>{item.errorMessage && <div className="mt-1 max-w-56 text-[10px] text-rose-600">{item.errorMessage}</div>}</Td><Td><span className="font-mono text-[10px] text-slate-500">{item.requestId || '—'}</span></Td></tr>)}</tbody></TableShell> : <div className="p-8 text-center text-sm text-slate-500">No Cloudbeds writes have been recorded yet.</div>}
    </Panel>
  </div>;
};

const Row = ({label,value}) => <div className="flex items-start justify-between gap-5 border-b border-slate-100 pb-3 last:border-0 last:pb-0"><span className="text-sm text-slate-500">{label}</span><span className="max-w-[65%] break-words text-right text-sm font-semibold text-slate-900">{value}</span></div>;
const Setting = ({label,value,onChange,type='text'}) => <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input type={type} min="0" value={value || ''} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/></label>;
const formatDateTime = (value) => { if (!value) return '—'; const d=new Date(value); return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(d); };
export default SettingsPage;

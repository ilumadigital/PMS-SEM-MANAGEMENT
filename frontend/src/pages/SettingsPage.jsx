import React, { useContext, useEffect, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import api from '../services/api';
import { MetricCard, PageHeader, Panel, StatusBadge, TableShell, Td, Th } from '../components/PmsUi';

const defaultOps = {
  'operations.defaultTransferBufferMinutes': '30',
  'operations.requireDriverVehicle': 'true',
  'housekeeping.priorityWindowHours': '3',
  'reports.defaultRangeDays': '30',
};

const emptyUser = { firstName:'', lastName:'', email:'', password:'', role:'cleaner' };

const SettingsPage = () => {
  const cloudbeds = useContext(CloudbedsDataContext);
  const { reservations, customers, rooms, housekeeping, diagnostics, status, loading, error, refresh, connect, reauthorize, disconnect, getWriteAudit } = cloudbeds;

  const [runtime,setRuntime]=useState(null);
  const [runtimeError,setRuntimeError]=useState('');
  const [ops,setOps]=useState(defaultOps);
  const [opsState,setOpsState]=useState('');
  const [audit,setAudit]=useState([]);
  const [auditError,setAuditError]=useState('');

  const [roles,setRoles]=useState([]);
  const [users,setUsers]=useState([]);
  const [newUser,setNewUser]=useState(emptyUser);
  const [userState,setUserState]=useState({saving:false,error:'',message:''});
  const [passwordDrafts,setPasswordDrafts]=useState({});
  const [hosthub,setHosthub]=useState({ environment:'sandbox', baseUrl:'https://eric.hosthub.com/api/2019-03-01', configured:false, source:'none', rentalCount:null, lastSyncAt:null });
  const [hosthubState,setHosthubState]=useState({testing:false,error:'',message:''});

  const loadUsers = async () => {
    try {
      const [userResponse,roleResponse]=await Promise.all([api.get('/admin/users'),api.get('/admin/roles')]);
      setUsers(userResponse.data?.data || []);
      setRoles(roleResponse.data?.data || []);
    } catch (e) {
      setUserState((s)=>({...s,error:e.response?.data?.message || e.message || 'Could not load users.'}));
    }
  };

  const loadAudit = async () => {
    try { setAudit(await getWriteAudit(100)); setAuditError(''); }
    catch (e) { setAuditError(e.response?.data?.message || e.message || 'Could not load write audit.'); }
  };

  useEffect(() => {
    let active=true;
    Promise.allSettled([
      api.get('/integrations/cloudbeds/config'),
      api.get('/management/settings'),
      getWriteAudit(100),
      api.get('/admin/users'),
      api.get('/admin/roles'),
      api.get('/integrations/hosthub/status'),
    ]).then(([cloud,settings,writes,userResult,roleResult,hosthubResult])=>{
      if(!active)return;
      if(cloud.status==='fulfilled') setRuntime(cloud.value.data); else setRuntimeError(cloud.reason?.response?.data?.message || cloud.reason?.message || 'Could not load Cloudbeds runtime configuration.');
      if(settings.status==='fulfilled') setOps((current)=>({...current,...(settings.value.data||{})}));
      if(writes.status==='fulfilled') setAudit(writes.value||[]); else setAuditError(writes.reason?.response?.data?.message || writes.reason?.message || 'Could not load write audit.');
      if(userResult.status==='fulfilled') setUsers(userResult.value.data?.data||[]);
      if(roleResult.status==='fulfilled') setRoles(roleResult.value.data?.data||[]);
      if(hosthubResult.status==='fulfilled') {
        const data=hosthubResult.value.data||{};
        setHosthub((current)=>({
          ...current,
          environment:data.environment||'sandbox',
          baseUrl:data.baseUrl||current.baseUrl,
          configured:Boolean(data.configured),
          source:data.source||'none',
        }));
      }
    });
    return()=>{active=false;};
  },[getWriteAudit]);

  const createUser=async(e)=>{
    e.preventDefault();
    setUserState({saving:true,error:'',message:''});
    try {
      await api.post('/admin/users',newUser);
      setNewUser(emptyUser);
      await loadUsers();
      setUserState({saving:false,error:'',message:'User created successfully.'});
    } catch(err){
      setUserState({saving:false,error:err.response?.data?.message || err.message || 'Could not create user.',message:''});
    }
  };

  const patchUser=async(id,patch)=>{
    setUserState({saving:true,error:'',message:''});
    try {
      await api.patch(`/admin/users/${id}`,patch);
      await loadUsers();
      setUserState({saving:false,error:'',message:'User updated.'});
    } catch(err){
      setUserState({saving:false,error:err.response?.data?.message || err.message || 'Could not update user.',message:''});
    }
  };

  const resetPassword=async(user)=>{
    const password=String(passwordDrafts[user.id]||'');
    if(password.length<8){setUserState({saving:false,error:'Password must be at least 8 characters.',message:''});return;}
    await patchUser(user.id,{password});
    setPasswordDrafts((current)=>({...current,[user.id]:''}));
  };

  const saveOps=async()=>{
    setOpsState('saving');
    try { await api.put('/management/settings',ops); setOpsState('saved'); setTimeout(()=>setOpsState(''),2000); }
    catch { setOpsState('error'); }
  };

  const testHosthub=async()=>{
    setHosthubState({testing:true,error:'',message:''});
    try {
      const response=await api.post('/integrations/hosthub/test');
      const data=response.data||{};
      setHosthub((current)=>({...current,configured:true,rentalCount:data.rentalCount??0,lastSyncAt:new Date().toISOString()}));
      setHosthubState({testing:false,error:'',message:`Hosthub connected successfully · ${data.rentalCount??0} rentals found.`});
    } catch(err){
      setHosthubState({testing:false,error:err.response?.data?.message||err.message||'Hosthub connection test failed.',message:''});
    }
  };

  const authorized=Boolean(status?.authorized || status?.connected);
  const ready=Boolean(status?.connected && status?.dataStatus==='ready');
  const missingScopes=diagnostics?.missingScopes || [];
  const requestedScopes=runtime?.authorizationScopes || runtime?.requiredScopes || status?.requiredScopes || [];
  const writeScopes=requestedScopes.filter((scope)=>String(scope).startsWith('write:'));
  const connectionStatus=error?'error':ready?'healthy':authorized?'review':'not connected';
  const apiKeyMode=Boolean(runtime?.envApiKeyEnabled || status?.source==='environment_api_key');
  const cloudbedsWriteCount=writeScopes.filter((scope)=>scope!=='write:housekeeping').length;

  return <div className="space-y-6">
    <PageHeader
      title="Developer Settings"
      description="Administrator-only configuration: users and roles, Cloudbeds + Hosthub integrations, operational defaults and technical audit."
      actions={<div className="flex flex-wrap gap-2"><button onClick={refresh} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">{loading?'Checking…':'Test sync'}</button>{!apiKeyMode&&(authorized?<button onClick={reauthorize} className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white">Re-authorize Cloudbeds</button>:<button onClick={connect} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white">Connect Cloudbeds</button>)}</div>}
    />

    {(error||runtimeError||userState.error)&&<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{userState.error || error || runtimeError}</div>}
    {userState.message&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{userState.message}</div>}

    <Panel title="Users & roles" description="Only Administrators can create accounts or change roles. Cleaner and Driver accounts only see their assigned schedules.">
      <form onSubmit={createUser} className="grid gap-3 border-b border-slate-100 p-5 md:grid-cols-2 xl:grid-cols-6">
        <Field label="First name" value={newUser.firstName} onChange={v=>setNewUser({...newUser,firstName:v})} required/>
        <Field label="Last name" value={newUser.lastName} onChange={v=>setNewUser({...newUser,lastName:v})}/>
        <Field label="Email" type="email" value={newUser.email} onChange={v=>setNewUser({...newUser,email:v})} required/>
        <Field label="Temporary password" type="password" value={newUser.password} onChange={v=>setNewUser({...newUser,password:v})} required/>
        <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Role</span><select value={newUser.role} onChange={e=>setNewUser({...newUser,role:e.target.value})} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">{roles.map(role=><option key={role.key} value={role.key}>{role.label}</option>)}</select></label>
        <div className="flex items-end"><button disabled={userState.saving} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Create user</button></div>
      </form>

      <div className="grid gap-3 border-b border-slate-100 bg-slate-50 p-5 md:grid-cols-2 xl:grid-cols-4">
        {roles.map(role=><div key={role.key} className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-sm font-black text-slate-950">{role.label}</div><div className="mt-1 font-mono text-[10px] text-slate-400">{role.key}</div><div className="mt-2 text-xs leading-5 text-slate-600">{role.description}</div></div>)}
      </div>

      {users.length?<TableShell><thead><tr><Th>User</Th><Th>Email</Th><Th>Role</Th><Th>Active</Th><Th>Reset password</Th></tr></thead><tbody className="divide-y divide-slate-100">{users.map(user=><tr key={user.id}><Td><div className="font-semibold text-slate-950">{user.firstName} {user.lastName}</div><div className="mt-0.5 text-[10px] font-mono text-slate-400">#{user.id}</div></Td><Td>{user.email}</Td><Td><select value={user.role} onChange={e=>patchUser(user.id,{role:e.target.value})} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold">{roles.map(role=><option key={role.key} value={role.key}>{role.label}</option>)}</select></Td><Td><select value={user.isActive?'yes':'no'} onChange={e=>patchUser(user.id,{isActive:e.target.value==='yes'})} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold"><option value="yes">Active</option><option value="no">Disabled</option></select></Td><Td><div className="flex min-w-[250px] gap-2"><input type="password" value={passwordDrafts[user.id]||''} onChange={e=>setPasswordDrafts({...passwordDrafts,[user.id]:e.target.value})} placeholder="New password" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"/><button type="button" onClick={()=>resetPassword(user)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Set</button></div></Td></tr>)}</tbody></TableShell>:<div className="p-8 text-center text-sm text-slate-500">No users found.</div>}
    </Panel>

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
      <MetricCard label="Reservations" value={loading?'…':reservations.length}/>
      <MetricCard label="Guests" value={loading?'…':customers.length}/>
      <MetricCard label="Rooms" value={loading?'…':rooms.length}/>
      <MetricCard label="Housekeeping" value={loading?'…':housekeeping.length}/>
      <MetricCard label="Cloudbeds writes" value={cloudbedsWriteCount?`${cloudbedsWriteCount} scopes`:'None'} tone={cloudbedsWriteCount?'blue':'default'}/>
      <MetricCard label="Sync state" value={ready?'Ready':authorized?'Review':'Offline'} tone={ready?'green':authorized?'amber':'default'}/>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Cloudbeds connection" description="Live Cloudbeds connection. Housekeeping stays entirely inside SEM PMS; reservation and guest write actions use the permitted Cloudbeds scopes."><div className="space-y-4 p-5">
        <Row label="SEM readiness" value={<StatusBadge status={connectionStatus}/>}/>
        <Row label="Authorized" value={authorized?'Yes':'No'}/>
        <Row label="Environment" value={status?.environment || runtime?.environment || 'sandbox'}/>
        <Row label="Data status" value={status?.dataStatus || 'offline'}/>
        <Row label="Property IDs" value={(status?.connectedPropertyIds||[]).join(', ')||'Not discovered'}/>
        <Row label="Last sync" value={status?.lastSyncAt || 'No successful sync yet'}/>
        <Row label="Auth mode" value={apiKeyMode?'Organization API key':'OAuth / automatic delivery'}/><Row label="Housekeeping" value="SEM PMS local only"/>
        {authorized&&!apiKeyMode&&<button onClick={disconnect} className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700">Disconnect Cloudbeds</button>}
      </div></Panel>

      <Panel title="Operations defaults" description="Technical defaults used across free shuttles, housekeeping and reports."><div className="grid gap-4 p-5 sm:grid-cols-2">
        <Setting label="Free shuttle buffer (minutes)" value={ops['operations.defaultTransferBufferMinutes']} onChange={v=>setOps({...ops,'operations.defaultTransferBufferMinutes':v})} type="number"/>
        <Setting label="Housekeeping priority window (hours)" value={ops['housekeeping.priorityWindowHours']} onChange={v=>setOps({...ops,'housekeeping.priorityWindowHours':v})} type="number"/>
        <Setting label="Default report range (days)" value={ops['reports.defaultRangeDays']} onChange={v=>setOps({...ops,'reports.defaultRangeDays':v})} type="number"/>
        <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Require driver + vehicle</span><select value={ops['operations.requireDriverVehicle']} onChange={e=>setOps({...ops,'operations.requireDriverVehicle':e.target.value})} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <div className="sm:col-span-2 flex items-center justify-end gap-3"><span className={`text-xs ${opsState==='error'?'text-rose-600':'text-emerald-600'}`}>{opsState==='saved'?'Saved':opsState==='error'?'Save failed':''}</span><button onClick={saveOps} disabled={opsState==='saving'} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{opsState==='saving'?'Saving…':'Save developer settings'}</button></div>
      </div></Panel>
    </div>

    <Panel title="Hosthub connection" description="Connection status only. Hosthub credentials are configured in the same protected server environment used for Cloudbeds credentials.">
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <Row label="Status" value={<StatusBadge status={hosthub.configured?'healthy':'not connected'}/>}/>
          <Row label="Environment" value={hosthub.environment}/>
          <Row label="Credential source" value={hosthub.source==='environment'?'Protected server environment':'Not configured'}/>
          <Row label="API URL" value={hosthub.baseUrl}/>
          <Row label="Rentals detected" value={hosthub.rentalCount===null?'Run connection test':String(hosthub.rentalCount)}/>
          <Row label="Last test" value={hosthub.lastSyncAt?formatDateTime(hosthub.lastSyncAt):'No successful test yet'}/>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
            Hosthub credentials are not editable from the PMS UI. They stay with the Cloudbeds credentials in the protected backend environment on the production server.
          </div>
          {(hosthubState.error||hosthubState.message)&&<div className={`rounded-lg border px-3 py-2 text-xs font-semibold ${hosthubState.error?'border-rose-200 bg-rose-50 text-rose-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{hosthubState.error||hosthubState.message}</div>}
          <button type="button" onClick={testHosthub} disabled={!hosthub.configured||hosthubState.testing} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50">{hosthubState.testing?'Testing…':'Test Hosthub connection'}</button>
        </div>
      </div>
    </Panel>

    <Panel title="Cloudbeds permission model" description="Reservation, guest, room-block and item permissions are used by PMS operations. No Cloudbeds housekeeping scope is required.">
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">{requestedScopes.map(scope=>{const missing=missingScopes.includes(scope);const write=String(scope).startsWith('write:');return <div key={scope} className={`rounded-xl border p-4 ${missing?'border-amber-200 bg-amber-50':write?'border-blue-200 bg-blue-50':'border-emerald-200 bg-emerald-50'}`}><div className="font-mono text-xs font-bold text-slate-900">{scope}</div><div className="mt-2 text-[11px] text-slate-600">{missing?'Permission needs attention':write?'Controlled PMS write permission':'Read permission'}</div></div>;})}</div>
    </Panel>

    <Panel title="Cloudbeds write audit" description="Audited Cloudbeds reservation, guest, room assignment, room-block and item write operations." action={<button onClick={loadAudit} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Refresh audit</button>}>
      {auditError&&<div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{auditError}</div>}
      {audit.length?<TableShell><thead><tr><Th>Time</Th><Th>User</Th><Th>Operation</Th><Th>Entity</Th><Th>Status</Th><Th>Request ID</Th></tr></thead><tbody className="divide-y divide-slate-100">{audit.map(item=><tr key={item.id}><Td>{formatDateTime(item.createdAt)}</Td><Td><div className="text-xs font-semibold text-slate-800">{item.actorUserId||'system'}</div><div className="text-[10px] text-slate-400">{item.actorRole||'—'}</div></Td><Td><div className="font-mono text-xs text-slate-700">{item.operation}</div><div className="text-[10px] text-slate-400">{item.endpoint}</div></Td><Td><div className="text-xs font-semibold">{item.entityType}</div><div className="font-mono text-[10px] text-slate-400">{item.externalId||'—'}</div></Td><Td><StatusBadge status={item.status}/>{item.errorMessage&&<div className="mt-1 max-w-56 text-[10px] text-rose-600">{item.errorMessage}</div>}</Td><Td><span className="font-mono text-[10px] text-slate-500">{item.requestId||'—'}</span></Td></tr>)}</tbody></TableShell>:<div className="p-8 text-center text-sm text-slate-500">No Cloudbeds writes recorded yet.</div>}
    </Panel>
  </div>;
};

const Row=({label,value})=><div className="flex items-start justify-between gap-5 border-b border-slate-100 pb-3 last:border-0 last:pb-0"><span className="text-sm text-slate-500">{label}</span><span className="max-w-[65%] break-words text-right text-sm font-semibold text-slate-900">{value}</span></div>;
const Field=({label,value,onChange,type='text',required=false})=><label><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input required={required} type={type} value={value} onChange={e=>onChange(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/></label>;
const Setting=({label,value,onChange,type='text'})=><label><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input type={type} min="0" value={value||''} onChange={e=>onChange(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/></label>;
const formatDateTime=(value)=>{if(!value)return'—';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(d);};

export default SettingsPage;

import React, { useContext, useEffect, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import api from '../services/api';
import {
  MetricCard,
  PageHeader,
  Panel,
  StatusBadge,
} from '../components/PmsUi';

const SettingsPage = () => {
  const {
    reservations,
    customers,
    rooms,
    housekeeping,
    diagnostics,
    status,
    loading,
    error,
    refresh,
    connect,
    reauthorize,
    disconnect,
  } = useContext(CloudbedsDataContext);

  const [runtime, setRuntime] = useState(null);
  const [runtimeError, setRuntimeError] = useState('');

  useEffect(() => {
    let active = true;

    api.get('/integrations/cloudbeds/config')
      .then((response) => {
        if (active) setRuntime(response.data);
      })
      .catch((requestError) => {
        if (active) {
          setRuntimeError(
            requestError.response?.data?.message ||
            requestError.message ||
            'Could not load Cloudbeds runtime configuration.'
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const authorized = Boolean(status?.authorized || status?.connected);
  const connected = Boolean(status?.connected);
  const ready = connected && status?.dataStatus === 'ready';
  const checking = authorized && !status?.dataStatus;
  const missingScopes = diagnostics?.missingScopes || [];
  const propertyIds = status?.connectedPropertyIds || [];
  const requiredScopes = runtime?.requiredScopes || status?.requiredScopes || [];

  const connectionStatus = error
    ? 'error'
    : ready
      ? 'healthy'
      : authorized
        ? 'review'
        : 'not connected';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Cloudbeds connection, credentials, permissions and PMS sync diagnostics."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {loading ? 'Checking…' : 'Test sync'}
            </button>
            {authorized ? (
              <button
                onClick={reauthorize}
                className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Disconnect & re-authorize
              </button>
            ) : (
              <button
                onClick={connect}
                className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Connect Cloudbeds
              </button>
            )}
          </div>
        }
      />

      {(error || runtimeError) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <div className="text-sm font-semibold text-rose-800">Cloudbeds configuration issue</div>
          <div className="mt-1 text-xs text-rose-700">{error || runtimeError}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <MetricCard label="Reservations" value={loading ? '…' : reservations.length} />
        <MetricCard label="Guests" value={loading ? '…' : customers.length} />
        <MetricCard label="Rooms" value={loading ? '…' : rooms.length} />
        <MetricCard label="Housekeeping" value={loading ? '…' : housekeeping.length} />
        <MetricCard
          label="Sync state"
          value={ready ? 'Ready' : checking ? 'Checking' : connected ? 'Review' : 'Offline'}
          tone={ready ? 'green' : connected ? 'amber' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Cloudbeds connection" description="Verified app session and automatic API-key delivery.">
          <div className="space-y-4 p-5">
            <Row label="SEM readiness" value={<StatusBadge status={connectionStatus} />} />
            <Row label="Authorized session" value={authorized ? 'Yes' : 'No'} />
            <Row label="Cloudbeds app state" value={status?.appState || 'unknown'} />
            <Row label="Connection verified" value={status?.connectionVerified ? 'Yes' : 'No'} />
            <Row label="Credential source" value={status?.source || 'None'} />
            <Row label="Environment" value={status?.environment || runtime?.environment || 'sandbox'} />
            <Row label="Data status" value={status?.dataStatus || (authorized ? 'checking' : 'offline')} />
            <Row label="Property IDs" value={propertyIds.join(', ') || 'Not discovered'} />
            <Row label="API target" value={status?.cloudbedsApiBase || diagnostics?.chosenApiBase || runtime?.apiBase || '—'} />
            <Row label="Reservation endpoint" value={status?.cloudbedsReservationEndpoint || diagnostics?.reservationEndpoint || '—'} />
            <Row label="Last sync" value={status?.lastSyncAt || 'No successful sync yet'} />

            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button
                onClick={refresh}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Test live API
              </button>
              {connected && (
                <>
                  <button
                    onClick={reauthorize}
                    className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
                  >
                    Disconnect & re-authorize
                  </button>
                  <button
                    onClick={disconnect}
                    className="rounded-lg border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Runtime configuration" description="Safe server-side Cloudbeds settings. Secrets are never exposed.">
          <div className="space-y-4 p-5">
            <Row label="Automatic delivery" value={runtime?.automaticDelivery ? 'Configured' : 'Missing variables'} />
            <Row label="Sandbox-only lock" value={runtime?.sandboxOnly ? 'Enabled' : 'Disabled'} />
            <Row label="API base" value={runtime?.apiBase || '—'} />
            <Row label="Auth base" value={runtime?.authBase || '—'} />
            <Row label="Redirect URI" value={runtime?.redirectUri || '—'} />
            <Row label="Env API key fallback" value={runtime?.envApiKeyEnabled ? 'Enabled' : 'Disabled'} />
            <Row label="Property allowlist" value={runtime?.propertyAllowlistEnabled ? 'Enabled' : 'Disabled'} />
          </div>
        </Panel>
      </div>

      <Panel title="Required Cloudbeds permissions" description="Scopes needed for the SEM PMS features currently enabled.">
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {requiredScopes.map((scope) => {
            const missing = missingScopes.includes(scope);
            return (
              <div
                key={scope}
                className={[
                  'rounded-xl border p-4',
                  missing
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-emerald-200 bg-emerald-50',
                ].join(' ')}
              >
                <div className={`font-mono text-sm font-semibold ${missing ? 'text-amber-900' : 'text-emerald-900'}`}>
                  {scope}
                </div>
                <div className={`mt-2 text-xs ${missing ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {missing ? 'Not granted by the Cloudbeds property' : 'No scope error detected'}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {authorized && !ready && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="text-sm font-semibold text-amber-900">
            The app session exists, but SEM PMS data is not fully verified.
          </div>
          <div className="mt-2 text-sm leading-6 text-amber-800">
            Reauthorization now performs the Cloudbeds-required disconnect first, terminates the old API session,
            clears the stored key, and only then starts a fresh authorization flow. This prevents the old
            “already connected” loop.
          </div>
        </div>
      )}
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="flex items-start justify-between gap-5 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
    <span className="text-sm text-slate-500">{label}</span>
    <span className="max-w-[65%] break-words text-right text-sm font-semibold text-slate-900">{value}</span>
  </div>
);

export default SettingsPage;

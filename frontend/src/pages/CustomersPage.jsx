import React, { useContext, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import { EmptyState, MetricCard, PageHeader, Panel, TableShell, Td, Th, initials } from '../components/PmsUi';

const CustomersPage = () => {
  const { customers, diagnostics, loading, status, error, refresh, connect } = useContext(CloudbedsDataContext);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((guest) =>
      [guest.name, guest.email, guest.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [customers, search]);

  const repeatGuests = customers.filter((guest) => guest.bookings > 1).length;
  const withContact = customers.filter((guest) => guest.email || guest.phone).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guests"
        description="Guest profiles built from live Cloudbeds reservations."
        actions={
          <button
            onClick={status?.connected ? refresh : connect}
            className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {status?.connected ? 'Refresh Cloudbeds' : 'Connect Cloudbeds'}
          </button>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      {(diagnostics?.missingScopes || []).includes('read:guest') && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Cloudbeds has not granted <strong>Guest READ</strong>. Guest profiles are being reconstructed from reservation data where possible.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Guests" value={loading ? '…' : customers.length} helper="Unique profiles" />
        <MetricCard label="Repeat guests" value={loading ? '…' : repeatGuests} helper="2+ reservations" tone="blue" />
        <MetricCard label="With contact details" value={loading ? '…' : withContact} helper="Email or phone available" tone="green" />
      </div>

      <Panel title="Guest directory" description="Search names and contact details from Cloudbeds.">
        <div className="border-b border-slate-100 p-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search guest, email or phone…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
          />
        </div>

        {filtered.length ? (
          <TableShell>
            <thead>
              <tr>
                <Th>Guest</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                <Th>Reservations</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((guest) => (
                <tr key={guest.id} className="hover:bg-slate-50">
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                        {initials(guest.name)}
                      </div>
                      <div className="font-semibold text-slate-950">{guest.name}</div>
                    </div>
                  </Td>
                  <Td>{guest.email || '—'}</Td>
                  <Td>{guest.phone || '—'}</Td>
                  <Td>{guest.bookings}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState
            title="No guests found"
            description={status?.connected ? 'Try a different search.' : 'Connect Cloudbeds to load guests.'}
          />
        )}
      </Panel>
    </div>
  );
};

export default CustomersPage;

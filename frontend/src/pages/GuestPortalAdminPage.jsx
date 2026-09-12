import React, { useContext, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import { AuthContext } from '../context/AuthContext';
import GuestPortalManager from '../components/GuestPortalManager';
import api from '../services/api';
import { PageHeader } from '../components/PmsUi';

const GuestPortalAdminPage = () => {
  const { reservations } = useContext(CloudbedsDataContext);
  const { user } = useContext(AuthContext);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [instructionResult, setInstructionResult] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reservations.filter((r) => !term || [r.guestName, r.guestEmail, r.id, r.roomNumber, r.property?.name].filter(Boolean).some((v) => String(v).toLowerCase().includes(term)));
  }, [reservations, search]);

  const selected = reservations.find((r) => String(r.id) === String(selectedId)) || filtered[0] || null;

  const sendInstructions = async () => {
    if (!selected) return;
    setSending(true); setSendError(''); setInstructionResult(null);
    try {
      const response = await api.post(`/guest-portal/reservations/${selected.id}/send-instructions`);
      setInstructionResult(response.data.data);
    } catch (error) {
      setSendError(error.response?.data?.message || 'Guest Portal email could not be sent.');
    } finally { setSending(false); }
  };

  const loadCatalog = async () => {
    if (!selected) return;
    const response = await api.get(`/guest-portal/reservations/${selected.id}/manage`);
    setCatalog(response.data.data.catalog || []);
  };

  const saveCatalog = async () => {
    setCatalogSaving(true); setCatalogMessage('');
    try {
      const response = await api.put('/guest-portal/catalog', { items: catalog });
      setCatalog(response.data.data);
      setCatalogMessage('Service catalog saved.');
    } catch (error) {
      setCatalogMessage(error.response?.data?.message || 'Catalog could not be saved.');
    } finally { setCatalogSaving(false); }
  };

  const role = String(user?.role || '').toLowerCase();
  const canEditCatalog = ['admin', 'manager', 'management'].includes(role);

  return (
    <div className="space-y-6">
      <PageHeader title="Guest Portal" description="Manage each guest mini-site, room access, Wi-Fi, stay information, transfers and sellable services." />

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest, reservation or room…" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
          </div>
          <div className="max-h-[72vh] overflow-y-auto p-2">
            {filtered.map((reservation) => (
              <button key={reservation.id} onClick={() => { setSelectedId(String(reservation.id)); setInstructionResult(null); setSendError(''); }} className={`mb-1 w-full rounded-xl p-3 text-left transition ${selected?.id === reservation.id ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50'}`}>
                <div className="text-sm font-bold text-slate-950">{reservation.guestName}</div>
                <div className="mt-1 text-xs text-slate-500">{reservation.property?.name || 'Property'} · Room {reservation.roomNumber || '—'}</div>
                <div className="mt-1 font-mono text-[10px] text-slate-400">{reservation.id}</div>
              </button>
            ))}
            {!filtered.length && <div className="p-6 text-center text-sm text-slate-500">No reservations found.</div>}
          </div>
        </section>

        <div className="space-y-5">
          {selected ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><div className="text-xl font-black text-slate-950">{selected.guestName}</div><div className="mt-1 text-sm text-slate-500">{selected.property?.name || 'Property'} · {selected.arrivalDate} → {selected.departureDate}</div></div>
                  <div className="rounded-xl bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700">Room {selected.roomNumber || 'Unassigned'}</div>
                </div>
              </div>
              <GuestPortalManager reservation={selected} instructionResult={instructionResult} onSend={sendInstructions} sending={sending} sendError={sendError} />
            </>
          ) : <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">Select a reservation.</div>}
        </div>
      </div>

      {canEditCatalog && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="text-base font-black text-slate-950">SEM services catalog</div><div className="mt-1 text-xs text-slate-500">Control what the guest can buy or request before arrival and during the stay.</div></div>
            <button onClick={loadCatalog} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">{catalog ? 'Reload catalog' : 'Load catalog'}</button>
          </div>
          {catalog && <div className="p-5">
            <div className="space-y-3">
              {catalog.map((item, index) => (
                <div key={item.id} className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-[1fr_160px_120px_auto_auto] lg:items-center">
                  <div><div className="text-sm font-bold text-slate-950">{item.name}</div><div className="mt-1 text-xs text-slate-500">{item.description}</div></div>
                  <input value={item.priceLabel || ''} onChange={(e) => setCatalog(catalog.map((x, i) => i === index ? { ...x, priceLabel: e.target.value } : x))} placeholder="Price label" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
                  <select value={item.category} onChange={(e) => setCatalog(catalog.map((x, i) => i === index ? { ...x, category: e.target.value } : x))} className="rounded-lg border border-slate-300 px-2 py-2 text-xs"><option value="mobility">Mobility</option><option value="stay">Stay</option><option value="housekeeping">Housekeeping</option><option value="experience">Experience</option><option value="service">Service</option></select>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={item.availableInstay} onChange={(e) => setCatalog(catalog.map((x, i) => i === index ? { ...x, availableInstay: e.target.checked } : x))} /> In-stay</label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={item.active} onChange={(e) => setCatalog(catalog.map((x, i) => i === index ? { ...x, active: e.target.checked } : x))} /> Active</label>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3"><div className="text-xs text-slate-500">{catalogMessage}</div><button onClick={saveCatalog} disabled={catalogSaving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{catalogSaving ? 'Saving…' : 'Save catalog'}</button></div>
          </div>}
        </section>
      )}
    </div>
  );
};

export default GuestPortalAdminPage;

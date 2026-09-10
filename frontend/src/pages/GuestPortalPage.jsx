import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';

const steps = ['Your stay', 'Arrival & departure', 'Services', 'Review'];

const GuestPortalPage = ({ forceCheckin = false }) => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ guestPhone: '', arrivalTime: '', departureTime: '', arrivalMethod: '', flightNumber: '', specialRequests: '', addonRequests: [], termsAccepted: false });

  const loadPortal = async () => {
    try {
      const response = await api.get(`/guest-portal/${token}`);
      const data = response.data.data;
      setPortal(data);
      setForm((current) => ({ ...current, guestPhone: data.submitted?.guestPhone || data.reservation?.guestPhone || '', arrivalTime: data.submitted?.arrivalTime || data.reservation?.arrivalTime || '', departureTime: data.submitted?.departureTime || data.reservation?.departureTime || '', arrivalMethod: data.submitted?.arrivalMethod || '', flightNumber: data.submitted?.flightNumber || '', specialRequests: data.submitted?.specialRequests || '', addonRequests: data.addonRequests || [], termsAccepted: Boolean(data.submitted?.termsAccepted) }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Guest portal could not be loaded.');
    } finally { setLoading(false); }
  };

  useEffect(() => { let active = true; api.get(`/guest-portal/${token}`).then((response) => { if (!active) return; const data = response.data.data; setPortal(data); setForm((current) => ({ ...current, guestPhone: data.submitted?.guestPhone || data.reservation?.guestPhone || '', arrivalTime: data.submitted?.arrivalTime || data.reservation?.arrivalTime || '', departureTime: data.submitted?.departureTime || data.reservation?.departureTime || '', arrivalMethod: data.submitted?.arrivalMethod || '', flightNumber: data.submitted?.flightNumber || '', specialRequests: data.submitted?.specialRequests || '', addonRequests: data.addonRequests || [], termsAccepted: Boolean(data.submitted?.termsAccepted) })); }).catch((requestError) => active && setError(requestError.response?.data?.message || 'Guest portal could not be loaded.')).finally(() => active && setLoading(false)); return () => { active = false; }; }, [token]);

  const completed = portal?.status === 'completed';
  const showWizard = forceCheckin && !completed;
  const firstName = useMemo(() => String(portal?.reservation?.guestName || 'Guest').split(/\s+/)[0], [portal]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleAddon = (addon) => setForm((current) => ({ ...current, addonRequests: current.addonRequests.some((item) => item.id === addon.id) ? current.addonRequests.filter((item) => item.id !== addon.id) : [...current.addonRequests, addon] }));

  const complete = async () => {
    setSaving(true); setError('');
    try {
      const response = await api.put(`/guest-portal/${token}/check-in`, form);
      setPortal(response.data.data);
      navigate(`/guest/${token}`, { replace: true });
    } catch (requestError) { setError(requestError.response?.data?.message || 'Check-in could not be completed.'); }
    finally { setSaving(false); }
  };

  if (loading) return <PortalFrame><div className="py-20 text-center text-slate-500">Loading your stay…</div></PortalFrame>;
  if (error && !portal) return <PortalFrame><div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">{error}</div></PortalFrame>;

  const reservation = portal.reservation || {};
  return (
    <PortalFrame>
      <Hero firstName={firstName} phase={portal.phase} />
      <StaySummary reservation={reservation} />
      {showWizard ? (
        <CheckinWizard portal={portal} form={form} step={step} setStep={setStep} update={update} toggleAddon={toggleAddon} complete={complete} saving={saving} error={error} />
      ) : (
        <GuestHome portal={portal} token={token} reload={loadPortal} />
      )}
    </PortalFrame>
  );
};

const Hero = ({ firstName, phase }) => (
  <section className="overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-xl">
    <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-6 py-9 sm:px-9">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="text-xs font-bold uppercase tracking-[0.22em] text-blue-300">SEM Guest Experience</div><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-200">{phase === 'stay' ? 'Your stay hub' : 'Pre-arrival'}</span></div>
      <h1 className="mt-4 text-3xl font-black sm:text-4xl">Welcome {firstName}!</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Your private SEM mini-site for check-in, room access, Wi-Fi, transfers, services and everything you need during your stay.</p>
    </div>
  </section>
);

const StaySummary = ({ reservation }) => (
  <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xl font-black text-slate-950">{reservation.propertyName}</div><div className="mt-1 text-sm text-slate-500">{reservation.propertyCity || 'SEM property'}{reservation.roomNumber ? ` · Room ${reservation.roomNumber}` : ''}</div></div><div className="grid grid-cols-2 gap-3 text-sm"><StayDate label="Check-in" value={reservation.arrivalDate} /><StayDate label="Check-out" value={reservation.departureDate} /></div></div>
  </section>
);

const CheckinWizard = ({ portal, form, step, setStep, update, toggleAddon, complete, saving, error }) => {
  const reservation = portal.reservation || {};
  return <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div className="mb-7 grid grid-cols-4 gap-2">{steps.map((label, index) => <div key={label}><div className={`h-1.5 rounded-full ${index <= step ? 'bg-blue-600' : 'bg-slate-200'}`} /><div className={`mt-2 hidden text-[11px] font-bold sm:block ${index === step ? 'text-blue-700' : 'text-slate-400'}`}>{label}</div></div>)}</div>
    {step === 0 && <div className="space-y-5"><SectionTitle title="Your stay" subtitle="Confirm your contact information." /><ReadOnlyField label="Guest" value={reservation.guestName} /><ReadOnlyField label="Email" value={reservation.guestEmail || 'Not provided'} /><Field label="Mobile phone" value={form.guestPhone} onChange={(v) => update('guestPhone', v)} placeholder="+30…" /><ReadOnlyField label="Room" value={[reservation.roomNumber, reservation.roomType].filter(Boolean).join(' · ')} /></div>}
    {step === 1 && <div className="space-y-5"><SectionTitle title="Arrival & departure" subtitle="Help SEM prepare the property and your arrival." /><div className="grid gap-4 sm:grid-cols-2"><Field type="time" label="Expected check-in time" value={form.arrivalTime} onChange={(v) => update('arrivalTime', v)} /><Field type="time" label="Expected check-out time" value={form.departureTime} onChange={(v) => update('departureTime', v)} /></div><label className="block"><span className="text-sm font-bold text-slate-800">How are you arriving?</span><select value={form.arrivalMethod} onChange={(e) => update('arrivalMethod', e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500"><option value="">Select</option><option value="car">Car</option><option value="taxi">Taxi</option><option value="airport-transfer">Airport transfer</option><option value="public-transport">Public transport</option><option value="other">Other</option></select></label><Field label="Flight number (optional)" value={form.flightNumber} onChange={(v) => update('flightNumber', v)} placeholder="A3 123" /><label className="block"><span className="text-sm font-bold text-slate-800">Special requests</span><textarea value={form.specialRequests} onChange={(e) => update('specialRequests', e.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="Anything SEM should know?" /></label></div>}
    {step === 2 && <div><SectionTitle title="Enhance your stay" subtitle="Add services now. You can request more later from your Guest Portal." /><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{(portal.addons || []).map((addon) => { const selected = form.addonRequests.some((item) => item.id === addon.id); return <button key={addon.id} type="button" onClick={() => toggleAddon(addon)} className={`rounded-2xl border p-4 text-left transition ${selected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300'}`}><CategoryPill category={addon.category} /><div className="mt-3 text-base font-black text-slate-950">{addon.name}</div><div className="mt-2 min-h-10 text-xs leading-5 text-slate-500">{addon.description}</div><div className="mt-4 flex items-center justify-between"><span className="text-sm font-bold text-slate-800">{addon.priceLabel}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{selected ? 'Selected' : 'Add'}</span></div></button>; })}</div></div>}
    {step === 3 && <div className="space-y-5"><SectionTitle title="Review & complete" subtitle="Confirm your details. Your portal remains available throughout the stay." /><div className="grid gap-3 sm:grid-cols-2"><Summary label="Expected arrival" value={form.arrivalTime || 'Required'} /><Summary label="Expected departure" value={form.departureTime || 'Required'} /><Summary label="Arrival method" value={form.arrivalMethod || 'Not specified'} /><Summary label="Services" value={form.addonRequests.length ? form.addonRequests.map((item) => item.name).join(', ') : 'None'} /></div><label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><input type="checkbox" checked={form.termsAccepted} onChange={(e) => update('termsAccepted', e.target.checked)} className="mt-1 h-4 w-4" /><span className="text-sm leading-6 text-slate-600">I confirm that the information is correct and I accept the property house rules and guest terms.</span></label></div>}
    {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-5"><button type="button" onClick={() => setStep((v) => Math.max(0, v - 1))} disabled={step === 0} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-30">Back</button>{step < steps.length - 1 ? <button type="button" onClick={() => setStep((v) => Math.min(steps.length - 1, v + 1))} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Continue</button> : <button type="button" onClick={complete} disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Completing…' : 'Complete check-in'}</button>}</div>
  </section>;
};

const GuestHome = ({ portal, token, reload }) => {
  const [tab, setTab] = useState('home');
  const [notice, setNotice] = useState('');
  const [requesting, setRequesting] = useState(null);
  const reservation = portal.reservation || {};
  const stay = portal.stayInfo || {};
  const checkedIn = portal.status === 'completed';

  return <>
    <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-lg font-black text-slate-950">Your SEM Guest Portal</div><div className="mt-1 text-sm text-slate-500">Keep this private link available for the whole stay.</div></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ${checkedIn ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{checkedIn ? 'Online check-in complete' : 'Check-in pending'}</span></div>
      {!checkedIn && <a href={`/guest/${token}/check-in`} className="mt-4 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Complete online check-in</a>}
      <div className="mt-5 flex gap-2 overflow-x-auto border-t border-slate-100 pt-4">{[['home','Stay'],['services','Services'],['transfers','Transfers'],['requests','My requests']].map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold ${tab === id ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div>
    </section>

    {notice && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}
    {tab === 'home' && <StayTab stay={stay} portal={portal} />}
    {tab === 'services' && <ServicesTab services={portal.services || []} requesting={requesting} setRequesting={setRequesting} token={token} reload={reload} setNotice={setNotice} />}
    {tab === 'transfers' && <TransfersTab token={token} reservation={reservation} transfers={portal.transfers || []} reload={reload} setNotice={setNotice} />}
    {tab === 'requests' && <RequestsTab requests={portal.serviceRequests || []} transfers={portal.transfers || []} />}
  </>;
};

const StayTab = ({ stay, portal }) => <>
  {!stay.accessReleased && <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="text-sm font-black text-amber-900">Access details are not released yet</div><div className="mt-1 text-xs leading-5 text-amber-700">SEM will release the room/building codes and Wi-Fi information when the property is ready for your arrival.</div></section>}
  <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <InfoCard icon="🔑" title="Room access" value={stay.accessReleased ? stay.roomAccessCode || 'Contact SEM' : 'Available when property is ready'} highlight={stay.accessReleased && stay.roomAccessCode} />
    <InfoCard icon="🏢" title="Building access" value={stay.accessReleased ? stay.buildingAccessCode || 'Not required' : 'Locked until released'} />
    <InfoCard icon="📶" title="Wi-Fi" value={stay.accessReleased ? [stay.wifiName, stay.wifiPassword].filter(Boolean).join(' · Password: ') || 'Contact SEM' : 'Locked until released'} />
    <InfoCard icon="📍" title="Property address" value={stay.propertyAddress || 'See your reservation details'} />
    <InfoCard icon="☎️" title="SEM assistance" value={stay.supportPhone || 'Contact the SEM team for assistance'} />
    <InfoCard icon="🆘" title="Emergency contact" value={stay.emergencyContact || 'Contact SEM if you need urgent property assistance'} />
  </section>
  <section className="mt-5 grid gap-4 lg:grid-cols-2">
    <TextCard title="Self check-in instructions" text={stay.accessReleased ? stay.checkinInstructions : 'Instructions will be displayed when SEM releases property access.'} />
    <TextCard title="Check-out instructions" text={stay.checkoutInstructions || `Expected departure: ${portal.submitted?.departureTime || portal.reservation?.departureTime || 'not provided'}.`} />
    <TextCard title="Parking" text={stay.parkingInfo || 'Contact SEM if you need parking information for this property.'} />
    <TextCard title="Hot water & property operation" text={stay.hotWaterInfo || 'Property-specific operating information will appear here when applicable.'} />
  </section>
  {stay.usefulInfo && <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="text-lg font-black text-slate-950">Good to know</div><div className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{stay.usefulInfo}</div></section>}
</>;

const ServicesTab = ({ services, requesting, setRequesting, token, reload, setNotice }) => {
  const categories = [...new Set(services.map((s) => s.category))];
  return <div className="mt-5 space-y-6">{categories.map((category) => <section key={category}><div className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{category}</div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{services.filter((s) => s.category === category).map((service) => <ServiceCard key={service.id} service={service} onClick={() => setRequesting(service)} />)}</div></section>)}{!services.length && <Empty text="No services are available at the moment." />}{requesting && <RequestModal service={requesting} onClose={() => setRequesting(null)} onSubmit={async (payload) => { await api.post(`/guest-portal/${token}/service-requests`, { serviceId: requesting.id, ...payload }); setRequesting(null); setNotice(`${requesting.name} request sent to SEM.`); await reload(); }} />}</div>;
};

const TransfersTab = ({ token, reservation, transfers, reload, setNotice }) => {
  const [form, setForm] = useState({ transferType: 'airport_pickup', pickupLocation: '', destination: '', scheduledAt: '', passengers: 1, luggage: 0, flightInfo: '', notes: '' });
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const submit = async () => { setSaving(true); setError(''); try { await api.post(`/guest-portal/${token}/transfers`, form); setNotice('Transfer request sent to SEM. The team can now assign the driver and vehicle.'); setForm({ transferType: 'airport_pickup', pickupLocation: '', destination: '', scheduledAt: '', passengers: 1, luggage: 0, flightInfo: '', notes: '' }); await reload(); } catch (e) { setError(e.response?.data?.message || 'Transfer request could not be sent.'); } finally { setSaving(false); } };
  return <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]"><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><SectionTitle title="Book a transfer" subtitle="Request airport, port or custom transportation directly from SEM." /><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="block"><span className="text-sm font-bold text-slate-800">Transfer type</span><select value={form.transferType} onChange={(e) => setForm({ ...form, transferType: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"><option value="airport_pickup">Airport pickup</option><option value="airport_dropoff">Airport drop-off</option><option value="port_pickup">Port pickup</option><option value="port_dropoff">Port drop-off</option><option value="private_route">Private route</option></select></label><Field type="datetime-local" label="Date & time" value={form.scheduledAt} onChange={(v) => setForm({ ...form, scheduledAt: v })} /><Field label="Pickup location" value={form.pickupLocation} onChange={(v) => setForm({ ...form, pickupLocation: v })} placeholder="Airport, port, hotel or address" /><Field label="Destination" value={form.destination} onChange={(v) => setForm({ ...form, destination: v })} placeholder={reservation.propertyName || 'Destination'} /><Field type="number" label="Passengers" value={form.passengers} onChange={(v) => setForm({ ...form, passengers: v })} /><Field type="number" label="Luggage" value={form.luggage} onChange={(v) => setForm({ ...form, luggage: v })} /><Field label="Flight / ferry number" value={form.flightInfo} onChange={(v) => setForm({ ...form, flightInfo: v })} placeholder="Optional" /></div><label className="mt-4 block"><span className="text-sm font-bold text-slate-800">Notes</span><textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" /></label>{error && <div className="mt-3 text-sm text-rose-700">{error}</div>}<button onClick={submit} disabled={saving} className="mt-5 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Sending request…' : 'Request transfer'}</button></section><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-lg font-black text-slate-950">Your transfers</div><div className="mt-4 space-y-3">{transfers.map((t) => <div key={t.id} className="rounded-xl border border-slate-200 p-3"><div className="text-sm font-bold text-slate-900">{t.pickupLocation} → {t.destination}</div><div className="mt-1 text-xs text-slate-500">{new Date(t.scheduledAt).toLocaleString()}</div><div className="mt-2 flex items-center justify-between"><Status status={t.status} /><div className="text-xs text-slate-500">{t.driver ? `${t.driver}${t.vehicle ? ` · ${t.vehicle}` : ''}` : 'Driver pending'}</div></div></div>)}{!transfers.length && <div className="text-sm text-slate-500">No transfer requests yet.</div>}</div></section></div>;
};

const RequestsTab = ({ requests, transfers }) => <div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-lg font-black text-slate-950">Services</div><div className="mt-4 space-y-3">{requests.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-slate-900">{item.serviceName}</div><div className="mt-1 text-xs text-slate-500">{item.requestedFor ? new Date(item.requestedFor).toLocaleString() : 'Requested from portal'}{item.guestNotes ? ` · ${item.guestNotes}` : ''}</div></div><Status status={item.status} /></div></div>)}{!requests.length && <div className="text-sm text-slate-500">No service requests yet.</div>}</div></section><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-lg font-black text-slate-950">Transfers</div><div className="mt-4 space-y-3">{transfers.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-slate-900">{item.pickupLocation} → {item.destination}</div><div className="mt-1 text-xs text-slate-500">{new Date(item.scheduledAt).toLocaleString()}</div></div><Status status={item.status} /></div></div>)}{!transfers.length && <div className="text-sm text-slate-500">No transfers yet.</div>}</div></section></div>;

const RequestModal = ({ service, onClose, onSubmit }) => {
  const [form, setForm] = useState({ quantity: 1, requestedFor: '', guestNotes: '' }); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const submit = async () => { setSaving(true); setError(''); try { await onSubmit(form); } catch (e) { setError(e.response?.data?.message || 'Request could not be sent.'); setSaving(false); } };
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 sm:items-center"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><CategoryPill category={service.category} /><div className="mt-3 text-2xl font-black text-slate-950">{service.name}</div><div className="mt-2 text-sm leading-6 text-slate-500">{service.description}</div><div className="mt-2 text-sm font-bold text-blue-700">{service.priceLabel}</div></div><button onClick={onClose} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-600">×</button></div><div className="mt-5 space-y-4"><Field type="number" label="Quantity" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} />{service.requiresSchedule && <Field type="datetime-local" label="Preferred date & time" value={form.requestedFor} onChange={(v) => setForm({ ...form, requestedFor: v })} />}<label className="block"><span className="text-sm font-bold text-slate-800">Notes</span><textarea rows={3} value={form.guestNotes} onChange={(e) => setForm({ ...form, guestNotes: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="Preferences or details for SEM" /></label></div>{error && <div className="mt-3 text-sm text-rose-700">{error}</div>}<div className="mt-6 flex gap-3"><button onClick={onClose} className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">Cancel</button><button onClick={submit} disabled={saving} className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Sending…' : 'Send request'}</button></div></div></div>;
};

const PortalFrame = ({ children }) => <div className="min-h-screen bg-slate-100 px-4 py-5 sm:px-6 sm:py-9"><main className="mx-auto w-full max-w-6xl">{children}</main><footer className="mx-auto mt-8 max-w-6xl pb-5 text-center text-xs text-slate-400">Powered by SEM Estate & Mobility</footer></div>;
const SectionTitle = ({ title, subtitle }) => <div><h2 className="text-2xl font-black text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>;
const StayDate = ({ label, value }) => <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 font-black text-slate-900">{value || '—'}</div></div>;
const ReadOnlyField = ({ label, value }) => <div><div className="text-sm font-bold text-slate-800">{label}</div><div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{value || '—'}</div></div>;
const Field = ({ label, value, onChange, placeholder, type = 'text' }) => <label className="block"><span className="text-sm font-bold text-slate-800">{label}</span><input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500" /></label>;
const Summary = ({ label, value }) => <div className="rounded-2xl border border-slate-200 p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-sm font-bold text-slate-900">{value}</div></div>;
const CategoryPill = ({ category }) => <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">{category || 'service'}</span>;
const InfoCard = ({ icon, title, value, highlight }) => <div className={`rounded-2xl border bg-white p-5 shadow-sm ${highlight ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-200'}`}><div className="text-2xl">{icon}</div><div className="mt-3 text-xs font-black uppercase tracking-wide text-slate-400">{title}</div><div className="mt-2 break-words text-sm font-bold leading-6 text-slate-900">{value}</div></div>;
const TextCard = ({ title, text }) => <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm font-black text-slate-950">{title}</div><div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{text}</div></div>;
const ServiceCard = ({ service, onClick }) => <button onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"><CategoryPill category={service.category} /><div className="mt-3 text-lg font-black text-slate-950">{service.name}</div><div className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{service.description}</div><div className="mt-4 flex items-center justify-between"><span className="text-sm font-black text-blue-700">{service.priceLabel}</span><span className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">Request</span></div></button>;
const Status = ({ status }) => { const s = String(status || 'requested'); const good = ['confirmed','completed'].includes(s); const bad = ['declined','cancelled'].includes(s); return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${good ? 'bg-emerald-100 text-emerald-700' : bad ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{s.replaceAll('_',' ')}</span>; };
const Empty = ({ text }) => <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{text}</div>;

export default GuestPortalPage;

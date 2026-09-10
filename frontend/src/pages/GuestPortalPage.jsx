import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';

const steps = ['Your stay', 'Arrival', 'Services', 'Review'];
const tabs = [
  ['home', 'Your stay', 'home'],
  ['services', 'Services', 'sparkles'],
  ['transfers', 'Transfers', 'car'],
  ['requests', 'Requests', 'clock'],
];

const GuestPortalPage = ({ forceCheckin = false }) => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    guestPhone: '', arrivalTime: '', departureTime: '', arrivalMethod: '', flightNumber: '',
    specialRequests: '', addonRequests: [], termsAccepted: false,
  });

  const hydrate = (data) => {
    setPortal(data);
    setForm((current) => ({
      ...current,
      guestPhone: data.submitted?.guestPhone || data.reservation?.guestPhone || '',
      arrivalTime: data.submitted?.arrivalTime || data.reservation?.arrivalTime || '',
      departureTime: data.submitted?.departureTime || data.reservation?.departureTime || '',
      arrivalMethod: data.submitted?.arrivalMethod || '',
      flightNumber: data.submitted?.flightNumber || '',
      specialRequests: data.submitted?.specialRequests || '',
      addonRequests: data.addonRequests || [],
      termsAccepted: Boolean(data.submitted?.termsAccepted),
    }));
  };

  const loadPortal = async () => {
    try {
      const response = await api.get(`/guest-portal/${token}`);
      hydrate(response.data.data);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Your private stay portal could not be loaded.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    api.get(`/guest-portal/${token}`)
      .then((response) => active && hydrate(response.data.data))
      .catch((requestError) => active && setError(requestError.response?.data?.message || 'Your private stay portal could not be loaded.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  const firstName = useMemo(() => String(portal?.reservation?.guestName || 'Guest').trim().split(/\s+/)[0], [portal]);
  const completed = portal?.status === 'completed';
  const showWizard = forceCheckin && !completed;
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleAddon = (addon) => setForm((current) => ({
    ...current,
    addonRequests: current.addonRequests.some((item) => item.id === addon.id)
      ? current.addonRequests.filter((item) => item.id !== addon.id)
      : [...current.addonRequests, addon],
  }));

  const complete = async () => {
    setSaving(true); setError('');
    try {
      const response = await api.put(`/guest-portal/${token}/check-in`, form);
      hydrate(response.data.data);
      navigate(`/guest/${token}`, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Online check-in could not be completed.');
    } finally { setSaving(false); }
  };

  if (loading) return <PortalFrame><LoadingScreen /></PortalFrame>;
  if (error && !portal) return <PortalFrame><ErrorScreen message={error} /></PortalFrame>;

  return (
    <PortalFrame>
      <LuxuryHero firstName={firstName} portal={portal} />
      {showWizard ? (
        <CheckinWizard portal={portal} form={form} step={step} setStep={setStep} update={update} toggleAddon={toggleAddon} complete={complete} saving={saving} error={error} />
      ) : (
        <GuestHome portal={portal} token={token} reload={loadPortal} />
      )}
    </PortalFrame>
  );
};

const LuxuryHero = ({ firstName, portal }) => {
  const reservation = portal?.reservation || {};
  const submitted = portal?.submitted || {};
  return (
    <header className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#11110f] text-white shadow-[0_30px_90px_rgba(25,20,12,0.22)]">
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#a98b5f]/20 blur-3xl" />
      <div className="absolute -bottom-28 left-1/4 h-72 w-72 rounded-full bg-[#6c7f89]/10 blur-3xl" />
      <div className="relative px-6 py-7 sm:px-9 sm:py-9 lg:px-12 lg:py-11">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d4bc96]/35 bg-white/[0.04] text-sm font-black tracking-[0.18em] text-[#d9c4a3]">S</div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#d9c4a3]">SEM Guest Experience</div>
              <div className="mt-1 text-xs text-white/45">Private stay portal</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/65">
            <span className={`h-1.5 w-1.5 rounded-full ${portal?.status === 'completed' ? 'bg-emerald-400' : 'bg-[#d9c4a3]'}`} />
            {portal?.status === 'completed' ? 'Stay ready' : 'Pre-arrival'}
          </div>
        </div>

        <div className="mt-12 max-w-3xl sm:mt-16">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-white/40">Welcome to your stay</div>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-6xl lg:text-7xl">Hello, {firstName}.</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/58 sm:text-base">Everything for your stay in one private place: access, Wi-Fi, arrival details, transfers, concierge services and support from SEM.</p>
        </div>

        <div className="mt-10 grid gap-px overflow-hidden rounded-[24px] border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          <HeroMetric label="Property" value={reservation.propertyName || 'SEM Property'} icon="home" />
          <HeroMetric label="Arrival" value={formatStayValue(reservation.arrivalDate, submitted.arrivalTime)} icon="arrival" />
          <HeroMetric label="Departure" value={formatStayValue(reservation.departureDate, submitted.departureTime)} icon="departure" />
          <HeroMetric label="Suite / room" value={reservation.roomNumber ? `Room ${reservation.roomNumber}` : reservation.roomType || 'To be assigned'} icon="key" />
        </div>
      </div>
    </header>
  );
};

const CheckinWizard = ({ portal, form, step, setStep, update, toggleAddon, complete, saving, error }) => {
  const reservation = portal.reservation || {};
  return (
    <section className="mt-6 overflow-hidden rounded-[30px] border border-[#ded5c7] bg-[#fffdf9] shadow-[0_18px_55px_rgba(38,31,22,0.08)]">
      <div className="border-b border-[#ebe4d9] px-5 py-5 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#9a815d]">Online check-in</div>
            <div className="mt-1 text-sm text-[#686158]">A few details so we can prepare everything for your arrival.</div>
          </div>
          <div className="text-xs font-bold text-[#8f826f]">{step + 1} / {steps.length}</div>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2">
          {steps.map((label, index) => <div key={label}><div className={`h-1 rounded-full ${index <= step ? 'bg-[#9e8057]' : 'bg-[#e6ded2]'}`} /><div className={`mt-2 hidden text-[10px] font-bold uppercase tracking-[0.08em] sm:block ${index === step ? 'text-[#6d5638]' : 'text-[#aaa094]'}`}>{label}</div></div>)}
        </div>
      </div>

      <div className="px-5 py-7 sm:px-8 sm:py-9">
        {step === 0 && (
          <div className="space-y-5">
            <SectionHeading eyebrow="01" title="Your stay" subtitle="Confirm your reservation and contact details." />
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadOnlyField label="Guest" value={reservation.guestName} />
              <ReadOnlyField label="Email" value={reservation.guestEmail || 'Not provided'} />
              <Field label="Mobile phone" value={form.guestPhone} onChange={(v) => update('guestPhone', v)} placeholder="+30…" />
              <ReadOnlyField label="Room" value={[reservation.roomNumber, reservation.roomType].filter(Boolean).join(' · ') || 'To be assigned'} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <SectionHeading eyebrow="02" title="Arrival & departure" subtitle="Tell us when and how you expect to arrive and leave." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field type="time" label="Expected arrival time" value={form.arrivalTime} onChange={(v) => update('arrivalTime', v)} />
              <Field type="time" label="Expected departure time" value={form.departureTime} onChange={(v) => update('departureTime', v)} />
            </div>
            <label className="block"><FieldLabel>How are you arriving?</FieldLabel><select value={form.arrivalMethod} onChange={(e) => update('arrivalMethod', e.target.value)} className={inputClass}><option value="">Select arrival method</option><option value="car">Car</option><option value="taxi">Taxi</option><option value="airport-transfer">Airport transfer</option><option value="public-transport">Public transport</option><option value="other">Other</option></select></label>
            <Field label="Flight / ferry number" value={form.flightNumber} onChange={(v) => update('flightNumber', v)} placeholder="Optional" />
            <label className="block"><FieldLabel>Anything we should know?</FieldLabel><textarea value={form.specialRequests} onChange={(e) => update('specialRequests', e.target.value)} rows={4} className={inputClass} placeholder="Special requests, arrival notes or preferences" /></label>
          </div>
        )}

        {step === 2 && (
          <div>
            <SectionHeading eyebrow="03" title="Make the stay yours" subtitle="Add services now. You can request more at any time from this portal." />
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(portal.addons || []).map((addon) => {
                const selected = form.addonRequests.some((item) => item.id === addon.id);
                return <button key={addon.id} type="button" onClick={() => toggleAddon(addon)} className={`group rounded-[22px] border p-5 text-left transition ${selected ? 'border-[#a4865e] bg-[#f7f0e5] shadow-[0_12px_30px_rgba(120,91,51,0.10)]' : 'border-[#e4ddd3] bg-white hover:-translate-y-0.5 hover:border-[#bba88d] hover:shadow-lg'}`}>
                  <div className="flex items-center justify-between gap-3"><CategoryPill category={addon.category} /><div className={`flex h-8 w-8 items-center justify-center rounded-full ${selected ? 'bg-[#171612] text-white' : 'bg-[#f1ede6] text-[#807563]'}`}><Icon name={selected ? 'check' : 'plus'} className="h-4 w-4" /></div></div>
                  <div className="mt-5 text-base font-black tracking-[-0.02em] text-[#171612]">{addon.name}</div>
                  <div className="mt-2 min-h-12 text-xs leading-6 text-[#7a7369]">{addon.description}</div>
                  <div className="mt-5 text-sm font-black text-[#70583a]">{addon.priceLabel}</div>
                </button>;
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <SectionHeading eyebrow="04" title="Everything looks good" subtitle="Review your details and complete online check-in." />
            <div className="grid gap-3 sm:grid-cols-2">
              <ReviewCard label="Arrival" value={form.arrivalTime || 'Required'} icon="arrival" />
              <ReviewCard label="Departure" value={form.departureTime || 'Required'} icon="departure" />
              <ReviewCard label="Arrival method" value={prettyMethod(form.arrivalMethod)} icon="car" />
              <ReviewCard label="Services" value={form.addonRequests.length ? form.addonRequests.map((item) => item.name).join(', ') : 'None selected'} icon="sparkles" />
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-[20px] border border-[#e2dbd1] bg-[#f8f5ef] p-4"><input type="checkbox" checked={form.termsAccepted} onChange={(e) => update('termsAccepted', e.target.checked)} className="mt-1 h-4 w-4 accent-[#171612]" /><span className="text-sm leading-6 text-[#6d665d]">I confirm the information above and accept the property house rules and guest terms.</span></label>
          </div>
        )}

        {error && <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        <div className="mt-8 flex items-center justify-between gap-3 border-t border-[#ece5dc] pt-5">
          <button type="button" onClick={() => setStep((v) => Math.max(0, v - 1))} disabled={step === 0} className="rounded-full border border-[#d9d0c4] bg-white px-5 py-3 text-sm font-bold text-[#595248] disabled:opacity-30">Back</button>
          {step < steps.length - 1
            ? <button type="button" onClick={() => setStep((v) => Math.min(steps.length - 1, v + 1))} className="flex items-center gap-2 rounded-full bg-[#171612] px-6 py-3 text-sm font-bold text-white shadow-lg hover:bg-black">Continue <Icon name="arrow" className="h-4 w-4" /></button>
            : <button type="button" onClick={complete} disabled={saving} className="flex items-center gap-2 rounded-full bg-[#171612] px-6 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50">{saving ? 'Completing…' : 'Complete check-in'} <Icon name="check" className="h-4 w-4" /></button>}
        </div>
      </div>
    </section>
  );
};

const GuestHome = ({ portal, token, reload }) => {
  const [tab, setTab] = useState('home');
  const [notice, setNotice] = useState('');
  const [requesting, setRequesting] = useState(null);
  const checkedIn = portal.status === 'completed';

  return (
    <>
      <section className="sticky top-3 z-30 mt-5 rounded-[24px] border border-[#ddd4c6]/90 bg-[#fffdf9]/95 p-2 shadow-[0_12px_38px_rgba(45,36,25,0.10)] backdrop-blur-xl">
        <div className="flex items-center gap-2 overflow-x-auto">
          {tabs.map(([id, label, icon]) => <button key={id} onClick={() => setTab(id)} className={`flex min-w-fit flex-1 items-center justify-center gap-2 rounded-[18px] px-4 py-3 text-xs font-bold transition ${tab === id ? 'bg-[#171612] text-white shadow-md' : 'text-[#756c60] hover:bg-[#f2ede5]'}`}><Icon name={icon} className="h-4 w-4" />{label}</button>)}
        </div>
      </section>

      {!checkedIn && (
        <section className="mt-5 flex flex-col gap-4 rounded-[26px] border border-[#cdb995] bg-[#f7efe1] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="text-sm font-black text-[#3f3325]">Complete your online check-in</div><div className="mt-1 text-xs leading-5 text-[#75654f]">Add your arrival and departure time so SEM can prepare your stay.</div></div>
          <a href={`/guest/${token}/check-in`} className="flex items-center justify-center gap-2 rounded-full bg-[#171612] px-5 py-3 text-sm font-bold text-white">Continue check-in <Icon name="arrow" className="h-4 w-4" /></a>
        </section>
      )}

      {notice && <div className="mt-5 rounded-[20px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800">{notice}</div>}
      {tab === 'home' && <StayTab portal={portal} />}
      {tab === 'services' && <ServicesTab services={portal.services || []} requesting={requesting} setRequesting={setRequesting} token={token} reload={reload} setNotice={setNotice} />}
      {tab === 'transfers' && <TransfersTab token={token} reservation={portal.reservation || {}} transfers={portal.transfers || []} reload={reload} setNotice={setNotice} />}
      {tab === 'requests' && <RequestsTab requests={portal.serviceRequests || []} transfers={portal.transfers || []} />}
    </>
  );
};

const StayTab = ({ portal }) => {
  const stay = portal.stayInfo || {};
  const submitted = portal.submitted || {};
  return (
    <div className="mt-6 space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-[30px] border border-[#ded6cb] bg-[#fffdf9] p-6 shadow-[0_14px_45px_rgba(38,31,22,0.06)] sm:p-8">
          <div className="flex items-start justify-between gap-4"><SectionHeading eyebrow="Your stay" title="Arrival at a glance" subtitle="The essentials for a smooth arrival and departure." compact /><Icon name="arrival" className="h-7 w-7 text-[#9e8057]" /></div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <PremiumMetric label="Expected arrival" value={submitted.arrivalTime || portal.reservation?.arrivalTime || 'Not provided'} />
            <PremiumMetric label="Expected departure" value={submitted.departureTime || portal.reservation?.departureTime || 'Not provided'} />
            <PremiumMetric label="Arrival method" value={prettyMethod(submitted.arrivalMethod)} />
            <PremiumMetric label="Flight / ferry" value={submitted.flightNumber || 'Not provided'} />
          </div>
        </div>
        <div className="rounded-[30px] bg-[#171612] p-6 text-white shadow-[0_18px_55px_rgba(20,17,13,0.20)] sm:p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[#d9c4a3]"><Icon name="concierge" className="h-5 w-5" /></div>
          <div className="mt-6 text-[10px] font-bold uppercase tracking-[0.24em] text-[#c8ad83]">SEM assistance</div>
          <div className="mt-2 text-2xl font-black tracking-[-0.03em]">Need anything?</div>
          <p className="mt-3 text-sm leading-7 text-white/55">From transfers and local arrangements to help with the property, the SEM team is available throughout your stay.</p>
          <div className="mt-6 rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white/85">{stay.supportPhone || stay.emergencyContact || 'Contact the SEM team for assistance'}</div>
        </div>
      </section>

      {!stay.accessReleased && <section className="flex items-start gap-4 rounded-[24px] border border-[#d7c39f] bg-[#f6efe3] p-5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1a1916] text-[#dec7a2]"><Icon name="lock" className="h-4 w-4" /></div><div><div className="text-sm font-black text-[#3d3225]">Access details will appear here when the property is ready</div><div className="mt-1 text-xs leading-6 text-[#786954]">SEM controls the release of private room codes, building access and Wi-Fi credentials for your reservation.</div></div></section>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <LuxuryInfoCard icon="key" label="Room access" value={stay.accessReleased ? stay.roomAccessCode || 'Contact SEM' : 'Waiting for release'} secret />
        <LuxuryInfoCard icon="building" label="Building access" value={stay.accessReleased ? stay.buildingAccessCode || 'Not required' : 'Waiting for release'} secret />
        <LuxuryInfoCard icon="wifi" label="Wi-Fi" value={stay.accessReleased ? formatWifi(stay) : 'Waiting for release'} secret />
        <LuxuryInfoCard icon="location" label="Property address" value={stay.propertyAddress || portal.reservation?.propertyName || 'Property details'} />
        <LuxuryInfoCard icon="phone" label="SEM support" value={stay.supportPhone || 'Available through SEM'} />
        <LuxuryInfoCard icon="shield" label="Emergency" value={stay.emergencyContact || 'Contact SEM for urgent property assistance'} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <LuxuryTextCard icon="arrival" title="Self check-in" text={stay.accessReleased ? stay.checkinInstructions || 'Your access details are ready. Contact SEM if you need assistance.' : 'Instructions become visible when access is released by SEM.'} />
        <LuxuryTextCard icon="departure" title="Check-out" text={stay.checkoutInstructions || `Expected departure time: ${submitted.departureTime || portal.reservation?.departureTime || 'not provided'}.`} />
        <LuxuryTextCard icon="car" title="Parking" text={stay.parkingInfo || 'Contact SEM if you need parking information for this property.'} />
        <LuxuryTextCard icon="home" title="Property information" text={stay.hotWaterInfo || 'Property-specific operating information will appear here when applicable.'} />
      </section>

      {stay.usefulInfo && <section className="rounded-[30px] border border-[#ded6cb] bg-[#fffdf9] p-6 shadow-[0_14px_45px_rgba(38,31,22,0.05)] sm:p-8"><div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#9e8057]">Good to know</div><div className="mt-4 whitespace-pre-line text-sm leading-7 text-[#645e55]">{stay.usefulInfo}</div></section>}
    </div>
  );
};

const ServicesTab = ({ services, requesting, setRequesting, token, reload, setNotice }) => {
  const categories = [...new Set(services.map((service) => service.category))];
  return (
    <div className="mt-7 space-y-8">
      <SectionHeading eyebrow="Concierge" title="Curated for your stay" subtitle="Transfers, practical services and thoughtful extras arranged directly by SEM." />
      {categories.map((category) => <section key={category}><div className="mb-4 text-[10px] font-bold uppercase tracking-[0.24em] text-[#9a815d]">{category}</div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{services.filter((service) => service.category === category).map((service) => <ServiceCard key={service.id} service={service} onClick={() => setRequesting(service)} />)}</div></section>)}
      {!services.length && <EmptyState title="No services available right now" text="New SEM services will appear here when available for your stay." />}
      {requesting && <RequestModal service={requesting} onClose={() => setRequesting(null)} onSubmit={async (payload) => { await api.post(`/guest-portal/${token}/service-requests`, { serviceId: requesting.id, ...payload }); setRequesting(null); setNotice(`${requesting.name} request sent to SEM.`); await reload(); }} />}
    </div>
  );
};

const TransfersTab = ({ token, reservation, transfers, reload, setNotice }) => {
  const [form, setForm] = useState({ transferType: 'airport_pickup', pickupLocation: '', destination: '', scheduledAt: '', passengers: 1, luggage: 0, flightInfo: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setSaving(true); setError('');
    try {
      await api.post(`/guest-portal/${token}/transfers`, form);
      setNotice('Your transfer request has been sent to SEM. Driver and vehicle details will appear here when assigned.');
      setForm({ transferType: 'airport_pickup', pickupLocation: '', destination: '', scheduledAt: '', passengers: 1, luggage: 0, flightInfo: '', notes: '' });
      await reload();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Transfer request could not be sent.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="mt-7 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <section className="rounded-[30px] border border-[#ded6cb] bg-[#fffdf9] p-6 shadow-[0_14px_45px_rgba(38,31,22,0.06)] sm:p-8">
        <SectionHeading eyebrow="SEM Mobility" title="Private transfer" subtitle="Airport, port or private route. Send the details and SEM will handle the rest." />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block"><FieldLabel>Transfer type</FieldLabel><select value={form.transferType} onChange={(e) => setForm({ ...form, transferType: e.target.value })} className={inputClass}><option value="airport_pickup">Airport pickup</option><option value="airport_dropoff">Airport drop-off</option><option value="port_pickup">Port pickup</option><option value="port_dropoff">Port drop-off</option><option value="private_route">Private route</option></select></label>
          <Field type="datetime-local" label="Date & time" value={form.scheduledAt} onChange={(v) => setForm({ ...form, scheduledAt: v })} />
          <Field label="Pickup location" value={form.pickupLocation} onChange={(v) => setForm({ ...form, pickupLocation: v })} placeholder="Airport, port, hotel or address" />
          <Field label="Destination" value={form.destination} onChange={(v) => setForm({ ...form, destination: v })} placeholder={reservation.propertyName || 'Destination'} />
          <Field type="number" label="Passengers" value={form.passengers} onChange={(v) => setForm({ ...form, passengers: v })} />
          <Field type="number" label="Luggage" value={form.luggage} onChange={(v) => setForm({ ...form, luggage: v })} />
          <div className="sm:col-span-2"><Field label="Flight / ferry number" value={form.flightInfo} onChange={(v) => setForm({ ...form, flightInfo: v })} placeholder="Optional" /></div>
        </div>
        <label className="mt-4 block"><FieldLabel>Notes</FieldLabel><textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} placeholder="Anything the driver should know" /></label>
        {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        <button onClick={submit} disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#171612] px-5 py-3.5 text-sm font-bold text-white shadow-lg disabled:opacity-50">{saving ? 'Sending request…' : 'Request private transfer'} <Icon name="arrow" className="h-4 w-4" /></button>
      </section>

      <section className="rounded-[30px] bg-[#171612] p-6 text-white shadow-[0_18px_55px_rgba(20,17,13,0.18)] sm:p-8">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#c8ad83]">Your mobility</div>
        <div className="mt-2 text-2xl font-black tracking-[-0.03em]">Transfers</div>
        <div className="mt-6 space-y-3">{transfers.map((transfer) => <div key={transfer.id} className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-white">{transfer.pickupLocation}</div><div className="mt-1 flex items-center gap-2 text-xs text-white/45"><Icon name="arrow" className="h-3 w-3" /> {transfer.destination}</div></div><Status status={transfer.status} dark /></div><div className="mt-4 text-xs font-semibold text-[#d2b88f]">{formatDateTime(transfer.scheduledAt)}</div><div className="mt-1 text-xs text-white/45">{transfer.driver ? `${transfer.driver}${transfer.vehicle ? ` · ${transfer.vehicle}` : ''}` : 'Driver assignment pending'}</div></div>)}{!transfers.length && <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-white/45">No transfer requests yet.</div>}</div>
      </section>
    </div>
  );
};

const RequestsTab = ({ requests, transfers }) => (
  <div className="mt-7 space-y-6">
    <SectionHeading eyebrow="Your requests" title="Everything in one place" subtitle="Track services and transfers requested during your stay." />
    <div className="grid gap-5 lg:grid-cols-2">
      <RequestList title="Services" icon="sparkles" empty="No service requests yet." items={requests.map((item) => ({ id: item.id, title: item.serviceName, detail: item.requestedFor ? formatDateTime(item.requestedFor) : 'Requested from Guest Portal', extra: item.guestNotes, status: item.status }))} />
      <RequestList title="Transfers" icon="car" empty="No transfer requests yet." items={transfers.map((item) => ({ id: item.id, title: `${item.pickupLocation} → ${item.destination}`, detail: formatDateTime(item.scheduledAt), extra: item.driver ? `${item.driver}${item.vehicle ? ` · ${item.vehicle}` : ''}` : '', status: item.status }))} />
    </div>
  </div>
);

const RequestList = ({ title, icon, items, empty }) => <section className="rounded-[30px] border border-[#ded6cb] bg-[#fffdf9] p-6 shadow-[0_14px_45px_rgba(38,31,22,0.05)]"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f0e9de] text-[#806544]"><Icon name={icon} className="h-4 w-4" /></div><div className="text-lg font-black tracking-[-0.02em] text-[#171612]">{title}</div></div><div className="mt-5 space-y-3">{items.map((item) => <div key={item.id} className="rounded-[20px] border border-[#e4ddd3] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-[#201e1a]">{item.title}</div><div className="mt-1 text-xs leading-5 text-[#82796e]">{item.detail}{item.extra ? ` · ${item.extra}` : ''}</div></div><Status status={item.status} /></div></div>)}{!items.length && <div className="rounded-[20px] bg-[#f7f3ed] p-5 text-sm text-[#8a8177]">{empty}</div>}</div></section>;

const RequestModal = ({ service, onClose, onSubmit }) => {
  const [form, setForm] = useState({ quantity: 1, requestedFor: '', guestNotes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => { setSaving(true); setError(''); try { await onSubmit(form); } catch (requestError) { setError(requestError.response?.data?.message || 'Request could not be sent.'); setSaving(false); } };
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#11110f]/70 p-3 backdrop-blur-sm sm:items-center"><div className="w-full max-w-lg rounded-[30px] border border-white/20 bg-[#fffdf9] p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><CategoryPill category={service.category} /><div className="mt-4 text-2xl font-black tracking-[-0.03em] text-[#171612]">{service.name}</div><div className="mt-2 text-sm leading-7 text-[#736b61]">{service.description}</div><div className="mt-3 text-sm font-black text-[#7d6240]">{service.priceLabel}</div></div><button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eee8df] text-[#5f574d]"><Icon name="close" className="h-4 w-4" /></button></div><div className="mt-6 space-y-4"><Field type="number" label="Quantity" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} />{service.requiresSchedule && <Field type="datetime-local" label="Preferred date & time" value={form.requestedFor} onChange={(v) => setForm({ ...form, requestedFor: v })} />}<label className="block"><FieldLabel>Notes</FieldLabel><textarea rows={3} value={form.guestNotes} onChange={(e) => setForm({ ...form, guestNotes: e.target.value })} className={inputClass} placeholder="Preferences or details for SEM" /></label></div>{error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}<div className="mt-6 flex gap-3"><button onClick={onClose} className="flex-1 rounded-full border border-[#d9d0c4] bg-white px-4 py-3 text-sm font-bold text-[#61594f]">Cancel</button><button onClick={submit} disabled={saving} className="flex-1 rounded-full bg-[#171612] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Sending…' : 'Send request'}</button></div></div></div>;
};

const ServiceCard = ({ service, onClick }) => <button onClick={onClick} className="group rounded-[26px] border border-[#dfd7cc] bg-[#fffdf9] p-5 text-left shadow-[0_10px_35px_rgba(42,34,23,0.04)] transition hover:-translate-y-1 hover:border-[#bba88d] hover:shadow-[0_18px_45px_rgba(42,34,23,0.10)]"><div className="flex items-center justify-between gap-3"><CategoryPill category={service.category} /><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f0e9de] text-[#816746] transition group-hover:bg-[#171612] group-hover:text-white"><Icon name="arrow" className="h-4 w-4" /></div></div><div className="mt-6 text-lg font-black tracking-[-0.025em] text-[#171612]">{service.name}</div><div className="mt-2 min-h-14 text-xs leading-6 text-[#7e766c]">{service.description}</div><div className="mt-5 text-sm font-black text-[#745a39]">{service.priceLabel}</div></button>;

const LuxuryInfoCard = ({ icon, label, value, secret = false }) => <div className="rounded-[26px] border border-[#ded6cb] bg-[#fffdf9] p-5 shadow-[0_10px_35px_rgba(42,34,23,0.04)]"><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f0e9de] text-[#806544]"><Icon name={icon} className="h-4.5 w-4.5" /></div>{secret && <Icon name="lock" className="h-3.5 w-3.5 text-[#b0a28e]" />}</div><div className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a19381]">{label}</div><div className="mt-2 break-words text-base font-black leading-6 text-[#1d1b18]">{value}</div></div>;
const LuxuryTextCard = ({ icon, title, text }) => <div className="rounded-[28px] border border-[#ded6cb] bg-[#fffdf9] p-6 shadow-[0_10px_35px_rgba(42,34,23,0.04)]"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f0e9de] text-[#806544]"><Icon name={icon} className="h-4 w-4" /></div><div className="text-base font-black text-[#1d1b18]">{title}</div></div><div className="mt-4 whitespace-pre-line text-sm leading-7 text-[#70695f]">{text}</div></div>;
const PremiumMetric = ({ label, value }) => <div className="rounded-[20px] border border-[#e3dcd2] bg-white px-4 py-4"><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9e9385]">{label}</div><div className="mt-1.5 text-lg font-black tracking-[-0.02em] text-[#1d1b18]">{value}</div></div>;
const ReviewCard = ({ label, value, icon }) => <div className="rounded-[20px] border border-[#e1d9ce] bg-white p-4"><div className="flex items-center gap-2 text-[#9a815d]"><Icon name={icon} className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-[0.16em]">{label}</span></div><div className="mt-2 text-sm font-black leading-6 text-[#201e1a]">{value}</div></div>;
const HeroMetric = ({ label, value, icon }) => <div className="bg-[#171713]/80 p-4 sm:p-5"><div className="flex items-center gap-2 text-[#d3ba93]"><Icon name={icon} className="h-3.5 w-3.5" /><span className="text-[9px] font-bold uppercase tracking-[0.18em]">{label}</span></div><div className="mt-2 text-sm font-bold leading-5 text-white/90">{value}</div></div>;
const CategoryPill = ({ category }) => <span className="inline-flex rounded-full border border-[#d9c9b1] bg-[#f7f0e5] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#806544]">{category || 'service'}</span>;

const SectionHeading = ({ eyebrow, title, subtitle, compact = false }) => <div><div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#9a815d]">{eyebrow}</div><h2 className={`mt-2 font-black tracking-[-0.035em] text-[#171612] ${compact ? 'text-2xl' : 'text-3xl sm:text-[34px]'}`}>{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#777065]">{subtitle}</p></div>;
const FieldLabel = ({ children }) => <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#6f675d]">{children}</span>;
const inputClass = 'mt-2 w-full rounded-[16px] border border-[#dcd3c8] bg-white px-4 py-3.5 text-sm text-[#201e1a] outline-none transition placeholder:text-[#aaa197] focus:border-[#9e8057] focus:ring-2 focus:ring-[#9e8057]/10';
const Field = ({ label, value, onChange, placeholder, type = 'text' }) => <label className="block"><FieldLabel>{label}</FieldLabel><input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputClass} /></label>;
const ReadOnlyField = ({ label, value }) => <div><FieldLabel>{label}</FieldLabel><div className="mt-2 rounded-[16px] border border-[#e5ddd2] bg-[#f7f3ed] px-4 py-3.5 text-sm font-semibold text-[#5f584f]">{value || '—'}</div></div>;

const Status = ({ status, dark = false }) => {
  const key = String(status || 'requested').toLowerCase();
  const label = key.replaceAll('_', ' ');
  const classes = dark
    ? (['completed', 'confirmed'].includes(key) ? 'bg-emerald-400/15 text-emerald-200' : key === 'cancelled' || key === 'declined' ? 'bg-rose-400/15 text-rose-200' : 'bg-white/10 text-white/65')
    : (['completed', 'confirmed'].includes(key) ? 'bg-emerald-100 text-emerald-700' : key === 'cancelled' || key === 'declined' ? 'bg-rose-100 text-rose-700' : 'bg-[#f0e9de] text-[#745e42]');
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${classes}`}>{label}</span>;
};

const Icon = ({ name, className = 'h-5 w-5' }) => {
  const paths = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5M9 21v-7h6v7"/></>,
    arrival: <><path d="M4 12h15"/><path d="m14 7 5 5-5 5"/><path d="M4 5v14"/></>,
    departure: <><path d="M20 12H5"/><path d="m10 7-5 5 5 5"/><path d="M20 5v14"/></>,
    key: <><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M15 8l2 2M17 6l2 2"/></>,
    building: <><path d="M4 21V5l8-2v18M12 8h8v13M2 21h20"/><path d="M7 8h2M7 12h2M7 16h2M15 11h2M15 15h2"/></>,
    wifi: <><path d="M5 12.5a10 10 0 0 1 14 0M8 16a6 6 0 0 1 8 0M11 19.5a2 2 0 0 1 2 0"/></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    phone: <path d="M5 3h4l2 5-3 2a16 16 0 0 0 6 6l2-3 5 2v4c0 1-1 2-2 2C10 21 3 14 3 5c0-1 1-2 2-2Z"/>,
    shield: <><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-4"/></>,
    car: <><path d="M5 17h14l-1-6-2-4H8l-2 4-1 6Z"/><path d="M3 13h2M19 13h2"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/></>,
    sparkles: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"/><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    concierge: <><path d="M4 18h16M6 18a6 6 0 0 1 12 0"/><path d="M12 8V5M9 5h6"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
    close: <path d="M6 6l12 12M18 6 6 18"/>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.home}</svg>;
};

const PortalFrame = ({ children }) => <div className="min-h-screen bg-[#f3efe8] text-[#171612]"><div className="mx-auto w-full max-w-[1220px] px-3 py-3 sm:px-6 sm:py-6 lg:px-8 lg:py-8"><main>{children}</main><footer className="pb-5 pt-10 text-center"><div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#9a8f80]">SEM Estate & Mobility</div><div className="mt-2 text-[11px] text-[#aaa095]">Your private guest experience</div></footer></div></div>;
const LoadingScreen = () => <div className="flex min-h-[70vh] items-center justify-center"><div className="text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#171612] text-sm font-black text-[#d9c4a3]">S</div><div className="mt-5 text-sm font-bold text-[#5f584f]">Preparing your stay…</div></div></div>;
const ErrorScreen = ({ message }) => <div className="mx-auto mt-20 max-w-xl rounded-[28px] border border-rose-200 bg-white p-7 text-center shadow-lg"><div className="text-lg font-black text-[#171612]">This private link is unavailable</div><div className="mt-3 text-sm leading-6 text-rose-700">{message}</div></div>;
const EmptyState = ({ title, text }) => <div className="rounded-[26px] border border-[#ded6cb] bg-[#fffdf9] p-8 text-center"><div className="text-lg font-black text-[#1d1b18]">{title}</div><div className="mt-2 text-sm text-[#837b70]">{text}</div></div>;

const prettyMethod = (value) => ({ car: 'Car', taxi: 'Taxi', 'airport-transfer': 'Airport transfer', 'public-transport': 'Public transport', other: 'Other' }[value] || value || 'Not provided');
const formatStayValue = (date, time) => [date, time].filter(Boolean).join(' · ') || 'To be confirmed';
const formatWifi = (stay) => stay.wifiName ? `${stay.wifiName}${stay.wifiPassword ? ` · ${stay.wifiPassword}` : ''}` : stay.wifiPassword || 'Contact SEM';
const formatDateTime = (value) => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(); };

export default GuestPortalPage;

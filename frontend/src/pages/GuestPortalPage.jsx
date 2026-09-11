import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import SemLogo from '../components/SemLogo';

const steps = ['Stay', 'Arrival', 'Extras', 'Review'];
const tabs = [
  ['home', 'Stay', 'home'],
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
    guestPhone: '',
    arrivalTime: '',
    departureTime: '',
    arrivalMethod: '',
    flightNumber: '',
    specialRequests: '',
    addonRequests: [],
    termsAccepted: false,
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    api.get(`/guest-portal/${token}`)
      .then((response) => active && hydrate(response.data.data))
      .catch((requestError) => active && setError(requestError.response?.data?.message || 'Your private stay portal could not be loaded.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  const firstName = useMemo(
    () => String(portal?.reservation?.guestName || 'Guest').trim().split(/\s+/)[0],
    [portal]
  );
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
    setSaving(true);
    setError('');
    try {
      const response = await api.put(`/guest-portal/${token}/check-in`, form);
      hydrate(response.data.data);
      navigate(`/guest/${token}`, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Online check-in could not be completed.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PortalFrame><LoadingScreen /></PortalFrame>;
  if (error && !portal) return <PortalFrame><ErrorScreen message={error} /></PortalFrame>;

  return (
    <PortalFrame hasMobileNav={!showWizard}>
      <LuxuryHero firstName={firstName} portal={portal} compact={showWizard} />
      {showWizard ? (
        <CheckinWizard
          portal={portal}
          form={form}
          step={step}
          setStep={setStep}
          update={update}
          toggleAddon={toggleAddon}
          complete={complete}
          saving={saving}
          error={error}
        />
      ) : (
        <GuestHome portal={portal} token={token} reload={loadPortal} />
      )}
    </PortalFrame>
  );
};

const LuxuryHero = ({ firstName, portal, compact = false }) => {
  const reservation = portal?.reservation || {};
  const submitted = portal?.submitted || {};
  const ready = portal?.status === 'completed';

  return (
    <header className="relative overflow-hidden bg-[#11110f] text-white shadow-[0_24px_80px_rgba(20,17,13,0.20)] sm:rounded-[34px] sm:border sm:border-white/10">
      <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[#b89a6d]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-[#52646f]/15 blur-3xl" />
      <div className={`relative px-5 sm:px-8 lg:px-11 ${compact ? 'pb-6 pt-5 sm:py-8' : 'pb-7 pt-5 sm:py-10 lg:py-12'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <SemLogo inverted className="h-8 w-auto max-w-[138px] shrink-0" />
            <div className="min-w-0 border-l border-white/10 pl-4">
              <div className="truncate text-[10px] font-bold uppercase tracking-[0.24em] text-[#dec69f]">Guest Experience</div>
              <div className="mt-0.5 truncate text-[11px] text-white/40">Private stay portal</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.11em] text-white/70">
            <span className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-emerald-400' : 'bg-[#d9c4a3]'}`} />
            {ready ? 'Stay ready' : 'Pre-arrival'}
          </div>
        </div>

        <div className={compact ? 'mt-8 sm:mt-10' : 'mt-9 sm:mt-14 lg:mt-16'}>
          <div className="text-[10px] font-bold uppercase tracking-[0.23em] text-white/35">Welcome to your stay</div>
          <h1 className={`${compact ? 'mt-2 text-[34px] sm:text-5xl' : 'mt-2.5 text-[38px] sm:text-6xl lg:text-7xl'} font-bold leading-[0.98] tracking-[-0.055em]`}>Hello, {firstName}.</h1>
          {!compact && (
            <p className="mt-4 max-w-xl text-[14px] leading-6 text-white/55 sm:mt-5 sm:text-base sm:leading-7">
              Access, Wi-Fi, arrival details, private transfers and concierge services — all in one place.
            </p>
          )}
        </div>

        <div className={`${compact ? 'mt-6' : 'mt-8 sm:mt-10'} grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4`}>
          <HeroMetric label="Arrival" value={formatStayValue(reservation.arrivalDate, submitted.arrivalTime || reservation.arrivalTime)} icon="arrival" />
          <HeroMetric label="Departure" value={formatStayValue(reservation.departureDate, submitted.departureTime || reservation.departureTime)} icon="departure" />
          <HeroMetric label="Property" value={reservation.propertyName || 'SEM Property'} icon="home" />
          <HeroMetric label="Room" value={reservation.roomNumber ? `Room ${reservation.roomNumber}` : reservation.roomType || 'To be assigned'} icon="key" />
        </div>
      </div>
    </header>
  );
};

const HeroMetric = ({ label, value, icon }) => (
  <div className="min-w-0 rounded-[18px] border border-white/10 bg-white/[0.045] p-3.5 backdrop-blur-sm sm:rounded-[20px] sm:p-4">
    <div className="flex items-center gap-2 text-[#d7bf98]"><Icon name={icon} className="h-3.5 w-3.5" /><span className="text-[9px] font-bold uppercase tracking-[0.14em]">{label}</span></div>
    <div className="mt-2 line-clamp-2 text-[12px] font-bold leading-5 text-white/90 sm:text-sm">{value || '—'}</div>
  </div>
);

const CheckinWizard = ({ portal, form, step, setStep, update, toggleAddon, complete, saving, error }) => {
  const reservation = portal.reservation || {};
  const canContinue = step !== 1 || (form.arrivalTime && form.departureTime);
  const canComplete = Boolean(form.arrivalTime && form.departureTime && form.termsAccepted);

  return (
    <section className="mx-3 -mt-1 overflow-hidden rounded-[26px] border border-[#e0d7ca] bg-[#fffdf9] shadow-[0_18px_55px_rgba(38,31,22,0.08)] sm:mx-0 sm:mt-6 sm:rounded-[32px]">
      <div className="border-b border-[#ece5db] px-4 py-4 sm:px-8 sm:py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#94764e]">Online check-in</div>
            <div className="mt-1 text-[13px] text-[#756e65] sm:text-sm">A few details and you are ready.</div>
          </div>
          <div className="rounded-full bg-[#f1ece4] px-3 py-1.5 text-[11px] font-bold text-[#6b6258]">{step + 1}/{steps.length}</div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-1.5 sm:gap-2">
          {steps.map((label, index) => (
            <div key={label}>
              <div className={`h-1 rounded-full ${index <= step ? 'bg-[#98784f]' : 'bg-[#e8e0d5]'}`} />
              <div className={`mt-1.5 text-center text-[9px] font-bold uppercase tracking-[0.06em] ${index === step ? 'text-[#72573a]' : 'text-[#b0a79c]'}`}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-6 sm:px-8 sm:py-9">
        {step === 0 && (
          <div className="space-y-5">
            <SectionHeading eyebrow="01" title="Your stay" subtitle="Check your reservation and contact details." />
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              <ReadOnlyField label="Guest" value={reservation.guestName} />
              <ReadOnlyField label="Email" value={reservation.guestEmail || 'Not provided'} />
              <Field label="Mobile phone" value={form.guestPhone} onChange={(v) => update('guestPhone', v)} placeholder="+30…" inputMode="tel" />
              <ReadOnlyField label="Room" value={[reservation.roomNumber, reservation.roomType].filter(Boolean).join(' · ') || 'To be assigned'} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <SectionHeading eyebrow="02" title="Arrival & departure" subtitle="Tell us when and how you expect to arrive and leave." />
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <Field type="time" label="Arrival time" value={form.arrivalTime} onChange={(v) => update('arrivalTime', v)} />
              <Field type="time" label="Departure time" value={form.departureTime} onChange={(v) => update('departureTime', v)} />
            </div>
            <label className="block"><FieldLabel>How are you arriving?</FieldLabel><select value={form.arrivalMethod} onChange={(e) => update('arrivalMethod', e.target.value)} className={inputClass}><option value="">Select arrival method</option><option value="car">Car</option><option value="taxi">Taxi</option><option value="airport-transfer">Airport transfer</option><option value="public-transport">Public transport</option><option value="other">Other</option></select></label>
            <Field label="Flight / ferry number" value={form.flightNumber} onChange={(v) => update('flightNumber', v)} placeholder="Optional" />
            <label className="block"><FieldLabel>Anything we should know?</FieldLabel><textarea value={form.specialRequests} onChange={(e) => update('specialRequests', e.target.value)} rows={4} className={inputClass} placeholder="Special requests, arrival notes or preferences" /></label>
          </div>
        )}

        {step === 2 && (
          <div>
            <SectionHeading eyebrow="03" title="Make the stay yours" subtitle="Choose anything you would like SEM to arrange." />
            <div className="mt-5 space-y-3 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0 lg:grid-cols-3">
              {(portal.addons || []).map((addon) => {
                const selected = form.addonRequests.some((item) => item.id === addon.id);
                return (
                  <button
                    key={addon.id}
                    type="button"
                    onClick={() => toggleAddon(addon)}
                    className={`flex w-full items-center gap-4 rounded-[20px] border p-4 text-left transition sm:block sm:p-5 ${selected ? 'border-[#a4865e] bg-[#f7f0e5] shadow-[0_10px_24px_rgba(120,91,51,0.10)]' : 'border-[#e4ddd3] bg-white active:scale-[0.99] sm:hover:-translate-y-0.5 sm:hover:border-[#bba88d] sm:hover:shadow-lg'}`}
                  >
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${selected ? 'bg-[#171612] text-[#e0c8a0]' : 'bg-[#f2eee7] text-[#846f54]'}`}><Icon name={selected ? 'check' : serviceIcon(addon.category)} className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1 sm:mt-4">
                      <div className="flex items-start justify-between gap-3"><div className="text-[15px] font-bold text-[#171612]">{addon.name}</div><div className="shrink-0 text-[13px] font-bold text-[#72593b]">{addon.priceLabel}</div></div>
                      <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#7c746a] sm:line-clamp-3">{addon.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {!portal.addons?.length && <EmptyState title="No extras available" text="You can continue and request services later from your Guest Portal." />}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <SectionHeading eyebrow="04" title="Ready to arrive" subtitle="Review your details and finish online check-in." />
            <div className="grid grid-cols-2 gap-3">
              <ReviewCard label="Arrival" value={form.arrivalTime || 'Required'} icon="arrival" />
              <ReviewCard label="Departure" value={form.departureTime || 'Required'} icon="departure" />
              <ReviewCard label="Arrival method" value={prettyMethod(form.arrivalMethod)} icon="car" />
              <ReviewCard label="Services" value={form.addonRequests.length ? `${form.addonRequests.length} selected` : 'None'} icon="sparkles" />
            </div>
            {form.addonRequests.length > 0 && <div className="rounded-[18px] bg-[#f6f1e9] px-4 py-3 text-[12px] leading-5 text-[#6e655a]">{form.addonRequests.map((item) => item.name).join(' · ')}</div>}
            <label className="flex cursor-pointer items-start gap-3 rounded-[20px] border border-[#e2dbd1] bg-[#f8f5ef] p-4"><input type="checkbox" checked={form.termsAccepted} onChange={(e) => update('termsAccepted', e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#171612]" /><span className="text-[13px] leading-6 text-[#625b52]">I confirm the information above and accept the property house rules and guest terms.</span></label>
          </div>
        )}

        {error && <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold leading-5 text-rose-700">{error}</div>}
      </div>

      <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t border-[#ece5dc] bg-[#fffdf9]/95 px-4 py-3 backdrop-blur-xl sm:static sm:px-8 sm:py-5">
        <button type="button" onClick={() => setStep((v) => Math.max(0, v - 1))} disabled={step === 0} className="min-h-12 rounded-full border border-[#d9d0c4] bg-white px-5 text-[14px] font-bold text-[#595248] disabled:opacity-30">Back</button>
        {step < steps.length - 1 ? (
          <button type="button" disabled={!canContinue} onClick={() => setStep((v) => Math.min(steps.length - 1, v + 1))} className="flex min-h-12 min-w-[148px] items-center justify-center gap-2 rounded-full bg-[#171612] px-6 text-[14px] font-bold text-white shadow-lg disabled:opacity-40">Continue <Icon name="arrow" className="h-4 w-4" /></button>
        ) : (
          <button type="button" onClick={complete} disabled={saving || !canComplete} className="flex min-h-12 min-w-[170px] items-center justify-center gap-2 rounded-full bg-[#171612] px-6 text-[14px] font-bold text-white shadow-lg disabled:opacity-40">{saving ? 'Completing…' : 'Complete check-in'} <Icon name="check" className="h-4 w-4" /></button>
        )}
      </div>
    </section>
  );
};

const GuestHome = ({ portal, token, reload }) => {
  const [tab, setTab] = useState('home');
  const [notice, setNotice] = useState('');
  const [requesting, setRequesting] = useState(null);
  const checkedIn = portal.status === 'completed';

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <>
      <DesktopTabs tab={tab} setTab={setTab} />

      {!checkedIn && (
        <section className="mx-3 mt-4 flex items-center gap-3 rounded-[22px] border border-[#d8c5a4] bg-[#f7efe1] p-4 sm:mx-0 sm:mt-5 sm:p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#171612] text-[#dec7a2]"><Icon name="arrival" className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1"><div className="text-[13px] font-bold text-[#3f3325]">Complete your online check-in</div><div className="mt-0.5 text-[11px] leading-5 text-[#75654f]">Add arrival and departure details.</div></div>
          <a href={`/guest/${token}/check-in`} className="flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#171612] px-4 text-[12px] font-bold text-white">Continue</a>
        </section>
      )}

      {notice && <div className="fixed left-3 right-3 top-3 z-[70] mx-auto max-w-lg rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-800 shadow-xl sm:left-auto sm:right-6 sm:top-6 sm:w-[380px]">{notice}</div>}

      <div className="px-3 sm:px-0">
        {tab === 'home' && <StayTab portal={portal} setNotice={setNotice} />}
        {tab === 'services' && <ServicesTab services={portal.services || []} requesting={requesting} setRequesting={setRequesting} token={token} reload={reload} setNotice={setNotice} />}
        {tab === 'transfers' && <TransfersTab token={token} reservation={portal.reservation || {}} transfers={portal.transfers || []} reload={reload} setNotice={setNotice} />}
        {tab === 'requests' && <RequestsTab requests={portal.serviceRequests || []} transfers={portal.transfers || []} />}
      </div>

      <MobileTabs tab={tab} setTab={setTab} />
    </>
  );
};

const DesktopTabs = ({ tab, setTab }) => (
  <nav className="sticky top-3 z-30 mt-5 hidden rounded-[24px] border border-[#ded6cb]/95 bg-[#fffdf9]/95 p-2 shadow-[0_12px_38px_rgba(45,36,25,0.09)] backdrop-blur-xl sm:block">
    <div className="grid grid-cols-4 gap-2">
      {tabs.map(([id, label, icon]) => (
        <button key={id} type="button" onClick={() => setTab(id)} className={`flex min-h-11 items-center justify-center gap-2 rounded-[17px] px-4 text-xs font-bold transition ${tab === id ? 'bg-[#171612] text-white shadow-md' : 'text-[#756c60] hover:bg-[#f2ede5]'}`}><Icon name={icon} className="h-4 w-4" />{label}</button>
      ))}
    </div>
  </nav>
);

const MobileTabs = ({ tab, setTab }) => (
  <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-black/5 bg-[#fffdf9]/95 px-2 pt-2 shadow-[0_-14px_35px_rgba(40,31,20,0.10)] backdrop-blur-2xl sm:hidden" style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
    <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
      {tabs.map(([id, label, icon]) => {
        const active = tab === id;
        return (
          <button key={id} type="button" aria-label={label} onClick={() => { setTab(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[16px] text-[10px] font-bold transition active:scale-95 ${active ? 'bg-[#171612] text-white' : 'text-[#746b60]'}`}>
            <Icon name={icon} className="h-[19px] w-[19px]" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);

const StayTab = ({ portal, setNotice }) => {
  const stay = portal.stayInfo || {};
  const submitted = portal.submitted || {};
  const reservation = portal.reservation || {};
  const arrivalTime = submitted.arrivalTime || reservation.arrivalTime || 'Not provided';
  const departureTime = submitted.departureTime || reservation.departureTime || 'Not provided';

  const copy = async (label, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(`${label}: ${value}`);
    }
  };

  return (
    <div className="mt-5 space-y-4 sm:mt-6 sm:space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.22fr_.78fr]">
        <div className="rounded-[24px] border border-[#e0d8cd] bg-[#fffdf9] p-4 shadow-[0_12px_38px_rgba(38,31,22,0.055)] sm:rounded-[30px] sm:p-7">
          <SectionHeading eyebrow="Your stay" title="At a glance" subtitle="The details that matter today." compact />
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3">
            <JourneyMetric icon="arrival" label="Expected arrival" value={arrivalTime} />
            <JourneyMetric icon="departure" label="Expected departure" value={departureTime} />
            <JourneyMetric icon="car" label="Arrival method" value={prettyMethod(submitted.arrivalMethod)} />
            <JourneyMetric icon="ticket" label="Flight / ferry" value={submitted.flightNumber || 'Not provided'} />
          </div>
        </div>

        <div className="rounded-[24px] bg-[#171612] p-5 text-white shadow-[0_18px_52px_rgba(20,17,13,0.17)] sm:rounded-[30px] sm:p-7">
          <div className="flex items-start justify-between gap-4"><div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[#dfc69d]"><Icon name="concierge" className="h-5 w-5" /></div><div className="rounded-full border border-white/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/45">SEM concierge</div></div>
          <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#cdb083]">Here when you need us</div>
          <div className="mt-1.5 text-2xl font-bold tracking-[-0.03em]">Need anything?</div>
          <p className="mt-2 text-[13px] leading-6 text-white/50">Property help, transfers and local arrangements throughout your stay.</p>
          {stay.supportPhone ? <a href={`tel:${stay.supportPhone}`} className="mt-5 flex min-h-12 items-center justify-between rounded-[17px] border border-white/10 bg-white/[0.05] px-4 text-[13px] font-bold text-white"><span>{stay.supportPhone}</span><Icon name="phone" className="h-4 w-4 text-[#d8bf98]" /></a> : <div className="mt-5 rounded-[17px] border border-white/10 bg-white/[0.05] px-4 py-3 text-[13px] font-bold text-white/70">Contact SEM for assistance</div>}
        </div>
      </section>

      {!stay.accessReleased && (
        <section className="flex items-start gap-3 rounded-[22px] border border-[#d8c49e] bg-[#f6efe3] p-4 sm:p-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1a1916] text-[#dec7a2]"><Icon name="lock" className="h-4 w-4" /></div>
          <div><div className="text-[13px] font-bold text-[#3d3225]">Access appears when the property is ready</div><div className="mt-1 text-[11px] leading-5 text-[#786954]">Room code, building access and Wi-Fi remain private until SEM releases them.</div></div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#92774f]">Private access</div><h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-[#171612] sm:text-2xl">Everything you need to enter</h2></div>{stay.accessReleased && <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-700">Released</span>}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <AccessCard icon="key" label="Room code" value={stay.accessReleased ? stay.roomAccessCode || 'Contact SEM' : 'Locked'} locked={!stay.accessReleased} onCopy={stay.accessReleased && stay.roomAccessCode ? () => copy('Room code', stay.roomAccessCode) : null} />
          <AccessCard icon="building" label="Building code" value={stay.accessReleased ? stay.buildingAccessCode || 'Not required' : 'Locked'} locked={!stay.accessReleased} onCopy={stay.accessReleased && stay.buildingAccessCode ? () => copy('Building code', stay.buildingAccessCode) : null} />
          <AccessCard icon="wifi" label="Wi-Fi" value={stay.accessReleased ? stay.wifiName || stay.wifiPassword || 'Contact SEM' : 'Locked'} subvalue={stay.accessReleased && stay.wifiName && stay.wifiPassword ? `Password · ${stay.wifiPassword}` : ''} locked={!stay.accessReleased} onCopy={stay.accessReleased && (stay.wifiPassword || stay.wifiName) ? () => copy('Wi-Fi', stay.wifiPassword || stay.wifiName) : null} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <CompactInfoCard icon="location" label="Property address" value={stay.propertyAddress || reservation.propertyName || 'Property details'} />
        <CompactInfoCard icon="shield" label="Emergency contact" value={stay.emergencyContact || 'Contact SEM for urgent property assistance'} href={stay.emergencyContact ? `tel:${stay.emergencyContact}` : ''} />
        <CompactInfoCard icon="phone" label="SEM support" value={stay.supportPhone || 'Available throughout your stay'} href={stay.supportPhone ? `tel:${stay.supportPhone}` : ''} />
      </section>

      <section className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        <InstructionCard icon="arrival" title="Self check-in" text={stay.accessReleased ? stay.checkinInstructions || 'Your access details are ready. Contact SEM if you need assistance.' : 'Instructions will appear here as soon as access is released.'} prominent />
        <InstructionCard icon="departure" title="Check-out" text={stay.checkoutInstructions || `Expected departure time: ${departureTime}.`} />
        <InstructionCard icon="car" title="Parking" text={stay.parkingInfo || 'Contact SEM if you need parking information for this property.'} />
        <InstructionCard icon="home" title="Property information" text={stay.hotWaterInfo || 'Property-specific operating information will appear here when applicable.'} />
      </section>

      {stay.usefulInfo && (
        <section className="rounded-[24px] border border-[#e0d8cd] bg-[#fffdf9] p-5 shadow-[0_12px_38px_rgba(38,31,22,0.05)] sm:rounded-[30px] sm:p-7">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#93784f]">Good to know</div>
          <div className="mt-3 whitespace-pre-line text-[13px] leading-6 text-[#645e55] sm:text-sm sm:leading-7">{stay.usefulInfo}</div>
        </section>
      )}
    </div>
  );
};

const ServicesTab = ({ services, requesting, setRequesting, token, reload, setNotice }) => {
  const categories = [...new Set(services.map((service) => service.category))];
  return (
    <div className="mt-5 space-y-7 sm:mt-7 sm:space-y-8">
      <SectionHeading eyebrow="Concierge" title="Curated for your stay" subtitle="Useful services and thoughtful extras, arranged directly by SEM." />
      {categories.map((category) => (
        <section key={category}>
          <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#92774f]"><span className="h-px w-6 bg-[#cbb99d]" />{category}</div>
          <div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0 lg:grid-cols-3">
            {services.filter((service) => service.category === category).map((service) => <ServiceCard key={service.id} service={service} onClick={() => setRequesting(service)} />)}
          </div>
        </section>
      ))}
      {!services.length && <EmptyState title="No services available right now" text="New SEM services will appear here when available for your stay." />}
      {requesting && <RequestModal service={requesting} onClose={() => setRequesting(null)} onSubmit={async (payload) => { await api.post(`/guest-portal/${token}/service-requests`, { serviceId: requesting.id, ...payload }); setRequesting(null); setNotice(`${requesting.name} request sent to SEM.`); await reload(); }} />}
    </div>
  );
};

const ServiceCard = ({ service, onClick }) => (
  <button type="button" onClick={onClick} className="group flex w-full items-center gap-4 rounded-[22px] border border-[#e0d8cd] bg-[#fffdf9] p-4 text-left shadow-[0_9px_28px_rgba(38,31,22,0.045)] transition active:scale-[0.99] sm:block sm:p-5 sm:hover:-translate-y-0.5 sm:hover:border-[#bda98a] sm:hover:shadow-[0_16px_35px_rgba(38,31,22,0.09)]">
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f1ebe1] text-[#836b4c] sm:h-11 sm:w-11"><Icon name={serviceIcon(service.category)} className="h-5 w-5" /></div>
    <div className="min-w-0 flex-1 sm:mt-5">
      <div className="flex items-start justify-between gap-3"><div className="text-[15px] font-bold leading-5 text-[#171612]">{service.name}</div><Icon name="arrow" className="mt-0.5 h-4 w-4 shrink-0 text-[#a48761] sm:hidden" /></div>
      <div className="mt-1.5 line-clamp-2 text-[12px] leading-5 text-[#797166] sm:line-clamp-3 sm:min-h-[60px]">{service.description}</div>
      <div className="mt-2.5 flex items-center justify-between"><span className="text-[13px] font-bold text-[#70583a]">{service.priceLabel}</span><span className="hidden items-center gap-1.5 text-[11px] font-bold text-[#7b6b58] sm:flex">Request <Icon name="arrow" className="h-3.5 w-3.5" /></span></div>
    </div>
  </button>
);

const TransfersTab = ({ token, reservation, transfers, reload, setNotice }) => {
  const [form, setForm] = useState({ transferType: 'airport_pickup', pickupLocation: '', destination: '', scheduledAt: '', passengers: 1, luggage: 0, flightInfo: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post(`/guest-portal/${token}/transfers`, form);
      setNotice('Transfer request sent. Driver and vehicle details will appear here when assigned.');
      setForm({ transferType: 'airport_pickup', pickupLocation: '', destination: '', scheduledAt: '', passengers: 1, luggage: 0, flightInfo: '', notes: '' });
      await reload();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Transfer request could not be sent.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-5 grid gap-4 sm:mt-7 lg:grid-cols-[1.08fr_.92fr] lg:gap-5">
      <section className="rounded-[24px] border border-[#e0d8cd] bg-[#fffdf9] p-4 shadow-[0_12px_38px_rgba(38,31,22,0.055)] sm:rounded-[30px] sm:p-7">
        <SectionHeading eyebrow="SEM Mobility" title="Private transfer" subtitle="Airport, port or custom route. Send the details and we handle the rest." />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block"><FieldLabel>Transfer type</FieldLabel><select value={form.transferType} onChange={(e) => setForm({ ...form, transferType: e.target.value })} className={inputClass}><option value="airport_pickup">Airport pickup</option><option value="airport_dropoff">Airport drop-off</option><option value="port_pickup">Port pickup</option><option value="port_dropoff">Port drop-off</option><option value="private_route">Private route</option></select></label>
          <Field type="datetime-local" label="Date & time" value={form.scheduledAt} onChange={(v) => setForm({ ...form, scheduledAt: v })} />
          <Field label="Pickup location" value={form.pickupLocation} onChange={(v) => setForm({ ...form, pickupLocation: v })} placeholder="Airport, port, hotel or address" />
          <Field label="Destination" value={form.destination} onChange={(v) => setForm({ ...form, destination: v })} placeholder={reservation.propertyName || 'Destination'} />
          <div className="grid grid-cols-2 gap-3 sm:contents"><Field type="number" label="Passengers" value={form.passengers} onChange={(v) => setForm({ ...form, passengers: v })} inputMode="numeric" /><Field type="number" label="Luggage" value={form.luggage} onChange={(v) => setForm({ ...form, luggage: v })} inputMode="numeric" /></div>
          <div className="sm:col-span-2"><Field label="Flight / ferry number" value={form.flightInfo} onChange={(v) => setForm({ ...form, flightInfo: v })} placeholder="Optional" /></div>
        </div>
        <label className="mt-4 block"><FieldLabel>Notes</FieldLabel><textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} placeholder="Anything the driver should know" /></label>
        {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{error}</div>}
        <button type="button" onClick={submit} disabled={saving} className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#171612] px-5 text-[14px] font-bold text-white shadow-lg active:scale-[0.99] disabled:opacity-50">{saving ? 'Sending request…' : 'Request private transfer'} <Icon name="arrow" className="h-4 w-4" /></button>
      </section>

      <section className="rounded-[24px] bg-[#171612] p-5 text-white shadow-[0_18px_52px_rgba(20,17,13,0.17)] sm:rounded-[30px] sm:p-7">
        <div className="flex items-end justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c8ad83]">Your mobility</div><div className="mt-1 text-2xl font-bold tracking-[-0.03em]">Transfers</div></div><div className="text-[11px] font-bold text-white/35">{transfers.length}</div></div>
        <div className="mt-5 space-y-3">
          {transfers.map((transfer) => (
            <div key={transfer.id} className="rounded-[20px] border border-white/10 bg-white/[0.045] p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-[13px] font-bold text-white">{transfer.pickupLocation}</div><div className="mt-1 flex items-center gap-2 truncate text-[11px] text-white/45"><Icon name="arrow" className="h-3 w-3 shrink-0" /> {transfer.destination}</div></div><Status status={transfer.status} dark /></div>
              <div className="mt-3 text-[12px] font-semibold text-[#d2b88f]">{formatDateTime(transfer.scheduledAt)}</div>
              <div className="mt-1 text-[11px] text-white/45">{transfer.driver ? `${transfer.driver}${transfer.vehicle ? ` · ${transfer.vehicle}` : ''}` : 'Driver assignment pending'}</div>
            </div>
          ))}
          {!transfers.length && <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-5 text-[13px] leading-6 text-white/45">No transfer requests yet.</div>}
        </div>
      </section>
    </div>
  );
};

const RequestsTab = ({ requests, transfers }) => (
  <div className="mt-5 space-y-5 sm:mt-7 sm:space-y-6">
    <SectionHeading eyebrow="Your requests" title="Everything in one place" subtitle="Track services and transfers requested during your stay." />
    <div className="grid gap-4 lg:grid-cols-2">
      <RequestList title="Services" icon="sparkles" empty="No service requests yet." items={requests.map((item) => ({ id: item.id, title: item.serviceName, detail: item.requestedFor ? formatDateTime(item.requestedFor) : 'Requested from Guest Portal', extra: item.guestNotes, status: item.status }))} />
      <RequestList title="Transfers" icon="car" empty="No transfer requests yet." items={transfers.map((item) => ({ id: item.id, title: `${item.pickupLocation} → ${item.destination}`, detail: formatDateTime(item.scheduledAt), extra: item.driver ? `${item.driver}${item.vehicle ? ` · ${item.vehicle}` : ''}` : '', status: item.status }))} />
    </div>
  </div>
);

const RequestList = ({ title, icon, empty, items }) => (
  <section className="rounded-[24px] border border-[#e0d8cd] bg-[#fffdf9] p-4 shadow-[0_12px_38px_rgba(38,31,22,0.05)] sm:rounded-[30px] sm:p-6">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f1ebe1] text-[#846e50]"><Icon name={icon} className="h-4 w-4" /></div><div className="text-[15px] font-bold text-[#171612]">{title}</div></div><span className="text-[11px] font-bold text-[#aaa095]">{items.length}</span></div>
    <div className="mt-4 space-y-3">
      {items.map((item) => <div key={item.id} className="rounded-[18px] border border-[#e8e1d7] bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[13px] font-bold leading-5 text-[#211e1a]">{item.title}</div><div className="mt-1 text-[11px] text-[#877e72]">{item.detail}</div>{item.extra && <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#9b9288]">{item.extra}</div>}</div><Status status={item.status} /></div></div>)}
      {!items.length && <div className="rounded-[18px] bg-[#f7f3ed] p-5 text-center text-[12px] text-[#8d8376]">{empty}</div>}
    </div>
  </section>
);

const RequestModal = ({ service, onClose, onSubmit }) => {
  const [form, setForm] = useState({ quantity: 1, requestedFor: '', guestNotes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await onSubmit(form);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Request could not be sent.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#11110f]/65 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[30px] bg-[#fffdf9] p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-[30px] sm:p-7">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#d9d0c4] sm:hidden" />
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f1ebe1] text-[#836b4c]"><Icon name={serviceIcon(service.category)} className="h-5 w-5" /></div><div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#93784f]">SEM concierge</div><div className="mt-1 text-xl font-bold tracking-[-0.03em] text-[#171612]">{service.name}</div></div></div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f1ede6] text-[#625b52]"><Icon name="close" className="h-4 w-4" /></button>
        </div>
        <p className="mt-4 text-[13px] leading-6 text-[#777066]">{service.description}</p>
        <div className="mt-2 text-[14px] font-bold text-[#70583a]">{service.priceLabel}</div>
        <div className="mt-5 space-y-4">
          <Field type="number" label="Quantity" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} inputMode="numeric" />
          {service.requiresSchedule && <Field type="datetime-local" label="Preferred date & time" value={form.requestedFor} onChange={(v) => setForm({ ...form, requestedFor: v })} />}
          <label className="block"><FieldLabel>Notes</FieldLabel><textarea rows={3} value={form.guestNotes} onChange={(e) => setForm({ ...form, guestNotes: e.target.value })} className={inputClass} placeholder="Preferences or details for SEM" /></label>
        </div>
        {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{error}</div>}
        <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={onClose} className="min-h-12 rounded-full border border-[#d8d0c5] text-[14px] font-bold text-[#625b52]">Cancel</button><button type="button" onClick={submit} disabled={saving} className="min-h-12 rounded-full bg-[#171612] text-[14px] font-bold text-white shadow-lg disabled:opacity-50">{saving ? 'Sending…' : 'Send request'}</button></div>
      </div>
    </div>
  );
};

const AccessCard = ({ icon, label, value, subvalue, locked, onCopy }) => (
  <div className={`relative overflow-hidden rounded-[22px] border p-4 sm:min-h-[170px] sm:p-5 ${locked ? 'border-[#e3dbcf] bg-[#f2eee7]' : 'border-[#d7cab5] bg-[#fffdf9] shadow-[0_12px_34px_rgba(38,31,22,0.06)]'}`}>
    <div className="flex items-center justify-between gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-full ${locked ? 'bg-[#e6dfd5] text-[#9e9487]' : 'bg-[#171612] text-[#dec69e]'}`}><Icon name={locked ? 'lock' : icon} className="h-4.5 w-4.5" /></div>{onCopy && <button type="button" onClick={onCopy} className="flex min-h-9 items-center gap-1.5 rounded-full border border-[#ded5c8] bg-white px-3 text-[10px] font-bold text-[#706659]"><Icon name="copy" className="h-3.5 w-3.5" />Copy</button>}</div>
    <div className="mt-4 text-[9px] font-bold uppercase tracking-[0.16em] text-[#948878]">{label}</div>
    <div className={`mt-1 break-words text-[18px] font-bold tracking-[-0.02em] ${locked ? 'text-[#9b9185]' : 'text-[#211e1a]'}`}>{value}</div>
    {subvalue && <div className="mt-1 break-all text-[11px] leading-5 text-[#7f766a]">{subvalue}</div>}
  </div>
);

const JourneyMetric = ({ icon, label, value }) => (
  <div className="rounded-[18px] bg-[#f6f1e9] p-3.5 sm:p-4"><div className="flex items-center gap-2 text-[#93764f]"><Icon name={icon} className="h-3.5 w-3.5" /><span className="text-[9px] font-bold uppercase tracking-[0.12em]">{label}</span></div><div className="mt-2 line-clamp-2 text-[13px] font-bold leading-5 text-[#2b2722] sm:text-sm">{value || '—'}</div></div>
);

const CompactInfoCard = ({ icon, label, value, href }) => {
  const content = <><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1ebe1] text-[#826c4f]"><Icon name={icon} className="h-4 w-4" /></div><div className="min-w-0"><div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#978b7c]">{label}</div><div className="mt-1 break-words text-[12px] font-bold leading-5 text-[#2a2722]">{value}</div></div></>;
  const classes = 'flex min-h-[74px] items-center gap-3 rounded-[20px] border border-[#e3dbd0] bg-[#fffdf9] p-3.5 shadow-[0_8px_24px_rgba(38,31,22,0.035)]';
  return href ? <a href={href} className={classes}>{content}</a> : <div className={classes}>{content}</div>;
};

const InstructionCard = ({ icon, title, text, prominent = false }) => (
  <div className={`rounded-[22px] border p-4 sm:rounded-[26px] sm:p-5 ${prominent ? 'border-[#d9c9ae] bg-[#fbf6ee]' : 'border-[#e2dbd1] bg-[#fffdf9]'}`}>
    <div className="flex items-center gap-3"><div className={`flex h-9 w-9 items-center justify-center rounded-full ${prominent ? 'bg-[#171612] text-[#dec69e]' : 'bg-[#f1ebe1] text-[#826c4f]'}`}><Icon name={icon} className="h-4 w-4" /></div><div className="text-[14px] font-bold text-[#211e1a]">{title}</div></div>
    <div className="mt-3 whitespace-pre-line text-[12px] leading-6 text-[#746d63] sm:text-[13px]">{text}</div>
  </div>
);

const ReviewCard = ({ label, value, icon }) => (
  <div className="rounded-[18px] border border-[#e4ddd3] bg-white p-3.5"><div className="flex items-center gap-2 text-[#92764f]"><Icon name={icon} className="h-3.5 w-3.5" /><div className="text-[9px] font-bold uppercase tracking-[0.12em]">{label}</div></div><div className="mt-2 line-clamp-2 text-[13px] font-bold leading-5 text-[#2d2923]">{value}</div></div>
);

const ReadOnlyField = ({ label, value }) => <div><FieldLabel>{label}</FieldLabel><div className="mt-1.5 flex min-h-[52px] items-center rounded-[16px] border border-[#e4ddd3] bg-[#f7f3ed] px-4 text-[15px] font-medium text-[#5e574e]">{value || '—'}</div></div>;
const Field = ({ label, value, onChange, placeholder, type = 'text', inputMode }) => <label className="block"><FieldLabel>{label}</FieldLabel><input type={type} inputMode={inputMode} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputClass} /></label>;
const FieldLabel = ({ children }) => <span className="block text-[11px] font-bold text-[#5b554d] sm:text-xs">{children}</span>;
const inputClass = 'mt-1.5 min-h-[52px] w-full rounded-[16px] border border-[#dcd3c7] bg-white px-4 py-3 text-[16px] font-medium text-[#28241f] outline-none transition placeholder:text-[#b0a79b] focus:border-[#9c7d55] focus:ring-2 focus:ring-[#bfa77f]/20 sm:text-sm';

const SectionHeading = ({ eyebrow, title, subtitle, compact = false }) => (
  <div><div className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#94784f]">{eyebrow}</div><h2 className={`${compact ? 'mt-1 text-xl sm:text-2xl' : 'mt-1.5 text-[25px] sm:text-3xl'} font-bold leading-tight tracking-[-0.04em] text-[#171612]`}>{title}</h2>{subtitle && <p className="mt-1.5 max-w-xl text-[12px] leading-5 text-[#7b746b] sm:text-sm sm:leading-6">{subtitle}</p>}</div>
);

const EmptyState = ({ title, text }) => <div className="rounded-[22px] border border-[#e0d8cd] bg-[#fffdf9] p-7 text-center"><div className="text-[15px] font-bold text-[#1d1b18]">{title}</div><div className="mt-2 text-[12px] leading-5 text-[#837b70]">{text}</div></div>;
const LoadingScreen = () => <div className="flex min-h-[80dvh] items-center justify-center"><div className="text-center"><SemLogo className="mx-auto h-9 w-auto max-w-[142px]" /><div className="mt-5 text-[13px] font-bold text-[#5f584f]">Preparing your stay…</div></div></div>;
const ErrorScreen = ({ message }) => <div className="mx-3 mt-20 rounded-[24px] border border-rose-200 bg-white p-6 text-center shadow-lg sm:mx-auto sm:max-w-xl sm:rounded-[28px] sm:p-7"><div className="text-lg font-bold text-[#171612]">This private link is unavailable</div><div className="mt-3 text-[13px] leading-6 text-rose-700">{message}</div></div>;

const Status = ({ status, dark = false }) => {
  const key = String(status || 'requested').toLowerCase();
  const label = key.replaceAll('_', ' ');
  const classes = dark
    ? (['completed', 'confirmed'].includes(key) ? 'bg-emerald-400/15 text-emerald-200' : key === 'cancelled' || key === 'declined' ? 'bg-rose-400/15 text-rose-200' : 'bg-white/10 text-white/65')
    : (['completed', 'confirmed'].includes(key) ? 'bg-emerald-100 text-emerald-700' : key === 'cancelled' || key === 'declined' ? 'bg-rose-100 text-rose-700' : 'bg-[#f0e9de] text-[#745e42]');
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.07em] ${classes}`}>{label}</span>;
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
    copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
    ticket: <><path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z"/><path d="M12 8v2M12 14v2"/></>,
  };
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.home}</svg>;
};

const PortalFrame = ({ children, hasMobileNav = false }) => (
  <div className="min-h-screen bg-[#f4f0e9] font-sans text-[#171612]" style={{ fontFamily: '"Google Sans", sans-serif' }}>
    <main className={`mx-auto w-full max-w-[1280px] sm:px-5 sm:py-5 lg:px-8 lg:py-8 ${hasMobileNav ? 'pb-28 sm:pb-8' : 'pb-7'}`}>{children}</main>
    <footer className={`${hasMobileNav ? 'pb-28 sm:pb-8' : 'pb-8'} pt-7 text-center sm:pt-10`}><SemLogo className="mx-auto h-7 w-auto max-w-[120px]" /><div className="mt-2 text-[10px] text-[#aaa095]">Your private guest experience</div></footer>
  </div>
);

const prettyMethod = (value) => ({ car: 'Car', taxi: 'Taxi', 'airport-transfer': 'Airport transfer', 'public-transport': 'Public transport', other: 'Other' }[value] || value || 'Not provided');
const formatStayValue = (date, time) => [date, time].filter(Boolean).join(' · ') || 'To be confirmed';
const formatDateTime = (value) => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(); };
const serviceIcon = (category) => ({ mobility: 'car', stay: 'home', housekeeping: 'sparkles', experience: 'concierge', service: 'sparkles' }[category] || 'sparkles');

export default GuestPortalPage;

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';

const steps = ['Your stay', 'Arrival & departure', 'Add-ons', 'Review'];

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

  useEffect(() => {
    let active = true;
    api.get(`/guest-portal/${token}`)
      .then((response) => {
        if (!active) return;
        const data = response.data.data;
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
      })
      .catch((requestError) => setError(requestError.response?.data?.message || 'Guest portal could not be loaded.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  const completed = portal?.status === 'completed';
  const showWizard = forceCheckin && !completed;
  const firstName = useMemo(() => String(portal?.reservation?.guestName || 'Guest').split(/\s+/)[0], [portal]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleAddon = (addon) => {
    setForm((current) => {
      const exists = current.addonRequests.some((item) => item.id === addon.id);
      return {
        ...current,
        addonRequests: exists
          ? current.addonRequests.filter((item) => item.id !== addon.id)
          : [...current.addonRequests, addon],
      };
    });
  };

  const complete = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await api.put(`/guest-portal/${token}/check-in`, form);
      setPortal(response.data.data);
      navigate(`/guest/${token}`, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Check-in could not be completed.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PortalFrame><div className="py-20 text-center text-slate-500">Loading your stay…</div></PortalFrame>;
  if (error && !portal) return <PortalFrame><div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">{error}</div></PortalFrame>;

  const reservation = portal.reservation || {};

  return (
    <PortalFrame>
      <section className="overflow-hidden rounded-3xl bg-slate-900 text-white shadow-xl">
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 px-6 py-9 sm:px-9">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">SEM Guest Experience</div>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">Welcome {firstName}!</h1>
          <p className="mt-2 text-sm text-slate-300">Everything you need for a smooth stay, in one secure place.</p>
        </div>
      </section>

      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xl font-black text-slate-950">{reservation.propertyName}</div>
            <div className="mt-1 text-sm text-slate-500">{reservation.propertyCity || 'Your SEM property'}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <StayDate label="Check-in" value={reservation.arrivalDate} />
            <StayDate label="Check-out" value={reservation.departureDate} />
          </div>
        </div>
      </section>

      {showWizard ? (
        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-7 grid grid-cols-4 gap-2">
            {steps.map((label, index) => (
              <div key={label}>
                <div className={`h-1.5 rounded-full ${index <= step ? 'bg-sky-500' : 'bg-slate-200'}`} />
                <div className={`mt-2 hidden text-[11px] font-bold sm:block ${index === step ? 'text-sky-700' : 'text-slate-400'}`}>{label}</div>
              </div>
            ))}
          </div>

          {step === 0 && (
            <div className="space-y-5">
              <SectionTitle title="Your stay" subtitle="Please confirm your contact information." />
              <ReadOnlyField label="Guest" value={reservation.guestName} />
              <ReadOnlyField label="Email" value={reservation.guestEmail || 'Not provided'} />
              <Field label="Mobile phone" value={form.guestPhone} onChange={(value) => update('guestPhone', value)} placeholder="+30…" />
              <ReadOnlyField label="Room" value={[reservation.roomNumber, reservation.roomType].filter(Boolean).join(' · ')} />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <SectionTitle title="Arrival & departure" subtitle="Help reception prepare for your arrival and departure." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field type="time" label="Expected check-in time" value={form.arrivalTime} onChange={(value) => update('arrivalTime', value)} />
                <Field type="time" label="Expected check-out time" value={form.departureTime} onChange={(value) => update('departureTime', value)} />
              </div>
              <label className="block">
                <span className="text-sm font-bold text-slate-800">How are you arriving?</span>
                <select value={form.arrivalMethod} onChange={(event) => update('arrivalMethod', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500">
                  <option value="">Select</option>
                  <option value="car">Car</option>
                  <option value="taxi">Taxi</option>
                  <option value="airport-transfer">Airport transfer</option>
                  <option value="public-transport">Public transport</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <Field label="Flight number (optional)" value={form.flightNumber} onChange={(value) => update('flightNumber', value)} placeholder="A3 123" />
              <label className="block">
                <span className="text-sm font-bold text-slate-800">Special requests</span>
                <textarea value={form.specialRequests} onChange={(event) => update('specialRequests', event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500" placeholder="Anything reception should know?" />
              </label>
            </div>
          )}

          {step === 2 && (
            <div>
              <SectionTitle title="Enhance your stay" subtitle="Choose any optional services you would like to request." />
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {(portal.addons || []).map((addon) => {
                  const selected = form.addonRequests.some((item) => item.id === addon.id);
                  return (
                    <button key={addon.id} type="button" onClick={() => toggleAddon(addon)} className={`rounded-2xl border p-4 text-left transition ${selected ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100' : 'border-slate-200 hover:border-sky-300'}`}>
                      <div className="text-base font-black text-slate-950">{addon.name}</div>
                      <div className="mt-2 min-h-10 text-xs leading-5 text-slate-500">{addon.description}</div>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-800">{addon.priceLabel}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selected ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{selected ? 'Selected' : 'Add'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <SectionTitle title="Review & complete" subtitle="Confirm the information below to finish online check-in." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Summary label="Expected arrival" value={form.arrivalTime || 'Required'} />
                <Summary label="Expected departure" value={form.departureTime || 'Required'} />
                <Summary label="Arrival method" value={form.arrivalMethod || 'Not specified'} />
                <Summary label="Add-ons" value={form.addonRequests.length ? form.addonRequests.map((item) => item.name).join(', ') : 'None'} />
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <input type="checkbox" checked={form.termsAccepted} onChange={(event) => update('termsAccepted', event.target.checked)} className="mt-1 h-4 w-4" />
                <span className="text-sm leading-6 text-slate-600">I confirm that the information is correct and I accept the property house rules and guest terms.</span>
              </label>
            </div>
          )}

          {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-30">Back</button>
            {step < steps.length - 1 ? (
              <button type="button" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))} className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-700">Continue</button>
            ) : (
              <button type="button" onClick={complete} disabled={saving} className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-60">{saving ? 'Completing…' : 'Complete check-in'}</button>
            )}
          </div>
        </section>
      ) : (
        <GuestHome portal={portal} token={token} />
      )}
    </PortalFrame>
  );
};

const GuestHome = ({ portal, token }) => {
  const reservation = portal.reservation || {};
  return (
    <>
      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-black text-slate-950">Guest Portal</div>
            <div className="mt-1 text-sm text-slate-500">Your secure stay information and services.</div>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-black ${portal.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{portal.status === 'completed' ? 'Online check-in complete' : 'Check-in pending'}</span>
        </div>
        {portal.status !== 'completed' && (
          <a href={`/guest/${token}/check-in`} className="mt-5 inline-flex rounded-xl bg-sky-600 px-5 py-3 text-sm font-bold text-white">Complete online check-in</a>
        )}
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <PortalCard icon="🏠" title="Self Check-in Instructions" text="Instructions will appear here before check-in." locked />
        <PortalCard icon="☎️" title="Contact & Assistance" text="Contact the SEM reception team for help during your stay." />
        <PortalCard icon="📶" title="Wi-Fi Information" text="Wi-Fi details will become available before arrival." locked />
        <PortalCard icon="🅿️" title="Parking Information" text="Parking instructions for your property will appear here." />
        <PortalCard icon="🚿" title="Hot Water Information" text="Property-specific hot water information will appear here." />
        <PortalCard icon="🚪" title="Check-out Instructions" text={`Expected departure: ${portal.submitted?.departureTime || reservation.departureTime || 'not provided'}.`} />
      </section>

      {(portal.addonRequests || []).length > 0 && (
        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="text-lg font-black text-slate-950">Your requests</div>
          <div className="mt-4 space-y-3">
            {portal.addonRequests.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div className="font-bold text-slate-900">{item.name}</div>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">Requested</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
};

const PortalFrame = ({ children }) => (
  <div className="min-h-screen bg-slate-100 px-4 py-5 sm:px-6 sm:py-9">
    <main className="mx-auto w-full max-w-5xl">{children}</main>
    <footer className="mx-auto mt-8 max-w-5xl pb-5 text-center text-xs text-slate-400">Powered by SEM Estate & Mobility</footer>
  </div>
);

const SectionTitle = ({ title, subtitle }) => <div><h2 className="text-2xl font-black text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>;
const StayDate = ({ label, value }) => <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 font-black text-slate-900">{value || '—'}</div></div>;
const ReadOnlyField = ({ label, value }) => <div><div className="text-sm font-bold text-slate-800">{label}</div><div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{value || '—'}</div></div>;
const Field = ({ label, value, onChange, placeholder, type = 'text' }) => <label className="block"><span className="text-sm font-bold text-slate-800">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500" /></label>;
const Summary = ({ label, value }) => <div className="rounded-2xl border border-slate-200 p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-sm font-bold text-slate-900">{value}</div></div>;
const PortalCard = ({ icon, title, text, locked = false }) => <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><div className="text-2xl">{icon}</div><div><div className="flex items-center gap-2 font-black text-slate-950">{title}{locked && <span className="text-xs text-slate-400">🔒</span>}</div><div className="mt-2 text-xs leading-5 text-slate-500">{text}</div></div></div></div>;

export default GuestPortalPage;

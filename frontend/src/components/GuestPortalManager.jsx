import React, { useEffect, useState } from 'react';
import api from '../services/api';

const blankInfo = {
  roomAccessCode: '', buildingAccessCode: '', wifiName: '', wifiPassword: '', propertyAddress: '',
  checkinInstructions: '', checkoutInstructions: '', parkingInfo: '', hotWaterInfo: '', emergencyContact: '',
  supportPhone: '', usefulInfo: '', accessReleased: false,
};

const GuestPortalManager = ({ reservation, instructionResult, onSend, sending, sendError }) => {
  const [data, setData] = useState(null);
  const [stayInfo, setStayInfo] = useState(blankInfo);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    if (!reservation?.id) return;
    setLoading(true); setError('');
    try {
      const response = await api.get(`/guest-portal/reservations/${reservation.id}/manage`);
      setData(response.data.data);
      setStayInfo({ ...blankInfo, ...(response.data.data.stayInfo || {}) });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Guest Portal data could not be loaded.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [reservation?.id]);

  const save = async () => {
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await api.put(`/guest-portal/reservations/${reservation.id}/stay-info`, stayInfo);
      setStayInfo({ ...blankInfo, ...response.data.data });
      setMessage('Guest stay information saved.');
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Stay information could not be saved.');
    } finally { setSaving(false); }
  };

  const updateRequest = async (requestId, status) => {
    try {
      await api.patch(`/guest-portal/service-requests/${requestId}`, { status });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Request status could not be updated.');
    }
  };

  const copyLink = async () => {
    if (!instructionResult?.portalUrl) return;
    try { await navigator.clipboard.writeText(instructionResult.portalUrl); }
    catch { window.prompt('Copy guest portal link:', instructionResult.portalUrl); }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-black text-blue-950">Guest Portal</div>
            <div className="mt-1 text-xs leading-5 text-blue-800">Online check-in, secure room access, Wi-Fi, transfers and in-stay services from one private mini-site.</div>
          </div>
          {data?.portal?.status && <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700">{data.portal.status}</span>}
        </div>
        <button onClick={onSend} disabled={sending || !reservation.guestEmail || reservation.status === 'cancelled'} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
          {sending ? 'Sending…' : data?.portal ? 'Send / refresh secure link' : 'Send Guest Portal'}
        </button>
        {sendError && <div className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs text-rose-700">{sendError}</div>}
        {instructionResult && (
          <div className="mt-3 rounded-xl border border-blue-200 bg-white p-3">
            <div className={`text-xs font-bold ${instructionResult.emailSent ? 'text-emerald-700' : 'text-amber-700'}`}>{instructionResult.emailSent ? 'Email sent successfully.' : instructionResult.message || 'Secure link created.'}</div>
            <div className="mt-2 break-all text-[11px] text-slate-500">{instructionResult.portalUrl}</div>
            <div className="mt-3 flex gap-2"><button onClick={copyLink} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">Copy link</button><a href={instructionResult.portalUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-bold text-blue-700">Open portal</a></div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between"><div><div className="text-sm font-black text-slate-950">Room & property access</div><div className="mt-1 text-xs text-slate-500">Save private stay information. Codes stay hidden from the guest until you release access.</div></div>{loading && <span className="text-xs text-slate-400">Loading…</span>}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Room access code" value={stayInfo.roomAccessCode} onChange={(v) => setStayInfo({ ...stayInfo, roomAccessCode: v })} />
          <Field label="Building access code" value={stayInfo.buildingAccessCode} onChange={(v) => setStayInfo({ ...stayInfo, buildingAccessCode: v })} />
          <Field label="Wi-Fi name" value={stayInfo.wifiName} onChange={(v) => setStayInfo({ ...stayInfo, wifiName: v })} />
          <Field label="Wi-Fi password" value={stayInfo.wifiPassword} onChange={(v) => setStayInfo({ ...stayInfo, wifiPassword: v })} />
          <div className="sm:col-span-2"><Field label="Property address" value={stayInfo.propertyAddress} onChange={(v) => setStayInfo({ ...stayInfo, propertyAddress: v })} /></div>
          <Field label="SEM support phone" value={stayInfo.supportPhone} onChange={(v) => setStayInfo({ ...stayInfo, supportPhone: v })} />
          <Field label="Emergency contact" value={stayInfo.emergencyContact} onChange={(v) => setStayInfo({ ...stayInfo, emergencyContact: v })} />
        </div>
        <div className="mt-3 space-y-3">
          <Area label="Self check-in instructions" value={stayInfo.checkinInstructions} onChange={(v) => setStayInfo({ ...stayInfo, checkinInstructions: v })} />
          <Area label="Check-out instructions" value={stayInfo.checkoutInstructions} onChange={(v) => setStayInfo({ ...stayInfo, checkoutInstructions: v })} />
          <Area label="Parking information" value={stayInfo.parkingInfo} onChange={(v) => setStayInfo({ ...stayInfo, parkingInfo: v })} />
          <Area label="Hot water / property operation" value={stayInfo.hotWaterInfo} onChange={(v) => setStayInfo({ ...stayInfo, hotWaterInfo: v })} />
          <Area label="Other useful information" value={stayInfo.usefulInfo} onChange={(v) => setStayInfo({ ...stayInfo, usefulInfo: v })} />
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><input type="checkbox" className="mt-1" checked={Boolean(stayInfo.accessReleased)} onChange={(e) => setStayInfo({ ...stayInfo, accessReleased: e.target.checked })} /><span><span className="block text-sm font-bold text-amber-900">Release access details to guest</span><span className="mt-0.5 block text-xs text-amber-700">When enabled, room/building codes, Wi-Fi credentials and self check-in instructions become visible in the guest portal.</span></span></label>
        {(message || error) && <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{error || message}</div>}
        <button onClick={save} disabled={saving} className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">{saving ? 'Saving…' : 'Save stay information'}</button>
      </section>

      {(data?.serviceRequests?.length > 0 || data?.transfers?.length > 0) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-black text-slate-950">Guest requests</div>
          <div className="mt-3 space-y-3">
            {data.serviceRequests?.map((item) => (
              <div key={`s-${item.id}`} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-slate-900">{item.serviceName}</div><div className="mt-1 text-xs text-slate-500">{item.requestedFor ? new Date(item.requestedFor).toLocaleString() : 'No schedule'}{item.guestNotes ? ` · ${item.guestNotes}` : ''}</div></div><select value={item.status} onChange={(e) => updateRequest(item.id, e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"><option value="requested">Requested</option><option value="confirmed">Confirmed</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="declined">Declined</option><option value="cancelled">Cancelled</option></select></div>
              </div>
            ))}
            {data.transfers?.map((item) => <div key={`t-${item.id}`} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-slate-900">Transfer · {item.pickupLocation} → {item.destination}</div><div className="mt-1 text-xs text-slate-500">{new Date(item.scheduledAt).toLocaleString()} · {item.passengers} pax</div></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">{item.status}</span></div></div>)}
          </div>
        </section>
      )}
    </div>
  );
};

const Field = ({ label, value, onChange }) => <label className="block"><span className="text-xs font-semibold text-slate-600">{label}</span><input value={value || ''} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" /></label>;
const Area = ({ label, value, onChange }) => <label className="block"><span className="text-xs font-semibold text-slate-600">{label}</span><textarea value={value || ''} onChange={(e) => onChange(e.target.value)} rows={3} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" /></label>;

export default GuestPortalManager;

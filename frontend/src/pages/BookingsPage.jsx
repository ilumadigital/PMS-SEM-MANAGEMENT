import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

import {
  cleaningTasks,
  properties,
  rooms,
  shuttleRequests,
} from '../data/semDemoData';

import {
  getPropertyById,
  getRoomById,
} from '../utils/semOperationsMetrics';

const BookingsPage = () => {
  const [reservations, setReservations] = useState([]);
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedReservationId, setSelectedReservationId] = useState(null);

  const loadCloudbedsReservations = useCallback(async () => {
    try {
      setLoadError('');
      const statusResponse = await api.get('/integrations/cloudbeds/status');
      setIntegrationStatus(statusResponse.data);

      if (!statusResponse.data.connected) {
        setReservations([]);
        setSelectedReservationId(null);
        setLoadError('Cloudbeds sandbox is not connected yet.');
        return;
      }

      const reservationsResponse = await api.get('/integrations/cloudbeds/reservations');
      const liveReservations = reservationsResponse.data.reservations || [];
      setReservations(liveReservations);
      setIntegrationStatus((current) => ({
        ...(current || {}),
        ...reservationsResponse.data,
        connected: true,
      }));
      setSelectedReservationId((current) =>
        current && liveReservations.some((item) => item.id === current)
          ? current
          : liveReservations[0]?.id || null
      );
    } catch (error) {
      setLoadError(
        error.response?.data?.message ||
        error.message ||
        'Could not load Cloudbeds sandbox reservations.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCloudbedsReservations();
    const interval = window.setInterval(loadCloudbedsReservations, 60000);
    return () => window.clearInterval(interval);
  }, [loadCloudbedsReservations]);

  const syncEvents = [
    {
      id: 'cloudbeds-sandbox',
      provider: 'Cloudbeds Sandbox',
      lastSyncAt: integrationStatus?.lastSyncAt || 'live request',
      status: integrationStatus?.connected && !loadError ? 'healthy' : 'review',
    },
  ];

  const enrichedReservations = useMemo(() => {
    return reservations.map((reservation) => {
      const property = reservation.property || getPropertyById(properties, reservation.propertyId);
      const room = reservation.room || getRoomById(rooms, reservation.roomId);
      const cleaningTask = cleaningTasks.find(
        (task) => task.reservationId === reservation.id
      );
      const shuttleRequest = shuttleRequests.find(
        (request) => request.id === reservation.shuttleRequestId
      );

      return {
        ...reservation,
        property,
        room,
        cleaningTask,
        shuttleRequest,
      };
    });
  }, [reservations]);

  const filteredReservations = enrichedReservations.filter((reservation) => {
    const term = searchTerm.toLowerCase();

    const matchesSearch =
      String(reservation.guestName || '').toLowerCase().includes(term) ||
      String(reservation.id || '').toLowerCase().includes(term) ||
      String(reservation.sourceReference || '').toLowerCase().includes(term) ||
      String(reservation.roomNumber || '').toLowerCase().includes(term) ||
      String(reservation.property?.name || '').toLowerCase().includes(term);

    const matchesSource =
      sourceFilter === 'all' || reservation.source === sourceFilter;

    const matchesStatus =
      statusFilter === 'all' ||
      reservation.status === statusFilter ||
      (statusFilter === 'missing_info' && reservation.missingFields.length > 0) ||
      (statusFilter === 'shuttle' && reservation.shuttleRequested);

    return matchesSearch && matchesSource && matchesStatus;
  });

  const selectedReservation =
    enrichedReservations.find((reservation) => reservation.id === selectedReservationId) ||
    enrichedReservations[0];

  const summary = {
    total: enrichedReservations.length,
    cloudbeds: enrichedReservations.filter((item) => item.source === 'cloudbeds').length,
    hosthub: enrichedReservations.filter((item) => item.source === 'hosthub').length,
    missingInfo: enrichedReservations.filter((item) => item.missingFields.length > 0).length,
    modified: enrichedReservations.filter((item) => item.syncEvent === 'modified_reservation').length,
    shuttle: enrichedReservations.filter((item) => item.shuttleRequested).length,
  };

  const updateReservationField = async (reservationId, field, value) => {
    setReservations((currentReservations) =>
      currentReservations.map((reservation) =>
        reservation.id === reservationId
          ? {
              ...reservation,
              [field]: value,
              missingFields: getUpdatedMissingFields(reservation, field, value),
            }
          : reservation
      )
    );

    try {
      await api.put(
        `/integrations/cloudbeds/reservations/${encodeURIComponent(reservationId)}/operations`,
        { [field]: value }
      );
    } catch (error) {
      console.error('Could not persist SEM reception field:', error);
    }
  };

  const connectCloudbeds = () => {
    const apiOrigin = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    window.location.assign(`${apiOrigin}/api/integrations/cloudbeds/connect`);
  };

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-[#C9A46A]/20 bg-[#111110] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 opacity-[0.045] bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_0)] [background-size:24px_24px]" />
        <div className="absolute right-[-140px] top-[-140px] h-[420px] w-[420px] rounded-full bg-[#C9A46A]/15 blur-3xl" />

        <div className="relative grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-8 p-8 xl:p-10">
          <div>
            <div className="inline-flex rounded-full border border-[#C9A46A]/25 bg-[#C9A46A]/8 px-4 py-2">
              <span className="text-[10px] uppercase tracking-[0.32em] text-[#C9A46A] font-bold">
                Live Reservations · Cloudbeds Sandbox
              </span>
            </div>

            <h1 className="mt-8 max-w-4xl text-5xl xl:text-6xl font-semibold tracking-[-0.055em] leading-[0.95] text-white">
              Every reservation,
              <span className="block text-[#C9A46A]">one operational record.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-[#BEB7AD]">
              Live reservation control using only the connected Cloudbeds test account. Changes in the test account are refreshed every 60 seconds;
              missing guest details, linked room readiness, shuttle requests and reception notes.
            </p>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-3">
              <HeroMetric label="Total records" value={summary.total} />
              <HeroMetric label="Cloudbeds" value={summary.cloudbeds} />
              <HeroMetric label="Sandbox properties" value={integrationStatus?.properties?.length || 0} />
              <HeroMetric label="Missing info" value={summary.missingInfo} tone="warning" />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-[#090909]/70 p-6 backdrop-blur">
            <div className="flex items-start justify-between border-b border-white/[0.06] pb-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#8F8A82]">
                  Sync monitor
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  Source health
                </div>
              </div>

              <StatusPill status={syncEvents.some((event) => event.status !== 'healthy') ? 'Review' : 'Healthy'} />
            </div>

            <div className="mt-6 space-y-4">
              {syncEvents.map((event) => (
                <SyncLine key={event.id} event={event} />
              ))}
            </div>

            <div className="mt-7 rounded-2xl border border-[#C9A46A]/15 bg-[#C9A46A]/8 p-5">
              <div className="text-[10px] uppercase tracking-[0.26em] text-[#C9A46A] font-bold">
                Booking control note
              </div>
              <p className="mt-3 text-sm leading-6 text-[#E8E1D5]">
                Reception should clear missing arrival/departure times before automated guest
                communication and shuttle scheduling.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <OperationsCard
          label="Cloudbeds live"
          value={summary.cloudbeds}
          description="Current records returned by the Cloudbeds sandbox"
        />
        <OperationsCard
          label="Shuttle linked"
          value={summary.shuttle}
          description="Reservations with transfer requirements"
        />
        <OperationsCard
          label="Missing guest data"
          value={summary.missingInfo}
          description="Arrival/departure times or shuttle assignments required"
        />
        <OperationsCard
          label="Visible results"
          value={filteredReservations.length}
          description="Records matching current filters"
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_430px] gap-6">
        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
          <div className="space-y-5 px-6 py-5 border-b border-white/[0.05]">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
                  Reservations
                </div>
                <h2 className="mt-2 text-xl font-semibold text-white tracking-[-0.02em]">
                  Unified booking inbox
                </h2>
              </div>

              <button onClick={integrationStatus?.connected ? loadCloudbedsReservations : connectCloudbeds} className="rounded-full border border-[#C9A46A]/25 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-[#C9A46A] hover:bg-[#C9A46A]/10 transition-all">
                {integrationStatus?.connected ? 'Refresh Cloudbeds' : 'Connect Sandbox'}
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_auto] gap-3">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#090909] px-5 py-3 text-sm text-white outline-none placeholder:text-[#6F6B66] focus:border-[#C9A46A]/40"
                placeholder="Search by guest, booking ID, source ref, room or property..."
              />

              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
                className="rounded-2xl border border-white/10 bg-[#090909] px-5 py-3 text-sm text-white outline-none focus:border-[#C9A46A]/40"
              >
                <option value="all">All sources</option>
                <option value="cloudbeds">Cloudbeds</option>
                
              </select>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-2xl border border-white/10 bg-[#090909] px-5 py-3 text-sm text-white outline-none focus:border-[#C9A46A]/40"
              >
                <option value="all">All statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending_confirmation">Pending confirmation</option>
                <option value="in_house">In house</option>
                <option value="missing_info">Missing info</option>
                <option value="shuttle">With shuttle</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {filteredReservations.map((reservation) => (
              <ReservationRow
                key={reservation.id}
                reservation={reservation}
                active={reservation.id === selectedReservation?.id}
                onSelect={() => setSelectedReservationId(reservation.id)}
              />
            ))}

            {filteredReservations.length === 0 && (
              <div className="p-10 text-center">
                <div className="text-base font-semibold text-white">
                  {loading ? 'Loading Cloudbeds sandbox…' : 'No reservations found.'}
                </div>
                <p className="mt-3 text-sm text-[#8F8A82]">
                  {loadError || 'Change filters or search term to view more records.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {selectedReservation && (
          <ReservationDetailPanel
            reservation={selectedReservation}
            onUpdateField={updateReservationField}
          />
        )}
      </section>
    </div>
  );
};

const ReservationRow = ({ reservation, active, onSelect }) => (
  <button
    onClick={onSelect}
    className={[
      'w-full text-left px-6 py-5 transition-all',
      active ? 'bg-[#C9A46A]/8' : 'hover:bg-white/[0.025]',
    ].join(' ')}
  >
    <div className="grid grid-cols-1 2xl:grid-cols-[1fr_160px_160px_190px_120px] gap-5 items-start 2xl:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={reservation.source} />
          <StatusPill status={reservation.status} />
          {reservation.syncEvent === 'modified_reservation' && (
            <StatusPill status="modified" />
          )}
          {reservation.missingFields.length > 0 && (
            <StatusPill status="missing info" />
          )}
        </div>

        <div className="mt-4 text-lg font-semibold text-white">
          {reservation.guestName}
        </div>

        <div className="mt-1 text-sm text-[#8F8A82]">
          {reservation.id} · {reservation.sourceReference} · Room {reservation.roomNumber}
        </div>

        <p className="mt-3 text-sm leading-6 text-[#BEB7AD]">
          {reservation.guestNotes || 'No reception notes yet.'}
        </p>
      </div>

      <SmallInfo label="Arrival" value={`${reservation.arrivalDate} · ${reservation.arrivalTime || 'Missing'}`} />
      <SmallInfo label="Departure" value={`${reservation.departureDate} · ${reservation.departureTime || 'Missing'}`} />

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
          Property
        </div>
        <div className="text-sm font-semibold text-white">
          {reservation.property?.name}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
          Shuttle
        </div>
        <StatusPill status={reservation.shuttleRequest?.status || (reservation.shuttleRequested ? 'requested' : 'none')} />
      </div>
    </div>
  </button>
);

const ReservationDetailPanel = ({ reservation, onUpdateField }) => {
  const [arrivalTime, setArrivalTime] = useState(reservation.arrivalTime || '');
  const [departureTime, setDepartureTime] = useState(reservation.departureTime || '');
  const [guestNotes, setGuestNotes] = useState(reservation.guestNotes || '');

  const saveReceptionDetails = () => {
    onUpdateField(reservation.id, 'arrivalTime', arrivalTime);
    onUpdateField(reservation.id, 'departureTime', departureTime);
    onUpdateField(reservation.id, 'guestNotes', guestNotes);
  };

  return (
    <aside className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
      <div className="px-6 py-5 border-b border-white/[0.05]">
        <div className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
          Reservation detail
        </div>

        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
          {reservation.guestName}
        </h2>

        <div className="mt-3 flex flex-wrap gap-2">
          <StatusPill status={reservation.source} />
          <StatusPill status={reservation.status} />
          <StatusPill status={reservation.syncStatus} />
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <DetailBox label="Booking ID" value={reservation.id} />
          <DetailBox label="Source ref" value={reservation.sourceReference} />
          <DetailBox label="Property" value={reservation.property?.name} />
          <DetailBox label="Room" value={reservation.roomNumber} />
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[#C9A46A] font-bold">
            Reception data entry
          </div>

          <div className="mt-5 space-y-4">
            <Field
              label="Arrival time"
              value={arrivalTime}
              onChange={setArrivalTime}
              placeholder="HH:MM"
            />
            <Field
              label="Departure time"
              value={departureTime}
              onChange={setDepartureTime}
              placeholder="HH:MM"
            />

            <div>
              <label className="block text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
                Guest notes
              </label>
              <textarea
                value={guestNotes}
                onChange={(event) => setGuestNotes(event.target.value)}
                rows={5}
                className="w-full resize-none rounded-2xl border border-white/10 bg-[#111110] px-4 py-3 text-sm text-white outline-none placeholder:text-[#6F6B66] focus:border-[#C9A46A]/40"
                placeholder="Add guest notes, requests or operational comments..."
              />
            </div>

            <button
              onClick={saveReceptionDetails}
              className="w-full rounded-2xl bg-[#C9A46A] px-5 py-4 text-sm font-bold uppercase tracking-[0.2em] text-[#090909] transition-all hover:bg-[#D7B984]"
            >
              Save reception details
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[#C9A46A] font-bold">
            Special requests
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {reservation.specialRequests.length > 0 ? (
              reservation.specialRequests.map((request) => (
                <StatusPill key={request} status={request} />
              ))
            ) : (
              <span className="text-sm text-[#8F8A82]">No special requests.</span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-[#090909]/60 p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[#C9A46A] font-bold">
            Linked operations
          </div>

          <div className="mt-5 space-y-4">
            <LinkedOperation
              label="Room status"
              value={reservation.room?.housekeepingStatus || 'not tracked'}
            />
            <LinkedOperation
              label="Cleaning task"
              value={reservation.cleaningTask?.status || 'not assigned'}
            />
            <LinkedOperation
              label="Shuttle"
              value={reservation.shuttleRequest?.status || (reservation.shuttleRequested ? 'requested' : 'none')}
            />
          </div>
        </div>

        {reservation.missingFields.length > 0 && (
          <div className="rounded-2xl border border-[#F0D6A5]/25 bg-[#F0D6A5]/10 p-5">
            <div className="text-[10px] uppercase tracking-[0.24em] text-[#F0D6A5] font-bold">
              Missing information
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {reservation.missingFields.map((field) => (
                <StatusPill key={field} status={field} />
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

const SyncLine = ({ event }) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="text-sm font-semibold text-white">{event.provider}</div>
      <div className="mt-1 text-xs text-[#8F8A82]">
        Last sync {event.lastSyncAt}
      </div>
    </div>
    <StatusPill status={event.status} />
  </div>
);

const HeroMetric = ({ label, value, tone }) => (
  <div className="rounded-2xl border border-white/[0.07] bg-[#090909]/60 px-5 py-4">
    <div className="text-[10px] uppercase tracking-[0.24em] text-[#8F8A82]">
      {label}
    </div>
    <div
      className={[
        'mt-2 text-sm font-semibold',
        tone === 'warning' ? 'text-[#D9B381]' : 'text-white',
      ].join(' ')}
    >
      {value}
    </div>
  </div>
);

const OperationsCard = ({ label, value, description }) => (
  <div className="rounded-[1.5rem] border border-white/[0.07] bg-[#161615] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#C9A46A]/30">
    <div className="text-[10px] uppercase tracking-[0.26em] text-[#8F8A82] font-bold">
      {label}
    </div>
    <div className="mt-8 text-5xl font-semibold tracking-[-0.06em] text-white">
      {value}
    </div>
    <p className="mt-5 text-sm leading-6 text-[#9E978E]">
      {description}
    </p>
  </div>
);

const SmallInfo = ({ label, value }) => (
  <div>
    <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
      {label}
    </div>
    <div className="text-sm font-semibold text-white">
      {value}
    </div>
  </div>
);

const DetailBox = ({ label, value }) => (
  <div className="rounded-2xl border border-white/[0.06] bg-[#111110] p-4">
    <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82]">
      {label}
    </div>
    <div className="mt-2 text-sm font-semibold text-white">
      {value || '—'}
    </div>
  </div>
);

const Field = ({ label, value, onChange, placeholder }) => (
  <div>
    <label className="block text-[10px] uppercase tracking-[0.22em] text-[#8F8A82] mb-2">
      {label}
    </label>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-2xl border border-white/10 bg-[#111110] px-4 py-3 text-sm text-white outline-none placeholder:text-[#6F6B66] focus:border-[#C9A46A]/40"
      placeholder={placeholder}
    />
  </div>
);

const LinkedOperation = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-sm text-[#9E978E]">{label}</span>
    <StatusPill status={value} />
  </div>
);

const StatusPill = ({ status }) => {
  const normalized = String(status).toLowerCase();

  const isCritical =
    normalized.includes('missing') ||
    normalized.includes('warning') ||
    normalized.includes('unassigned') ||
    normalized.includes('pending_confirmation') ||
    normalized.includes('requested');

  const isWarning =
    normalized.includes('pending') ||
    normalized.includes('modified') ||
    normalized.includes('in_house') ||
    normalized.includes('hosthub');

  const isGood =
    normalized.includes('healthy') ||
    normalized.includes('complete') ||
    normalized.includes('completed') ||
    normalized.includes('ready') ||
    normalized.includes('synced') ||
    normalized.includes('confirmed') ||
    normalized.includes('cloudbeds');

  const classes = isCritical
    ? 'border-[#F0D6A5]/40 bg-[#F0D6A5]/12 text-[#F0D6A5]'
    : isWarning
      ? 'border-[#D9B381]/35 bg-[#D9B381]/10 text-[#D9B381]'
      : isGood
        ? 'border-[#C9A46A]/35 bg-[#C9A46A]/10 text-[#C9A46A]'
        : 'border-white/10 bg-white/[0.04] text-[#BEB7AD]';

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${classes}`}>
      {formatStatus(status)}
    </span>
  );
};

const getUpdatedMissingFields = (reservation, field, value) => {
  const nextMissingFields = reservation.missingFields.filter((missingField) => {
    if (field === 'arrivalTime' && missingField === 'arrivalTime' && value) return false;
    if (field === 'departureTime' && missingField === 'departureTime' && value) return false;

    return true;
  });

  return nextMissingFields;
};

const formatStatus = (status) => {
  return String(status)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export default BookingsPage;
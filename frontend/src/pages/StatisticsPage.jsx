import React, { useContext, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const StatisticsPage = () => {
  const {
    reservations,
    properties,
    rooms,
    status,
    loading,
    error,
    refresh,
    connect,
  } = useContext(CloudbedsDataContext);
  const [selectedScope, setSelectedScope] = useState('all');

  const today = toDateKey(new Date());

  const propertyAnalytics = useMemo(() => {
    return properties.map((property) => {
      const propertyReservations = reservations.filter(
        (reservation) => reservation.propertyId === property.id
      );
      const propertyRooms = rooms.filter((room) => room.propertyId === property.id);

      return {
        property,
        reservations: propertyReservations.length,
        rooms: propertyRooms.length,
        arrivalsToday: propertyReservations.filter(
          (reservation) => reservation.arrivalDate === today
        ).length,
        departuresToday: propertyReservations.filter(
          (reservation) => reservation.departureDate === today
        ).length,
        confirmed: propertyReservations.filter(
          (reservation) => reservation.status === 'confirmed'
        ).length,
        cancelled: propertyReservations.filter(
          (reservation) => reservation.status === 'cancelled'
        ).length,
        missingInfo: propertyReservations.filter(
          (reservation) => (reservation.missingFields || []).length > 0
        ).length,
      };
    });
  }, [properties, reservations, rooms, today]);

  const filtered = selectedScope === 'all'
    ? propertyAnalytics
    : propertyAnalytics.filter((item) => item.property.id === selectedScope);

  const confirmed = reservations.filter((reservation) => reservation.status === 'confirmed').length;
  const cancelled = reservations.filter((reservation) => reservation.status === 'cancelled').length;
  const inHouse = reservations.filter((reservation) => reservation.status === 'in_house').length;
  const missingInfo = reservations.filter(
    (reservation) => (reservation.missingFields || []).length > 0
  ).length;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-[#C9A46A]/20 bg-[#111110] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#C9A46A] font-bold">
              Cloudbeds Sandbox · Live Statistics
            </div>
            <h1 className="mt-4 text-4xl xl:text-5xl font-semibold tracking-[-0.05em] text-white">
              Reservation statistics from Cloudbeds.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#BEB7AD]">
              These figures are calculated only from the reservations returned by the connected Cloudbeds test account.
            </p>
          </div>

          <button
            onClick={status?.connected ? refresh : connect}
            className="rounded-full border border-[#C9A46A]/25 px-5 py-3 text-[10px] uppercase tracking-[0.22em] text-[#C9A46A]"
          >
            {status?.connected ? 'Refresh Cloudbeds' : 'Connect Sandbox'}
          </button>
        </div>

        <div className="mt-8 grid grid-cols-2 xl:grid-cols-5 gap-3">
          <Metric label="Reservations" value={loading ? '…' : reservations.length} />
          <Metric label="Confirmed" value={confirmed} />
          <Metric label="In house" value={inHouse} />
          <Metric label="Cancelled" value={cancelled} />
          <Metric label="Missing info" value={missingInfo} />
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-[#F0D6A5]/25 bg-[#F0D6A5]/10 p-5 text-sm text-[#F0D6A5]">
          {error}
        </div>
      )}

      <section className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 border-b border-white/[0.05]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#C9A46A] font-bold">
              By property
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white">Cloudbeds reservation overview</h2>
          </div>

          <select
            value={selectedScope}
            onChange={(event) => setSelectedScope(event.target.value)}
            className="rounded-2xl border border-white/10 bg-[#090909] px-5 py-3 text-sm text-white outline-none"
          >
            <option value="all">All properties</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>{property.name}</option>
            ))}
          </select>
        </div>

        <div className="divide-y divide-white/[0.05]">
          {filtered.map((item) => (
            <div key={item.property.id} className="grid grid-cols-2 xl:grid-cols-7 gap-5 px-6 py-5">
              <Info label="Property" value={item.property.name} wide />
              <Info label="Reservations" value={item.reservations} />
              <Info label="Rooms seen" value={item.rooms} />
              <Info label="Arrivals today" value={item.arrivalsToday} />
              <Info label="Departures today" value={item.departuresToday} />
              <Info label="Confirmed" value={item.confirmed} />
              <Info label="Missing info" value={item.missingInfo} />
            </div>
          ))}

          {!loading && filtered.length === 0 && (
            <div className="p-10 text-center text-sm text-[#8F8A82]">
              {status?.connected ? 'No property statistics available.' : 'Connect Cloudbeds sandbox first.'}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

const Metric = ({ label, value }) => (
  <div className="rounded-2xl border border-white/[0.07] bg-[#090909]/60 px-5 py-4">
    <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82]">{label}</div>
    <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
  </div>
);

const Info = ({ label, value, wide = false }) => (
  <div className={wide ? 'col-span-2 xl:col-span-1' : ''}>
    <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82]">{label}</div>
    <div className="mt-2 text-sm font-semibold text-white">{value}</div>
  </div>
);

export default StatisticsPage;

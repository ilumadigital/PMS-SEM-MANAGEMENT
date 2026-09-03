import React, { useContext, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';

const RoomsPage = () => {
  const {
    rooms,
    properties,
    reservations,
    loading,
    error,
    status,
    refresh,
    connect,
  } = useContext(CloudbedsDataContext);

  const [propertyFilter, setPropertyFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const enrichedRooms = useMemo(() => {
    return rooms.map((room) => {
      const property = properties.find((item) => item.id === room.propertyId);
      const roomReservations = reservations
        .filter((reservation) => reservation.roomId === room.id)
        .sort((a, b) => String(a.arrivalDate || '').localeCompare(String(b.arrivalDate || '')));

      return {
        ...room,
        property,
        reservations: roomReservations,
        nextReservation: roomReservations.find(
          (reservation) => reservation.id === room.nextArrivalBookingId
        ) || roomReservations[0] || null,
      };
    });
  }, [rooms, properties, reservations]);

  const filteredRooms = enrichedRooms.filter((room) => {
    const matchesProperty = propertyFilter === 'all' || room.propertyId === propertyFilter;
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      String(room.roomNumber || '').toLowerCase().includes(term) ||
      String(room.roomType || '').toLowerCase().includes(term) ||
      String(room.property?.name || '').toLowerCase().includes(term) ||
      String(room.currentGuest || '').toLowerCase().includes(term);

    return matchesProperty && matchesSearch;
  });

  const occupied = enrichedRooms.filter((room) =>
    ['occupied', 'checkout_today'].includes(room.occupancyStatus)
  ).length;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-[#C9A46A]/20 bg-[#111110] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="relative flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#C9A46A] font-bold">
              Cloudbeds Sandbox · Live Rooms
            </div>
            <h1 className="mt-4 text-4xl xl:text-5xl font-semibold tracking-[-0.05em] text-white">
              Rooms from Cloudbeds reservations.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#BEB7AD]">
              Room numbers and room types are derived from the connected Cloudbeds test account.
              Housekeeping status remains local to SEM and is not fabricated from demo data.
            </p>
          </div>

          <button
            onClick={status?.connected ? refresh : connect}
            className="rounded-full border border-[#C9A46A]/25 px-5 py-3 text-[10px] uppercase tracking-[0.22em] text-[#C9A46A]"
          >
            {status?.connected ? 'Refresh Cloudbeds' : 'Connect Sandbox'}
          </button>
        </div>

        <div className="relative mt-8 grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Metric label="Tracked rooms" value={loading ? '…' : enrichedRooms.length} />
          <Metric label="Occupied" value={occupied} />
          <Metric label="Properties" value={properties.length} />
          <Metric label="Reservations" value={reservations.length} />
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-[#F0D6A5]/25 bg-[#F0D6A5]/10 p-5 text-sm text-[#F0D6A5]">
          {error}
        </div>
      )}

      <section className="rounded-[1.75rem] border border-white/[0.07] bg-[#161615] overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-3 p-5 border-b border-white/[0.05]">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="rounded-2xl border border-white/10 bg-[#090909] px-5 py-3 text-sm text-white outline-none"
            placeholder="Search room, room type, guest or property..."
          />
          <select
            value={propertyFilter}
            onChange={(event) => setPropertyFilter(event.target.value)}
            className="rounded-2xl border border-white/10 bg-[#090909] px-5 py-3 text-sm text-white outline-none"
          >
            <option value="all">All properties</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>{property.name}</option>
            ))}
          </select>
        </div>

        <div className="divide-y divide-white/[0.05]">
          {filteredRooms.map((room) => (
            <div key={room.id} className="grid grid-cols-1 xl:grid-cols-[1fr_180px_180px_240px] gap-5 px-6 py-5">
              <div>
                <div className="text-xl font-semibold text-white">Room {room.roomNumber}</div>
                <div className="mt-1 text-sm text-[#8F8A82]">
                  {room.roomType || 'Room type not returned'} · {room.property?.name || 'Cloudbeds property'}
                </div>
              </div>
              <Info label="Occupancy" value={formatStatus(room.occupancyStatus)} />
              <Info label="Current guest" value={room.currentGuest || '—'} />
              <Info
                label="Next booking"
                value={
                  room.nextReservation
                    ? `${room.nextReservation.guestName} · ${room.nextReservation.arrivalDate}`
                    : '—'
                }
              />
            </div>
          ))}

          {!loading && filteredRooms.length === 0 && (
            <div className="p-10 text-center text-sm text-[#8F8A82]">
              {status?.connected ? 'No rooms found in the Cloudbeds reservation data.' : 'Connect Cloudbeds sandbox first.'}
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

const Info = ({ label, value }) => (
  <div>
    <div className="text-[10px] uppercase tracking-[0.22em] text-[#8F8A82]">{label}</div>
    <div className="mt-2 text-sm font-semibold text-white">{value}</div>
  </div>
);

const formatStatus = (value) =>
  String(value || 'unknown')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default RoomsPage;

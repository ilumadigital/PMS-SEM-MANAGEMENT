import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

export const CloudbedsDataContext = createContext(null);

const localDateKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildDerivedData = (reservations) => {
  const propertyMap = new Map();
  const roomMap = new Map();
  const customerMap = new Map();

  reservations.forEach((reservation) => {
    const propertyId = String(reservation.propertyId || reservation.property?.id || 'unknown-property');
    const propertyName = reservation.property?.name || 'Cloudbeds Property';

    if (!propertyMap.has(propertyId)) {
      propertyMap.set(propertyId, {
        id: propertyId,
        name: propertyName,
        code: propertyId,
        type: 'Cloudbeds',
        location: reservation.property?.city || '',
        totalRooms: 0,
      });
    }

    const roomIds = Array.isArray(reservation.roomIds) && reservation.roomIds.length
      ? reservation.roomIds.map(String)
      : [String(reservation.roomId || `unassigned-${reservation.id}`)];
    const roomNumbers = Array.isArray(reservation.roomNumbers) && reservation.roomNumbers.length
      ? reservation.roomNumbers.map(String)
      : [String(reservation.roomNumber || 'Unassigned')];
    const roomTypes = Array.isArray(reservation.roomTypes) && reservation.roomTypes.length
      ? reservation.roomTypes.map(String)
      : [String(reservation.roomType || '')];

    const roomCount = Math.max(roomIds.length, roomNumbers.length, 1);

    for (let index = 0; index < roomCount; index += 1) {
      const roomId = roomIds[index] || `${roomIds[0]}-${index + 1}`;
      const roomNumber = roomNumbers[index] || roomNumbers[0] || 'Unassigned';
      const roomType = roomTypes[index] || roomTypes[0] || '';

      if (!roomMap.has(roomId)) {
        roomMap.set(roomId, {
          id: roomId,
          propertyId,
          roomNumber,
          roomType,
          housekeepingStatus: 'not_tracked',
          occupancyStatus: 'unknown',
          nextArrivalBookingId: null,
          currentGuest: null,
          lastUpdatedAt: 'Cloudbeds',
        });
      }
    }

    const customerKey =
      reservation.guestEmail ||
      reservation.guestPhone ||
      reservation.guestName ||
      reservation.id;

    if (!customerMap.has(customerKey)) {
      customerMap.set(customerKey, {
        id: String(customerKey),
        name: reservation.guestName || 'Unknown Guest',
        email: reservation.guestEmail || '',
        phone: reservation.guestPhone || '',
        bookings: 0,
      });
    }

    customerMap.get(customerKey).bookings += 1;
  });

  const today = localDateKey();
  const rooms = Array.from(roomMap.values()).map((room) => {
    const roomReservations = reservations
      .filter((reservation) => {
        const ids = Array.isArray(reservation.roomIds) && reservation.roomIds.length
          ? reservation.roomIds.map(String)
          : [String(reservation.roomId || '')];
        return ids.includes(room.id);
      })
      .sort((a, b) => String(a.arrivalDate || '').localeCompare(String(b.arrivalDate || '')));

    const inHouse = roomReservations.find(
      (reservation) =>
        reservation.status === 'in_house' ||
        (
          reservation.arrivalDate &&
          reservation.departureDate &&
          reservation.arrivalDate <= today &&
          reservation.departureDate > today &&
          reservation.status !== 'cancelled'
        )
    );

    const checkoutToday = roomReservations.find(
      (reservation) =>
        reservation.departureDate === today &&
        reservation.status !== 'cancelled'
    );

    const arrivingToday = roomReservations.find(
      (reservation) =>
        reservation.arrivalDate === today &&
        reservation.status !== 'cancelled'
    );

    const nextArrival = roomReservations.find(
      (reservation) =>
        reservation.arrivalDate >= today &&
        reservation.status !== 'cancelled'
    );

    return {
      ...room,
      occupancyStatus: checkoutToday
        ? 'checkout_today'
        : inHouse
          ? 'occupied'
          : arrivingToday
            ? 'arriving_today'
            : 'vacant',
      currentGuest: inHouse?.guestName || null,
      nextArrivalBookingId: nextArrival?.id || null,
    };
  });

  const properties = Array.from(propertyMap.values()).map((property) => ({
    ...property,
    totalRooms: rooms.filter((room) => room.propertyId === property.id).length,
  }));

  return {
    properties,
    rooms,
    customers: Array.from(customerMap.values()),
  };
};

export const CloudbedsDataProvider = ({ children }) => {
  const [reservations, setReservations] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setError('');

      const statusResponse = await api.get('/integrations/cloudbeds/status');
      const nextStatus = statusResponse.data;
      setStatus(nextStatus);

      if (!nextStatus.connected) {
        setReservations([]);
        return;
      }

      const reservationsResponse = await api.get('/integrations/cloudbeds/reservations');
      setReservations(reservationsResponse.data.reservations || []);
      setStatus((current) => ({
        ...(current || {}),
        ...reservationsResponse.data,
        connected: true,
      }));
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.message ||
          'Could not load Cloudbeds data.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 60000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const connect = useCallback(() => {
    const apiOrigin = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    window.location.assign(`${apiOrigin}/api/integrations/cloudbeds/connect`);
  }, []);

  const derived = useMemo(() => buildDerivedData(reservations), [reservations]);

  const value = useMemo(
    () => ({
      reservations,
      properties: derived.properties,
      rooms: derived.rooms,
      customers: derived.customers,
      status,
      loading,
      error,
      refresh,
      connect,
    }),
    [reservations, derived, status, loading, error, refresh, connect]
  );

  return (
    <CloudbedsDataContext.Provider value={value}>
      {children}
    </CloudbedsDataContext.Provider>
  );
};

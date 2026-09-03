import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

export const CloudbedsDataContext = createContext(null);

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

    const roomId = String(reservation.roomId || `unassigned-${reservation.id}`);
    if (!roomMap.has(roomId)) {
      roomMap.set(roomId, {
        id: roomId,
        propertyId,
        roomNumber: reservation.roomNumber || 'Unassigned',
        roomType: reservation.roomType || '',
        housekeepingStatus: 'not_tracked',
        occupancyStatus: 'unknown',
        nextArrivalBookingId: null,
        currentGuest: null,
        lastUpdatedAt: 'Cloudbeds',
      });
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

  const rooms = Array.from(roomMap.values());
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

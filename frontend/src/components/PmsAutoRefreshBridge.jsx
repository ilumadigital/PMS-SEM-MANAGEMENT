import React, { useContext, useEffect, useRef } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import api from '../services/api';

const POLL_MS = 1500;

const PmsAutoRefreshBridge = ({ onRevision }) => {
  const { refresh } = useContext(CloudbedsDataContext);
  const timersRef = useRef([]);
  const runningRef = useRef(false);
  const queuedRef = useRef(false);
  const revisionRef = useRef(null);
  const checkingRevisionRef = useRef(false);
  const suppressRemoteRemountUntilRef = useRef(0);

  useEffect(() => {
    const clearTimers = () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    };

    const refreshCycle = async () => {
      if (runningRef.current) {
        queuedRef.current = true;
        return;
      }

      runningRef.current = true;
      try {
        await refresh();
      } finally {
        runningRef.current = false;
        if (queuedRef.current) {
          queuedRef.current = false;
          refreshCycle();
        }
      }
    };

    const checkRevision = async ({ forceRefresh = false } = {}) => {
      if (checkingRevisionRef.current) return;
      if (document.visibilityState !== 'visible' && !forceRefresh) return;

      checkingRevisionRef.current = true;
      try {
        const response = await api.get('/operations/revision', { params: { _ts: Date.now() } });
        const nextRevision = String(response.data?.data?.revision || '');

        if (!nextRevision) return;
        if (revisionRef.current === null) {
          revisionRef.current = nextRevision;
          if (forceRefresh) refreshCycle();
          return;
        }

        if (nextRevision !== revisionRef.current) {
          revisionRef.current = nextRevision;
          const suppressRemount = Date.now() < suppressRemoteRemountUntilRef.current;
          if (!suppressRemount) onRevision?.();
          refreshCycle();
        } else if (forceRefresh) {
          refreshCycle();
        }
      } catch (error) {
        // Realtime polling is best-effort. The normal data refresh path remains available.
        console.debug('[PMS LIVE SYNC]', error?.message || 'Revision check failed');
      } finally {
        checkingRevisionRef.current = false;
      }
    };

    const handleMutation = () => {
      clearTimers();
      suppressRemoteRemountUntilRef.current = Date.now() + 3000;
      onRevision?.();
      refreshCycle();
      timersRef.current.push(window.setTimeout(refreshCycle, 500));
      timersRef.current.push(window.setTimeout(refreshCycle, 1400));
      timersRef.current.push(window.setTimeout(() => checkRevision(), 900));
    };

    const handleFocus = () => {
      if (document.visibilityState === 'visible') checkRevision({ forceRefresh: true });
    };

    // Establish the revision baseline immediately, then watch for changes made
    // by other users/devices. Every successful PMS mutation increments this value.
    checkRevision();
    const interval = window.setInterval(() => checkRevision(), POLL_MS);

    window.addEventListener('sem:pms-mutated', handleMutation);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      clearTimers();
      window.clearInterval(interval);
      window.removeEventListener('sem:pms-mutated', handleMutation);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [refresh, onRevision]);

  return null;
};

export default PmsAutoRefreshBridge;

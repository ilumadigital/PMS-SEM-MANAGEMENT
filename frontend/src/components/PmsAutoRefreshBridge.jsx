import React, { useContext, useEffect, useRef } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';

const PmsAutoRefreshBridge = ({ onRevision }) => {
  const { refresh } = useContext(CloudbedsDataContext);
  const timersRef = useRef([]);
  const runningRef = useRef(false);
  const queuedRef = useRef(false);

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

    const handleMutation = () => {
      clearTimers();
      onRevision?.();
      refreshCycle();
      timersRef.current.push(window.setTimeout(refreshCycle, 700));
      timersRef.current.push(window.setTimeout(refreshCycle, 1800));
    };

    const handleFocus = () => {
      if (document.visibilityState === 'visible') refreshCycle();
    };

    window.addEventListener('sem:pms-mutated', handleMutation);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      clearTimers();
      window.removeEventListener('sem:pms-mutated', handleMutation);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [refresh, onRevision]);

  return null;
};

export default PmsAutoRefreshBridge;

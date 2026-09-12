import React, { useEffect, useState } from 'react';

const PwaManager = () => {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  const [standalone, setStandalone] = useState(
    () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
  );

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setStandalone(true);
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onUpdate = () => setUpdateReady(true);
    const media = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayMode = () => setStandalone(media?.matches || window.navigator.standalone === true);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('sem:pwa-update-ready', onUpdate);
    media?.addEventListener?.('change', onDisplayMode);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('sem:pwa-update-ready', onUpdate);
      media?.removeEventListener?.('change', onDisplayMode);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
  };

  const update = () => {
    const registration = window.__SEM_SW_REGISTRATION__;
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  if (online && !updateReady && (!installPrompt || standalone)) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(78px+env(safe-area-inset-bottom))] z-[120] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end xl:bottom-5">
      {!online && (
        <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm font-semibold text-amber-900 shadow-xl backdrop-blur">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
          Offline mode. The PMS shell remains available; live operational changes need a connection.
        </div>
      )}

      {updateReady && (
        <div className="pointer-events-auto flex max-w-md flex-col gap-3 rounded-2xl border border-blue-200 bg-white/95 p-4 shadow-2xl backdrop-blur sm:flex-row sm:items-center">
          <div>
            <div className="text-sm font-black text-slate-950">SEM PMS update ready</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">Reload once to use the newest app version.</div>
          </div>
          <button onClick={update} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white">Update now</button>
        </div>
      )}

      {installPrompt && !standalone && (
        <div className="pointer-events-auto flex max-w-md flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur sm:flex-row sm:items-center">
          <div>
            <div className="text-sm font-black">Install SEM PMS</div>
            <div className="mt-1 text-xs leading-5 text-slate-300">Add it to the home screen for full-screen, app-like access.</div>
          </div>
          <button onClick={install} className="min-h-11 rounded-xl bg-white px-4 text-sm font-black text-slate-950">Install</button>
        </div>
      )}
    </div>
  );
};

export default PwaManager;

import React, { useEffect, useState } from 'react';

const PwaManager = () => {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  const [standalone, setStandalone] = useState(
    () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
  );
  const [iosHintDismissed, setIosHintDismissed] = useState(
    () => localStorage.getItem('sem-pwa-ios-hint-dismissed') === '1'
  );
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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

  const showIosInstall = isIos && !standalone && !iosHintDismissed;
  if (online && !updateReady && (!installPrompt || standalone) && !showIosInstall) return null;

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

      {showIosInstall && (
        <div className="pointer-events-auto flex max-w-md flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-black text-slate-950">Install SEM PMS on iPhone / iPad</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">Tap Share in Safari, then choose <strong>Add to Home Screen</strong> for the full-screen PWA experience.</div>
            </div>
            <button
              onClick={() => {
                localStorage.setItem('sem-pwa-ios-hint-dismissed', '1');
                setIosHintDismissed(true);
              }}
              className="pms-compact-control flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-500"
              aria-label="Dismiss install tip"
            >×</button>
          </div>
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

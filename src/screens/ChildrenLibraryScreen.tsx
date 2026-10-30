import React, { useEffect, useState } from 'react';
import { LanguageLibraryScreen } from './LanguageLibraryScreen';
import { fetchChildrenLibrary, streamChildrenAudio } from '../services/childrenLibraryService';
import { startBackgroundAudioLoading } from '../services/audioPreloader';
import { EdoEntry } from '../types/edo';
import { PhoneFrame } from '../components/PhoneFrame';

export const ChildrenLibraryScreen: React.FC = () => {
  const [entries, setEntries] = useState<EdoEntry[]>([]);
  const [checkedAt, setCheckedAt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [mobile, setMobile] = useState(() => window.innerWidth <= 640);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let request: AbortController | undefined;
    async function refresh() {
      if (inFlight || document.visibilityState === 'hidden') return;
      if (!navigator.onLine) { setBusy(false); setError('Offline'); return; }
      inFlight = true;
      setBusy(true);
      request = new AbortController();
      const timeout = window.setTimeout(() => request?.abort(), 30000);
      try {
        const snapshot = await fetchChildrenLibrary(request.signal);
        if (!disposed) {
          setEntries(snapshot.entries);
          setCheckedAt(snapshot.checkedAt);
          setError('');
          startBackgroundAudioLoading(snapshot.entries, streamChildrenAudio, { persistToStorage: false });
        }
      } catch {
        if (!disposed) setError('Unable to connect');
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
        if (!disposed) setBusy(false);
      }
    }
    const resize = () => setMobile(window.innerWidth <= 640);
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      disposed = true;
      request?.abort();
      window.clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center sm:py-4">
      <PhoneFrame isNativeMobileViewport={mobile}>
        <LanguageLibraryScreen entries={entries} readOnly communityBusy={busy}
          communityCheckedAt={checkedAt} communityError={error} onBackToDashboard={() => {}} />
      </PhoneFrame>
    </div>
  );
};

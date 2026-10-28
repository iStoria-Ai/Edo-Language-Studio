import React, { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { exportLibrary, importLibrary } from '../services/storageService';
import { MAX_BACKUP_BYTES, parseBackup } from '../services/libraryProtection';

interface Props {
  queueCount: number;
  recordingCount: number;
  onLibraryChanged: () => Promise<void>;
}
export function LibraryBackupTools({ queueCount, recordingCount, onLibraryChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ text: string; filename: string; lessons: number; recordings: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to complete the backup operation.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <details className="mx-5 my-2 rounded-xl border border-[#DED6C4] bg-white px-3 py-2 shrink-0 text-sm">
    <summary className="cursor-pointer font-bold text-[#157A4C]">Library backups &amp; recording permissions</summary>
    <div className="mt-2 space-y-2 max-h-[40dvh] overflow-y-auto">
      <p>{recordingCount} protected recordings · {queueCount} pending operations. Cloud sync is not connected.</p>
      <p className="text-xs text-[#56625A]">Backups include original audio, speaker information, and permissions. Files are not encrypted; keep your backup private. No recordings are uploaded.</p>
      <div className="flex gap-2">
        <button disabled={busy} type="button" className="edo-secondary-btn flex-1" onClick={() => void run(async () => {
          const text = await exportLibrary();
          const filename = `edo-library-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
          if (Capacitor.isNativePlatform()) {
            const result = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
            await Share.share({ title: 'Edo Language Studio backup', dialogTitle: 'Save your private library backup', files: [result.uri] });
            setMessage('Backup save/share dialog completed. Make sure you saved the file outside the app; dismissing the dialog does not create an external backup.');
          } else {
            const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = filename;
            document.body.appendChild(link); link.click(); link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
            setMessage('Backup download requested. Keep the downloaded file in a separate safe location.');
          }
        })}>Export Library</button>
        <button disabled={busy} type="button" className="edo-secondary-btn flex-1" onClick={() => fileRef.current?.click()}>Import Library</button>
      </div>
      <input ref={fileRef} aria-label="Choose library backup" type="file" accept=".json,application/json" className="sr-only" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        setPreview(null);
        void run(async () => {
          if (file.size > MAX_BACKUP_BYTES) throw new Error('This backup is larger than the 100 MB import limit. No data was changed.');
          const text = await file.text();
          const backup = await parseBackup(text);
          setPreview({ text, filename: file.name, lessons: backup.payload.entries.length, recordings: backup.payload.recordings.length });
        });
      }} />
      {preview && <div className="rounded-lg bg-[#FAF7F0] p-2 space-y-2">
        <p>Verified: {preview.filename} · {preview.lessons} lessons · {preview.recordings} recordings.</p>
        <p className="text-xs">Import adds missing lessons. Existing audio, speaker details, and permissions stay unchanged. Conflicting lessons are kept separately. Retained recordings are restored to the library.</p>
        <div className="flex gap-2">
          <button disabled={busy} type="button" className="edo-secondary-btn" onClick={() => void run(async () => {
            const result = await importLibrary(preview.text);
            await onLibraryChanged(); setPreview(null);
            setMessage(`Import complete: ${result.added} added, ${result.skipped} duplicates skipped, ${result.conflicts} conflicts preserved. Existing recording permissions were not replaced.`);
          })}>Confirm import</button>
          <button disabled={busy} type="button" className="edo-secondary-btn" onClick={() => setPreview(null)}>Cancel</button>
        </div>
      </div>}
      {busy && <p role="status">Checking and saving locally…</p>}
      {message && <p role="status" className="break-words text-[#157A4C]">{message}</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </div>
  </details>;
}

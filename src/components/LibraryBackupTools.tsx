import React, { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { exportLibrary, importLibrary } from '../services/storageService';
import { MAX_BACKUP_BYTES, parseBackup } from '../services/libraryProtection';
import { getStoredContributorToken, setStoredContributorToken } from '../services/cloudSyncService';

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
  const [tokenInput, setTokenInput] = useState('');
  const [hasStoredToken, setHasStoredToken] = useState(() => Boolean(getStoredContributorToken()));
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
      <p>{recordingCount} protected recordings · {queueCount} pending local operations. Google Drive upload status is shown on each lesson.</p>
      <p className="text-xs text-[#56625A]">Backups include original audio, speaker information, and permissions. Files are not encrypted; keep your backup private. Recordings are saved locally and queued for Google Drive sync.</p>
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
      <div className="pt-2 border-t border-[#E5DEC9] space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-xs text-[#2A372E]">Optional contributor key (Google Drive)</span>
          <span className={`text-[11px] font-bold ${hasStoredToken ? 'text-[#157A4C]' : 'text-[#7D8880]'}`}>
            {hasStoredToken ? '✓ Key Saved On Device' : 'Community Mode'}
          </span>
        </div>
        <div className="flex gap-1.5">
          <input
            type="password"
            aria-label="Optional contributor key"
            placeholder={hasStoredToken ? '••••••••••••••••' : 'Optional — leave blank for community mode'}
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            className="flex-1 px-2.5 py-1 text-xs border border-[#D5CFC0] rounded-lg bg-white"
          />
          <button
            type="button"
            className="px-2.5 py-1 text-xs rounded-lg bg-[#157A4C] text-white font-bold"
            onClick={() => {
              if (tokenInput.trim()) {
                setStoredContributorToken(tokenInput.trim());
                setHasStoredToken(true);
                setTokenInput('');
                setMessage('Contributor key saved privately to device storage.');
              }
            }}
          >
            Save
          </button>
          {hasStoredToken && (
            <button
              type="button"
              className="px-2 py-1 text-xs rounded-lg border border-[#D5CFC0] bg-white text-[#556258] font-bold"
              onClick={() => {
                setStoredContributorToken('');
                setHasStoredToken(false);
                setTokenInput('');
                setMessage('Contributor key removed from device.');
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  </details>;
}

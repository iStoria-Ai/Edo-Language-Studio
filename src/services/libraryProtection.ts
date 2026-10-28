import { EdoEntry } from '../types/edo';

export type PermissionDecision = 'unknown' | 'granted' | 'denied';
export interface RecordingPermissions {
  playback: PermissionDecision;
  aiVoiceTraining: PermissionDecision;
  updatedAt?: string;
  statementVersion: '1';
}
export interface ProtectedRecording {
  id: string;
  audioDataUrl: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  speaker: { id: string; name: string; dialect: string };
  permissions: RecordingPermissions;
  originalLesson: EdoEntry;
}
export interface SyncOperation {
  id: string;
  lessonId: string;
  recordingId?: string;
  operation: 'upsert_lesson' | 'archive_lesson' | 'update_recording_metadata';
  revision: string;
  status: 'pending';
  attempts: number;
  createdAt: string;
}
export interface LocalLibrary {
  version: 2;
  entries: EdoEntry[];
  recordings: ProtectedRecording[];
  syncQueue: SyncOperation[];
}
export interface LibraryBackup {
  format: 'edo-language-studio-backup';
  version: 1;
  exportedAt: string;
  payload: { entries: EdoEntry[]; recordings: ProtectedRecording[] };
  sha256: string;
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(key => (value as Record<string, unknown>)[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function digest(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function originalAudio(dataUrl: string): { bytes: Uint8Array; mimeType: string } {
  const match = /^data:(audio\/[a-z0-9.+-]+(?:;[^,\r\n]*)?);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(dataUrl);
  if (!match || !match[2] || match[2].length % 4 !== 0) throw new Error('Recording must contain original base64 audio, not a remote or temporary URL.');
  const decoded = atob(match[2]);
  if (btoa(decoded) !== match[2]) throw new Error('Invalid audio encoding.');
  return { bytes: Uint8Array.from(decoded, char => char.charCodeAt(0)), mimeType: match[1] };
}
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const decisions = ['unknown', 'granted', 'denied'];
export function validatePermissions(value: RecordingPermissions): void {
  if (!value || !decisions.includes(value.playback) || !decisions.includes(value.aiVoiceTraining) || value.statementVersion !== '1' || (value.updatedAt !== undefined && (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))))) throw new Error('Invalid recording permissions.');
}
export function validateEntries(entries: EdoEntry[]): void {
  if (!Array.isArray(entries)) throw new Error('Invalid lesson list.');
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || typeof entry.english !== 'string' || !entry.english.trim() || typeof entry.illustrationKey !== 'string' || typeof entry.emoji !== 'string' || typeof entry.hasAudio !== 'boolean' || typeof entry.isSampleData !== 'boolean' || !['word', 'phrase', 'sentence'].includes(entry.category) || !['unanswered', 'needs_writing', 'needs_audio', 'awaiting_review', 'sample_entry'].includes(entry.status) || (typeof entry.updatedAt !== 'string' || !Number.isFinite(Date.parse(entry.updatedAt))) || (entry.createdAt !== undefined && (typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt)))) || (entry.edoText !== undefined && typeof entry.edoText !== 'string') || (entry.notes !== undefined && typeof entry.notes !== 'string') || (entry.recordingId !== undefined && typeof entry.recordingId !== 'string') || (entry.audioDurationSec !== undefined && (!Number.isFinite(entry.audioDurationSec) || entry.audioDurationSec < 0)) || (entry.cloudAudioFileId !== undefined && typeof entry.cloudAudioFileId !== 'string') || (entry.cloudMetadataFileId !== undefined && typeof entry.cloudMetadataFileId !== 'string') || (entry.syncStatus !== undefined && !['local_only', 'pending_upload', 'uploading', 'synced_to_drive', 'upload_failed'].includes(entry.syncStatus)) || (entry.lastSyncAttempt !== undefined && (typeof entry.lastSyncAttempt !== 'string' || !Number.isFinite(Date.parse(entry.lastSyncAttempt)))) || (entry.syncError !== undefined && typeof entry.syncError !== 'string')) throw new Error('Invalid or duplicate lesson metadata.');
    if (entry.audioDataUrl !== undefined) {
      if (typeof entry.audioDataUrl !== 'string') throw new Error('Invalid audio data.');
      originalAudio(entry.audioDataUrl);
    }
    ids.add(entry.id);
  }
}
export async function protectEntries(entries: EdoEntry[], previous?: LocalLibrary): Promise<LocalLibrary> {
  validateEntries(entries);
  const recordings = [...(previous?.recordings || [])];
  const prepared: EdoEntry[] = [];
  for (const source of entries) {
    const entry = { ...source };
    const old = previous?.entries.find(item => item.id === entry.id);
    if (old?.audioDataUrl && entry.audioDataUrl && old.audioDataUrl !== entry.audioDataUrl) throw new Error('An existing recording cannot be overwritten. Save the new recording as a separate lesson.');
    if (entry.audioDataUrl) {
      const { bytes, mimeType } = originalAudio(entry.audioDataUrl);
      const sha256 = await digest(bytes);
      const id = `rec-${await digest(entry.audioDataUrl)}`;
      entry.recordingId = id;
      const recordingIndex = recordings.findIndex(recording => recording.id === id);
      if (recordingIndex >= 0 && recordings[recordingIndex].originalLesson.id === entry.id) recordings[recordingIndex] = { ...recordings[recordingIndex], originalLesson: { ...entry } };
      if (recordingIndex < 0) recordings.push({
        id, audioDataUrl: entry.audioDataUrl, mimeType, byteLength: bytes.length, sha256,
        speaker: { id: `speaker-${crypto.randomUUID()}`, name: '', dialect: '' },
        permissions: { playback: 'unknown', aiVoiceTraining: 'unknown', statementVersion: '1' },
        originalLesson: { ...entry }
      });
    } else { delete entry.recordingId; }
    prepared.push(entry);
  }
  const syncQueue = [...(previous?.syncQueue || [])];
  for (const entry of prepared.filter(item => !item.isSampleData && (item.audioDataUrl || item.edoText))) {
    const revision = await digest(canonical(entry));
    const id = `upsert-${await digest(`${entry.id}:${revision}`)}`;
    if (!syncQueue.some(item => item.id === id)) {
      // Only the latest pending snapshot per lesson will eventually be uploaded.
      for (let index = syncQueue.length - 1; index >= 0; index--) if (syncQueue[index].lessonId === entry.id && syncQueue[index].operation !== 'update_recording_metadata') syncQueue.splice(index, 1);
      syncQueue.push({ id, lessonId: entry.id, recordingId: entry.recordingId, operation: 'upsert_lesson', revision, status: 'pending', attempts: 0, createdAt: new Date().toISOString() });
    }
  }
  for (const old of previous?.entries || []) {
    if ((!old.audioDataUrl && !old.edoText) || old.isSampleData) continue;
    const active = prepared.find(entry => entry.id === old.id);
    if (active && !active.isSampleData && (active.audioDataUrl || active.edoText)) continue;
    const id = `archive-${await digest(canonical(old))}`;
    if (!syncQueue.some(item => item.id === id)) {
      for (let index = syncQueue.length - 1; index >= 0; index--) if (syncQueue[index].lessonId === old.id) syncQueue.splice(index, 1);
      syncQueue.push({ id, lessonId: old.id, recordingId: old.recordingId, operation: 'archive_lesson', revision: await digest(canonical(old)), status: 'pending', attempts: 0, createdAt: new Date().toISOString() });
    }
  }
  return { version: 2, entries: prepared, recordings, syncQueue };
}

export async function makeBackup(library: LocalLibrary): Promise<string> {
  const payload = { entries: library.entries, recordings: library.recordings };
  const backup: LibraryBackup = { format: 'edo-language-studio-backup', version: 1, exportedAt: new Date().toISOString(), payload, sha256: await digest(canonical(payload)) };
  // Verify our own export before offering it for download.
  await parseBackup(JSON.stringify(backup));
  const text = JSON.stringify(backup, null, 2);
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('This library exceeds the 100 MB backup limit. The library is unchanged; a larger archive format is needed before exporting.');
  return text;
}
export async function parseBackup(text: string): Promise<LibraryBackup> {
  let backup: LibraryBackup;
  try { backup = JSON.parse(text); } catch { throw new Error('This is not a valid JSON backup.'); }
  if (!backup || backup.format !== 'edo-language-studio-backup' || backup.version !== 1 || !backup.payload || !Array.isArray(backup.payload.recordings) || typeof backup.sha256 !== 'string') throw new Error('Unsupported backup format or version.');
  if (await digest(canonical(backup.payload)) !== backup.sha256) throw new Error('Backup integrity check failed. Nothing was imported.');
  validateEntries(backup.payload.entries);
  const ids = new Set<string>();
  for (const recording of backup.payload.recordings) {
    if (!recording || typeof recording.audioDataUrl !== 'string') throw new Error('Invalid recording in backup.');
    const { bytes, mimeType } = originalAudio(recording.audioDataUrl);
    const sha256 = await digest(bytes);
    if (recording.sha256 !== sha256 || recording.id !== `rec-${await digest(recording.audioDataUrl)}` || ids.has(recording.id) || recording.byteLength !== bytes.length || recording.mimeType !== mimeType || !recording.speaker || typeof recording.speaker.id !== 'string' || !recording.speaker.id || typeof recording.speaker.name !== 'string' || typeof recording.speaker.dialect !== 'string') throw new Error('Recording integrity or speaker validation failed. Nothing was imported.');
    validatePermissions(recording.permissions);
    validateEntries([recording.originalLesson]);
    if (recording.originalLesson.audioDataUrl !== recording.audioDataUrl || recording.originalLesson.recordingId !== recording.id) throw new Error('Original recording metadata does not match.');
    ids.add(recording.id);
  }
  for (const entry of backup.payload.entries) {
    const recording = backup.payload.recordings.find(item => item.id === entry.recordingId);
    if (entry.audioDataUrl && (!recording || entry.audioDataUrl !== recording.audioDataUrl) || !entry.audioDataUrl && entry.recordingId) throw new Error('Lesson recording is missing or mismatched. Nothing was imported.');
  }
  return backup;
}

export async function mergeBackup(current: LocalLibrary, backup: LibraryBackup): Promise<{ library: LocalLibrary; added: number; skipped: number; conflicts: number }> {
  const entries = [...current.entries];
  const recordings = [...current.recordings];
  let added = 0, skipped = 0, conflicts = 0;
  for (const recording of backup.payload.recordings) {
    const existing = recordings.find(item => item.id === recording.id);
    if (!existing) recordings.push(recording);
    else if (canonical(existing.speaker) !== canonical(recording.speaker) || canonical(existing.permissions) !== canonical(recording.permissions)) conflicts++;
  }
  // Recover retained recordings even when their lessons were removed from the active list.
  const incoming = [...backup.payload.entries];
  for (const recording of backup.payload.recordings) if (!incoming.some(entry => entry.recordingId === recording.id)) incoming.push(recording.originalLesson);
  for (const source of incoming) {
    if (entries.some(entry => canonical(entry) === canonical(source))) { skipped++; continue; }
    const content = (entry: EdoEntry) => {
      const { id: _id, createdAt: _created, updatedAt: _updated, ...rest } = entry;
      return canonical(rest);
    };
    if (entries.some(entry => content(entry) === content(source))) { skipped++; continue; }
    let entry = { ...source };
    const index = entries.findIndex(item => item.id === entry.id);
    if (index >= 0 && !entries[index].audioDataUrl && (entries[index].isSampleData || entries[index].status === 'unanswered') && entry.audioDataUrl) {
      entries[index] = entry; added++; continue;
    }
    if (index >= 0) {
      entry.id = `import-${await digest(canonical(source))}`;
      conflicts++;
      if (entries.some(item => item.id === entry.id)) { skipped++; continue; }
    }
    entries.push(entry); added++;
  }
  const library = await protectEntries(entries, { ...current, recordings });
  return { library, added, skipped, conflicts };
}

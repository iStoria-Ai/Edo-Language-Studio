import React, { useRef, useState } from 'react';
import { PermissionDecision, ProtectedRecording } from '../services/libraryProtection';
import { updateOwnedRecordingPermissions } from '../services/communityLibrary';
import { saveRecordingInformation } from '../services/storageService';

export function RecordingInformation({ recording, onSaved }: { recording: ProtectedRecording; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(recording.speaker.name);
  const [dialect, setDialect] = useState(recording.speaker.dialect);
  const [playback, setPlayback] = useState(recording.permissions.playback);
  const [training, setTraining] = useState(recording.permissions.aiVoiceTraining);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  return <details className="mt-3 rounded-xl border border-[#DED6C4] bg-white p-3 text-sm">
    <summary className="cursor-pointer font-semibold text-[#157A4C]">Speaker &amp; recording permissions</summary>
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-xs break-all">Recording: {recording.id}<br />Speaker: {recording.speaker.id}<br />Original format: {recording.mimeType} · {recording.byteLength.toLocaleString()} bytes</p>
      <label htmlFor="recording-speaker">Speaker name or pseudonym</label>
      <input id="recording-speaker" className="edo-input" value={name} maxLength={200} onChange={event => setName(event.target.value)} placeholder="Unknown speaker" />
      <label htmlFor="recording-dialect">Dialect or variety (optional)</label>
      <input id="recording-dialect" className="edo-input" value={dialect} maxLength={200} onChange={event => setDialect(event.target.value)} />
      <label htmlFor="permission-playback">Permission for shared-library playback</label>
      <select id="permission-playback" className="edo-input" value={playback} onChange={event => setPlayback(event.target.value as PermissionDecision)}>
        <option value="unknown">Not recorded</option><option value="granted">Speaker permits shared-library playback</option><option value="denied">Speaker does not permit shared-library playback</option>
      </select>
      <label htmlFor="permission-training">Permission for future AI voice training</label>
      <select id="permission-training" className="edo-input" value={training} onChange={event => setTraining(event.target.value as PermissionDecision)}>
        <option value="unknown">Not recorded — do not train</option><option value="granted">Speaker permits future AI voice training</option><option value="denied">Speaker does not permit AI voice training</option>
      </select>
      <p className="text-xs text-[#56625A]">Record only the speaker’s actual permission. These are separate choices; permission for playback does not grant training permission. Your local preview stays available. Existing audio stays on this device. Playback is shared only after you grant permission and the gateway confirms it. AI training remains a separate choice.</p>
      <button type="button" disabled={busy} className="edo-secondary-btn" onClick={async () => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setNotice('');
        try {
          await saveRecordingInformation(recording.id, { ...recording.speaker, name: name.trim(), dialect: dialect.trim() }, { ...recording.permissions, playback, aiVoiceTraining: training });
          if (recording.originalLesson.cloudMetadataFileId) await updateOwnedRecordingPermissions(recording.id, recording.originalLesson.cloudMetadataFileId, { playback, aiVoiceTraining: training });
          await onSaved(); setNotice('Speaker details saved locally; any authorized Drive permission update is confirmed. Original audio is unchanged.');
        } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to save.'); }
        finally { lock.current = false; setBusy(false); }
      }}>Save speaker &amp; permissions</button>
      {notice && <p role="status">{notice}</p>}
    </div>
  </details>;
}

/**
 * Cloud Sync Service for Edo Language Studio
 * Connects to the Google Apps Script Gateway.
 *
 * Security & Network Rules:
 * - NO hardcoded secrets or admin tokens in source code or Git.
 * - Contributor tokens are stored strictly in local device storage.
 * - Uses 'Content-Type: text/plain;charset=utf-8' to prevent CORS preflight (OPTIONS) blocks.
 * - Handles Google 302 redirects automatically via fetch(..., { redirect: 'follow' }).
 */

import { digest } from './libraryProtection';
import { recordingOwnerKey } from './recordingOwnership';
import { EdoEntry } from '../types/edo';

export const DEFAULT_GATEWAY_URL =
  'https://script.google.com/macros/s/AKfycbwcZHwplY338zxErFhNSKQBg6gDtPi1YLRa6sdrmKCD5DF0zVBIvVasGrT86czJy43w/exec';

const TOKEN_STORAGE_KEY = 'edo_contributor_auth_token_v1';
const GATEWAY_URL_STORAGE_KEY = 'edo_gateway_url_v1';

export interface GatewayHealthResult {
  ok: boolean;
  httpStatus?: number;
  data?: any;
  error?: string;
  isLoginRedirect?: boolean;
  isCorsBlocked?: boolean;
  durationMs: number;
}

export interface GatewayDiagnostics {
  gatewayUrl: string;
  hasStoredToken: boolean;
  getRequest: GatewayHealthResult;
  postRequest: GatewayHealthResult;
  summary: string;
}

/**
 * Retrieves the locally stored contributor key for this device.
 * Never committed to Git or shared publicly.
 */
export function getStoredContributorToken(): string {
  try {
    return (typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : '') || '';
  } catch {
    return '';
  }
}

/**
 * Saves the contributor key in this device's private local storage.
 */
export function setStoredContributorToken(token: string): void {
  try {
    if (token.trim()) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('Unable to persist contributor token locally:', err);
  }
}

/**
 * Gets the active Gateway URL (allows overriding in settings if needed).
 */
export function getGatewayUrl(): string {
  try {
    return localStorage.getItem(GATEWAY_URL_STORAGE_KEY) || DEFAULT_GATEWAY_URL;
  } catch {
    return DEFAULT_GATEWAY_URL;
  }
}

/**
 * Sets an overridden Gateway URL in local storage.
 */
export function setGatewayUrl(url: string): void {
  try {
    if (url.trim()) {
      localStorage.setItem(GATEWAY_URL_STORAGE_KEY, url.trim());
    } else {
      localStorage.removeItem(GATEWAY_URL_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('Unable to persist gateway URL locally:', err);
  }
}

/**
 * Performs a safe, unauthenticated GET health check to verify endpoint reachability,
 * Google redirects, and folder connectivity.
 */
export async function checkGatewayHealth(url = getGatewayUrl()): Promise<GatewayHealthResult> {
  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      mode: 'cors'
    });

    const durationMs = Date.now() - startTime;
    const isLoginRedirect = response.url.includes('accounts.google.com');

    if (isLoginRedirect) {
      return {
        ok: false,
        httpStatus: response.status,
        durationMs,
        isLoginRedirect: true,
        error: 'Deployment is set to "Only myself". Google redirected to a login page, blocking anonymous browser access.'
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        httpStatus: response.status,
        durationMs,
        error: `Gateway returned HTTP ${response.status} ${response.statusText}`
      };
    }

    const data = await response.json();
    return {
      ok: data.status === 'ok' && Boolean(data.folderConnected),
      httpStatus: response.status,
      durationMs,
      data
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const errMsg = String(err?.message || err);
    const isCors = errMsg.toLowerCase().includes('failed to fetch') || errMsg.toLowerCase().includes('networkerror') || errMsg.toLowerCase().includes('cors');

    return {
      ok: false,
      durationMs,
      isCorsBlocked: isCors,
      error: isCors
        ? 'Browser CORS error or network block. This typically occurs if the deployment is set to "Only myself" instead of "Anyone", causing a redirect to accounts.google.com without CORS headers.'
        : errMsg
    };
  }
}

/**
 * Performs a POST ping request to test the POST endpoint, CORS handling,
 * and token authentication.
 */
export async function pingGatewayPost(
  authToken = getStoredContributorToken(),
  url = getGatewayUrl()
): Promise<GatewayHealthResult> {
  const startTime = Date.now();
  const payload = {
    action: 'ping',
    authToken: authToken.trim()
  };

  try {
    // Note: We intentionally use 'text/plain;charset=utf-8' so browsers do NOT
    // trigger an OPTIONS preflight request which Google Apps Script cannot handle.
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
      mode: 'cors'
    });

    const durationMs = Date.now() - startTime;
    const isLoginRedirect = response.url.includes('accounts.google.com');

    if (isLoginRedirect) {
      return {
        ok: false,
        httpStatus: response.status,
        durationMs,
        isLoginRedirect: true,
        error: 'Deployment is set to "Only myself". Request was redirected to accounts.google.com.'
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        httpStatus: response.status,
        durationMs,
        error: `Gateway returned HTTP ${response.status} ${response.statusText}`
      };
    }

    const data = await response.json();
    return {
      ok: data.status === 'success',
      httpStatus: response.status,
      durationMs,
      data,
      error: data.status !== 'success' ? (data.message || data.code || 'Ping failed') : undefined
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const errMsg = String(err?.message || err);
    const isCors = errMsg.toLowerCase().includes('failed to fetch') || errMsg.toLowerCase().includes('networkerror') || errMsg.toLowerCase().includes('cors');

    return {
      ok: false,
      durationMs,
      isCorsBlocked: isCors,
      error: isCors
        ? 'Browser CORS error on POST. Verify deployment is set to "Who has access: Anyone".'
        : errMsg
    };
  }
}

/**
 * Runs a complete browser diagnostics test (GET health check + POST ping).
 */
export async function runGatewayConnectionDiagnostics(): Promise<GatewayDiagnostics> {
  const url = getGatewayUrl();
  const storedToken = getStoredContributorToken();

  const getResult = await checkGatewayHealth(url);
  const postResult = await pingGatewayPost(storedToken, url);

  let summary = '';
  if (getResult.ok && postResult.ok) {
    summary = 'Live connection fully verified. GET health check and POST ping succeeded with zero CORS blocks.';
  } else if (getResult.isLoginRedirect || postResult.isLoginRedirect || getResult.isCorsBlocked || postResult.isCorsBlocked) {
    summary = 'Connection blocked. The Apps Script deployment is likely set to "Who has access: Only myself". It must be set to "Who has access: Anyone" to allow browser requests from GitHub Pages without requiring Google login cookies.';
  } else if (getResult.ok && !postResult.ok) {
    summary = `GET connected successfully (${getResult.data?.service || 'OK'}), but POST failed: ${postResult.error}`;
  } else {
    summary = `Connection failed: ${getResult.error || postResult.error || 'Unknown error'}`;
  }

  return {
    gatewayUrl: url,
    hasStoredToken: Boolean(storedToken),
    getRequest: getResult,
    postRequest: postResult,
    summary
  };
}

export interface UploadRecordingParams {
  category?: EdoEntry['category'];
  lessonId: string;
  recordingId?: string;
  english: string;
  edoText?: string;
  audioDataUrl: string;
  durationSec: number;
  dialect?: string;
  permissions?: {
    playback?: 'granted' | 'denied' | 'unknown';
    aiVoiceTraining?: 'granted' | 'denied' | 'unknown';
  };
  authToken?: string;
  gatewayUrl?: string;
}

export interface UploadRecordingResult {
  ok: boolean;
  status: 'success' | 'error';
  action?: string;
  duplicate?: boolean;
  verified?: boolean;
  lessonId: string;
  recordingId: string;
  audioFileId?: string;
  metadataFileId?: string;
  recordingStatus?: 'needs_spelling' | 'spelling_submitted';
  message: string;
  errorCode?: string;
}

/**
 * Normalizes and extracts MIME type and base64 string from an audio Data URL.
 */
export function parseAudioDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Missing audio data URL');
  }
  const cleanUrl = dataUrl.trim();
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/.exec(cleanUrl);
  if (match) {
    let mime = match[1].toLowerCase().trim();
    if (mime === 'audio/x-wav') mime = 'audio/wav';
    if (mime === 'audio/x-m4a') mime = 'audio/mp4';
    return { mimeType: mime, base64: match[2].trim() };
  }
  const commaIndex = cleanUrl.indexOf(',');
  if (commaIndex !== -1) {
    const header = cleanUrl.substring(0, commaIndex);
    const mimeMatch = /^data:([^;,]+)/.exec(header);
    const mime = mimeMatch ? mimeMatch[1].toLowerCase().trim() : 'audio/webm';
    return { mimeType: mime, base64: cleanUrl.substring(commaIndex + 1).trim() };
  }
  return { mimeType: 'audio/webm', base64: cleanUrl };
}

/**
 * Uploads a local voice recording and its metadata to Google Drive through the Apps Script Gateway.
 *
 * Safety & Verification Rules:
 * 1. Uses community access without a token, or an optional contributor credential.
 * 2. Prepares clean base64 payload and allowed MIME type.
 * 3. Sends POST via text/plain to avoid CORS preflight blocks.
 * 4. Strictly verifies that Google Drive returns confirmed audioFileId AND metadataFileId.
 * 5. Handles duplicate uploads idempotently (gateway verifies both files exist).
 * 6. NEVER deletes local audio — preservation is maintained independently on device.
 */
export async function uploadRecordingToGateway(
  params: UploadRecordingParams
): Promise<UploadRecordingResult> {
  const token = (params.authToken ?? getStoredContributorToken()).trim();
  const lessonId = params.lessonId.trim();

  // Deterministic recording identifier
  let recordingId = params.recordingId?.trim() || '';
  if (!recordingId && params.audioDataUrl) {
    try {
      recordingId = `rec-${await digest(params.audioDataUrl)}`;
    } catch {
      recordingId = `rec-${Date.now()}`;
    }
  }

  // Token is optional: if present, sends contributor credential; if omitted, sends automatic community upload

  let parsedAudio: { mimeType: string; base64: string };
  try {
    parsedAudio = parseAudioDataUrl(params.audioDataUrl);
  } catch (err: any) {
    return {
      ok: false,
      status: 'error',
      errorCode: 'INVALID_AUDIO_DATA',
      lessonId,
      recordingId,
      message: `Invalid audio data: ${err?.message || err}`
    };
  }

  if (!parsedAudio.base64) {
    return {
      ok: false,
      status: 'error',
      errorCode: 'EMPTY_AUDIO',
      lessonId,
      recordingId,
      message: 'Audio data is empty. Cannot upload blank audio.'
    };
  }

  const payload = {
    action: 'upload_recording',
    ownerKey: await recordingOwnerKey(recordingId),
    authToken: token,
    lessonId,
    recordingId,
    english: params.english || '',
    category: params.category,
    edoText: params.edoText || '',
    audioBase64: parsedAudio.base64,
    mimeType: parsedAudio.mimeType,
    durationSec: params.durationSec || 0,
    dialect: params.dialect || 'Standard Benin',
    permissions: {
      playback: params.permissions?.playback === 'granted' ? 'granted' : 'denied',
      aiVoiceTraining: params.permissions?.aiVoiceTraining === 'granted' ? 'granted' : 'denied'
    },
    recordedAt: new Date().toISOString()
  };

  const url = params.gatewayUrl || getGatewayUrl();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
      mode: 'cors'
    });

    if (response.url.includes('accounts.google.com')) {
      return {
        ok: false,
        status: 'error',
        errorCode: 'GOOGLE_AUTH_REDIRECT',
        lessonId,
        recordingId,
        message: 'Deployment access restricted. Apps Script redirected to Google login.'
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: 'error',
        errorCode: `HTTP_${response.status}`,
        lessonId,
        recordingId,
        message: `Gateway returned HTTP ${response.status} ${response.statusText}`
      };
    }

    const data = await response.json();

    // Strict Verification: Confirm both audioFileId and metadataFileId are present
    if (data.status === 'success' && data.audioFileId && data.metadataFileId) {
      return {
        ok: true,
        status: 'success',
        duplicate: Boolean(data.duplicate),
        verified: Boolean(data.verified),
        action: data.action || 'upload_recording',
        lessonId: data.lessonId || lessonId,
        recordingId: data.recordingId || recordingId,
        audioFileId: data.audioFileId,
        metadataFileId: data.metadataFileId,
        recordingStatus: data.recordingStatus,
        message: data.message || 'Recording and metadata verified and stored securely in Google Drive.'
      };
    }

    return {
      ok: false,
      status: 'error',
      errorCode: data.code || 'VERIFICATION_FAILED',
      lessonId,
      recordingId,
      message: data.message || 'Google Drive did not return verified file references.'
    };
  } catch (err: any) {
    const errMsg = String(err?.message || err);
    const isCors = errMsg.toLowerCase().includes('failed to fetch') || errMsg.toLowerCase().includes('networkerror') || errMsg.toLowerCase().includes('cors');

    return {
      ok: false,
      status: 'error',
      errorCode: isCors ? 'NETWORK_OR_CORS_ERROR' : 'CONNECTION_FAILED',
      lessonId,
      recordingId,
      message: isCors
        ? 'Network or CORS block while connecting to gateway. Local recording is preserved.'
        : `Could not reach Google Drive (${errMsg}). Local recording is preserved.`
    };
  }
}


/**
 * Retrieves and streams verified private audio data URL from Google Drive through the Gateway.
 * Enforces verified companion metadata and playback permission checks.
 */
export async function streamAudioFromGateway(
  fileId: string,
  authToken = getStoredContributorToken(),
  url = getGatewayUrl()
): Promise<{ ok: boolean; audioDataUrl?: string; error?: string; errorCode?: string }> {
  const cleanId = (fileId || '').trim();
  if (!cleanId) return { ok: false, error: 'Missing audio file ID' };

  // Always validate current playback permission with the gateway when online.

  try {
    const payload = {
      action: 'stream_audio',
      authToken: authToken.trim(),
      fileId: cleanId
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      mode: 'cors'
    });

    if (!response.ok) {
      return { ok: false, error: `Gateway returned HTTP ${response.status} ${response.statusText}` };
    }

    const data = await response.json();
    if (data.status === 'success' && data.audioDataUrl) {
      return { ok: true, audioDataUrl: data.audioDataUrl };
    }

    return {
      ok: false,
      error: data.message || data.code || 'Could not retrieve cloud audio stream.',
      errorCode: data.code
    };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export interface NeedsSpellingItem {
  recordingId: string;
  lessonId: string;
  englishWord: string;
  audioFileId: string;
  metadataFileId: string;
  durationSec: number;
  voiceContributor?: { id: string; name: string; role: string };
  uploadedAt: string;
}

/**
 * Retrieves the shared Google Drive queue of voice recordings that need Edo spelling (Person B flow).
 */
export async function fetchNeedsSpellingQueue(
  authToken = getStoredContributorToken(),
  url = getGatewayUrl()
): Promise<{ ok: boolean; items: NeedsSpellingItem[]; error?: string }> {
  try {
    const payload = {
      action: 'get_needs_spelling',
      authToken: authToken.trim()
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      mode: 'cors'
    });
    if (!response.ok) {
      return { ok: false, items: [], error: `Gateway returned HTTP ${response.status}` };
    }
    const data = await response.json();
    if (data.status === 'success' && Array.isArray(data.items)) {
      return { ok: true, items: data.items };
    }
    return { ok: false, items: [], error: data.message || 'Could not fetch spelling queue' };
  } catch (err: any) {
    return { ok: false, items: [], error: String(err?.message || err) };
  }
}

/**
 * Submits Edo spelling for an existing voice recording in Google Drive, updating the companion metadata file.
 */
export async function submitSpellingToGateway(params: {
  metadataFileId: string;
  edoSpelling: string;
  authToken?: string;
  url?: string;
}): Promise<{ ok: boolean; status: string; message: string }> {
  const token = (params.authToken ?? getStoredContributorToken()).trim();
  const metaId = params.metadataFileId.trim();
  const spelling = params.edoSpelling.trim();
  if (!metaId || !spelling) {
    return { ok: false, status: 'error', message: 'Missing metadataFileId or edoSpelling' };
  }
  const payload = {
    action: 'submit_spelling',
    authToken: token,
    metadataFileId: metaId,
    edoSpelling: spelling
  };
  const url = params.url || getGatewayUrl();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      mode: 'cors'
    });
    if (!response.ok) {
      return { ok: false, status: 'error', message: `Gateway HTTP ${response.status}` };
    }
    const data = await response.json();
    const isSuccess = data.status === 'success' || data.status === 'spelling_submitted';
    return {
      ok: isSuccess,
      status: data.status,
      message: data.message || (isSuccess ? 'Spelling submitted successfully' : 'Failed to submit spelling')
    };
  } catch (err: any) {
    return { ok: false, status: 'error', message: String(err?.message || err) };
  }
}

export async function adminLockEntry(
  metadataFileId: string,
  adminToken: string,
  url = getGatewayUrl()
): Promise<{ ok: boolean; status: string; message: string }> {
  try {
    const payload = {
      action: 'admin_lock_entry',
      authToken: adminToken,
      metadataFileId: metadataFileId
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      mode: 'cors'
    });
    if (!response.ok) {
      return { ok: false, status: 'error', message: `Gateway HTTP ${response.status}` };
    }
    const data = await response.json();
    return {
      ok: data.status === 'success',
      status: data.status,
      message: data.message || (data.status === 'success' ? 'Lesson approved and locked successfully' : 'Failed to lock lesson')
    };
  } catch (err: any) {
    return { ok: false, status: 'error', message: String(err?.message || err) };
  }
}

export async function adminUnlockEntry(
  metadataFileId: string,
  adminToken: string,
  url = getGatewayUrl()
): Promise<{ ok: boolean; status: string; message: string }> {
  try {
    const payload = {
      action: 'admin_unlock_entry',
      authToken: adminToken,
      metadataFileId: metadataFileId
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      mode: 'cors'
    });
    if (!response.ok) {
      return { ok: false, status: 'error', message: `Gateway HTTP ${response.status}` };
    }
    const data = await response.json();
    return {
      ok: data.status === 'success',
      status: data.status,
      message: data.message || (data.status === 'success' ? 'Lesson unlocked successfully' : 'Failed to unlock lesson')
    };
  } catch (err: any) {
    return { ok: false, status: 'error', message: String(err?.message || err) };
  }
}

const LISTENER_TOKEN_STORAGE_KEY = 'edo_anonymous_listener_id_v1';

/**
 * Returns a stable, anonymous listener identifier for this browser instance.
 * Stored locally to prevent duplicate listener counts without tracking personal information.
 *
 * Anonymous Browser Limitation:
 * Without user accounts, separate browser profiles or cleared storage will generate
 * new tokens. This provides reasonable duplicate prevention without personal data.
 */
export function getAnonymousListenerToken(): string {
  try {
    if (typeof localStorage === 'undefined') return 'anon-default';
    let token = localStorage.getItem(LISTENER_TOKEN_STORAGE_KEY);
    if (!token || !/^[a-zA-Z0-9_-]{8,128}$/.test(token)) {
      token = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'ls-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem(LISTENER_TOKEN_STORAGE_KEY, token);
    }
    return token;
  } catch {
    return 'anon-default';
  }
}

/**
 * Records a successful playback event on the Google Apps Script gateway.
 * Deduplicates distinct listeners via SHA-256 token hashing.
 * When 5 distinct listeners are verified, the backend automatically locks the entry.
 */
export async function recordPlaybackToGateway(
  metadataFileId: string,
  listenerToken = getAnonymousListenerToken(),
  url = getGatewayUrl()
): Promise<{ ok: boolean; playCount?: number; distinctListenersCount?: number; reviewStatus?: string; autoLocked?: boolean; message?: string }> {
  try {
    const payload = {
      action: 'record_playback',
      metadataFileId: metadataFileId.trim(),
      listenerToken: listenerToken.trim()
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      mode: 'cors'
    });
    if (!response.ok) {
      return { ok: false, message: `Gateway HTTP ${response.status}` };
    }
    const data = await response.json();
    return {
      ok: data.status === 'success',
      playCount: data.playCount,
      distinctListenersCount: data.distinctListenersCount,
      reviewStatus: data.reviewStatus,
      autoLocked: Boolean(data.autoLocked),
      message: data.message
    };
  } catch (err: any) {
    return { ok: false, message: String(err?.message || err) };
  }
}

/**
 * Permanently removes a contribution and its recording from Google Drive.
 * Requires administrator role verification on the Google Apps Script gateway.
 * Records a tombstone to purge cached instances across client devices and
 * reopens curriculum questions for re-recording in Teach Edo.
 */
export async function adminDeleteEntry(
  metadataFileId: string,
  adminToken: string,
  url = getGatewayUrl()
): Promise<{ ok: boolean; status: string; recordingId?: string; lessonId?: string; tombstoneRecorded?: boolean; message: string }> {
  try {
    const payload = {
      action: 'admin_delete_entry',
      authToken: adminToken.trim(),
      metadataFileId: metadataFileId.trim()
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      mode: 'cors'
    });
    if (!response.ok) {
      return { ok: false, status: 'error', message: `Gateway HTTP ${response.status}` };
    }
    const data = await response.json();
    return {
      ok: data.status === 'success',
      status: data.status,
      recordingId: data.recordingId,
      lessonId: data.lessonId,
      tombstoneRecorded: Boolean(data.tombstoneRecorded),
      message: data.message || (data.status === 'success' ? 'Entry permanently deleted from Google Drive.' : 'Deletion failed')
    };
  } catch (err: any) {
    return { ok: false, status: 'error', message: String(err?.message || err) };
  }
}

export interface QueuedUpload {
  lessonId: string;
  enqueuedAt: string;
  attempts: number;
  lastAttempt?: string;
  lastError?: string;
}

const UPLOAD_QUEUE_KEY = 'edo_upload_queue_v1';

export function getPersistentUploadQueue(): QueuedUpload[] {
  try {
    const raw = localStorage.getItem(UPLOAD_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePersistentUploadQueue(queue: QueuedUpload[]): void {
  try {
    localStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn('Could not save persistent upload queue:', err);
  }
}

export function enqueueForBackgroundUpload(lessonId: string): void {
  if (!lessonId) return;
  const queue = getPersistentUploadQueue();
  if (!queue.some(item => item.lessonId === lessonId)) {
    queue.push({
      lessonId,
      enqueuedAt: new Date().toISOString(),
      attempts: 0
    });
    savePersistentUploadQueue(queue);
  }
}

export function dequeueFromBackgroundUpload(lessonId: string): void {
  const queue = getPersistentUploadQueue();
  const updated = queue.filter(item => item.lessonId !== lessonId);
  savePersistentUploadQueue(updated);
}

let isProcessingUploadQueue = false;

/**
 * Background upload worker: processes pending uploads from the persistent queue.
 * Safety guarantees:
 * 1. Runs completely asynchronously without blocking user navigation.
 * 2. After Google Drive confirms upload, verifies that the cloud audio can be retrieved and played.
 * 3. Only after confirmed retrieval verification, safely removes local audio bytes while retaining lesson records and cloud references.
 * 4. If upload or verification fails, retains the local recording and retries later. Never deletes the only valid copy.
 */
export async function processBackgroundUploadQueue(
  getCurrentEntries: () => EdoEntry[],
  onEntrySyncedAndVerified: (entryId: string, cloudAudioId: string, cloudMetaId: string) => Promise<void>,
  onEntryUploadFailed: (entryId: string, errorMsg: string) => Promise<void>,
  onEntryStatusChange?: (entryId: string, status: EdoEntry['syncStatus']) => void,
  getRecordingPermissions?: (entry: EdoEntry) => Promise<UploadRecordingParams['permissions']>
): Promise<void> {
  if (isProcessingUploadQueue) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const token = getStoredContributorToken();
  // Queue processes automatically; token is forwarded if configured, or empty for automatic community upload

  isProcessingUploadQueue = true;

  try {
    const queue = getPersistentUploadQueue();
    if (!queue.length) return;

    for (const item of [...queue]) {
      const entries = getCurrentEntries();
      const entry = entries.find(e => e.id === item.lessonId);

      // If entry was deleted or has no audio, dequeue
      if (!entry || !entry.hasAudio) {
        dequeueFromBackgroundUpload(item.lessonId);
        continue;
      }

      // If already synced to drive and verified, dequeue
      if (entry.cloudAudioFileId && entry.cloudMetadataFileId && entry.syncStatus === 'synced_to_drive') {
        dequeueFromBackgroundUpload(item.lessonId);
        continue;
      }

      // Must have local audio to upload
      if (!entry.audioDataUrl) {
        dequeueFromBackgroundUpload(item.lessonId);
        continue;
      }

      onEntryStatusChange?.(entry.id, 'uploading');

      // Step 1: Upload to Google Drive via Gateway
      const uploadResult = await uploadRecordingToGateway({
        lessonId: entry.id,
        recordingId: entry.recordingId,
        english: entry.english,
        category: entry.category,
        edoText: entry.edoText || '',
        audioDataUrl: entry.audioDataUrl,
        durationSec: entry.audioDurationSec || 0,
        authToken: token,
        permissions: await getRecordingPermissions?.(entry)
      });

      if (!uploadResult.ok || !uploadResult.audioFileId || !uploadResult.metadataFileId) {
        // Upload failed: update queue attempt & error, KEEP local audio!
        const currentQueue = getPersistentUploadQueue();
        const queueItem = currentQueue.find(q => q.lessonId === item.lessonId);
        if (queueItem) {
          queueItem.attempts += 1;
          queueItem.lastAttempt = new Date().toISOString();
          queueItem.lastError = uploadResult.message;
          savePersistentUploadQueue(currentQueue);
        }
        await onEntryUploadFailed(entry.id, uploadResult.message);
        continue;
      }

      // Step 2: Verification Check — Confirm cloud audio can be retrieved and played
      const streamVerify = await streamAudioFromGateway(uploadResult.audioFileId, token);
      const playbackRestricted = uploadResult.verified === true && streamVerify.errorCode === 'PLAYBACK_PERMISSION_DENIED';
      if ((!streamVerify.ok || !streamVerify.audioDataUrl) && !playbackRestricted) {
        // Cloud audio retrieval not yet verified; DO NOT delete local audio!
        const currentQueue = getPersistentUploadQueue();
        const queueItem = currentQueue.find(q => q.lessonId === item.lessonId);
        if (queueItem) {
          queueItem.attempts += 1;
          queueItem.lastAttempt = new Date().toISOString();
          queueItem.lastError = 'Cloud audio verification failed: ' + (streamVerify.error || 'Cannot retrieve cloud stream');
          savePersistentUploadQueue(currentQueue);
        }
        await onEntryUploadFailed(entry.id, 'Cloud audio verification pending. Local audio preserved.');
        continue;
      }

      // Step 3: Verified! Safely remove local audio bytes while retaining lesson record and cloud references
      await onEntrySyncedAndVerified(entry.id, uploadResult.audioFileId, uploadResult.metadataFileId);
      dequeueFromBackgroundUpload(item.lessonId);
    }
  } finally {
    isProcessingUploadQueue = false;
  }
}



export interface DriveCollectionStats {
  fileCount: number;
  audioFileCount: number;
  metadataFileCount: number;
  wordsCollected: number;
  voiceRecordings: number;
  writtenWords: number;
  phrasesAndSentences: number;
  totalContributions: number;
  reviewQueueCount: number;
  needsHelpCount: number;
}

/** Fetch current Drive contents; never substitute device counts for a failed cloud request. */
export async function fetchDriveCollectionStats(url = getGatewayUrl()): Promise<{ stats: DriveCollectionStats; checkedAt: string }> {
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'get_collection_stats', authToken: getStoredContributorToken() }),
    redirect: 'follow', mode: 'cors', cache: 'no-store', signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Google Drive returned HTTP ${response.status}.`);
  const data = await response.json();
  const fields: (keyof DriveCollectionStats)[] = ['fileCount', 'audioFileCount', 'metadataFileCount', 'wordsCollected', 'voiceRecordings', 'writtenWords', 'phrasesAndSentences', 'totalContributions', 'reviewQueueCount', 'needsHelpCount'];
  if (data.status !== 'success' || !data.stats || !fields.every(key => Number.isSafeInteger(data.stats[key]) && data.stats[key] >= 0)) {
    throw new Error(data.message || 'Google Drive did not return valid collection totals.');
  }
  return { stats: data.stats, checkedAt: String(data.checkedAt || new Date().toISOString()) };
}

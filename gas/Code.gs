/**
 * Edo Language Studio — Complete Collaborative Gateway (Phase 1)
 * Target Folder: Edo Language Studio (1eOYgm0ZyyPiw92NqsWFTYsv_9fZ8Jf2D)
 *
 * Security Architecture:
 * 1. Multi-tier contributor authorization:
 *    - Tier 1: Registered tokens in Script Properties ('CONTRIBUTOR_DIRECTORY') with roles 'speaker', 'speller', 'admin'.
 *    - Tier 2: Community contributors uploading from the web app, secured via CacheService rate limiting & strict payload sandboxing.
 * 2. Rate limiting & abuse protection: Sliding window quota via CacheService prevents storage exhaustion.
 * 3. Strict payload validation: Allowed audio MIME types, pre-decode 10 MB ceiling, identifier regex checks.
 * 4. Dual-file atomic duplicate verification: Reuses verified audio + meta pairs without duplicating files.
 * 5. Strict playback gatekeeping: Validates companion metadata, exact audioFileId match, and playback consent.
 * 6. Concurrency locking: Prevents double-submission on Person B spelling tasks.
 * 7. Consent preservation: AI voice training defaults strictly to 'denied' unless explicitly granted.
 * 8. Non-destructive self-test: Requires admin token; cleans up ONLY provably newly created test files.
 */

const TARGET_FOLDER_ID = '1eOYgm0ZyyPiw92NqsWFTYsv_9fZ8Jf2D';

// Upload size constraints
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB binary limit
const MAX_BASE64_CHARS = Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 64; // ~13.3 MB base64 string

// Rate limiting constraints for community uploads (without registered token)
const RATE_LIMIT_WINDOW_SEC = 600; // 10-minute sliding window
const MAX_COMMUNITY_UPLOADS_PER_WINDOW = 30; // Max 30 recordings per 10 minutes

const ALLOWED_MIME_TYPES = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3'
};

function hashSha256(str) {
  if (typeof str !== 'string' || !str) return '';
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8).map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

/**
 * Validates contributor authorization and resolves identity & role.
 *
 * 1. If a valid token matching CONTRIBUTOR_DIRECTORY is provided, returns registered profile.
 * 2. If action is 'admin_lock_entry', verifies either admin token or trusted approver code.
 * 3. If no token is provided:
 *    - For public/community actions ('upload_recording', 'ping', 'stream_audio', 'get_needs_spelling', 'submit_spelling'),
 *      validates rate limits via CacheService and grants 'community_contributor' role.
 *    - For administrative actions, strictly requires a verified 'admin' token.
 */
function getVerifiedContributor(providedToken, action, payload) {
  const properties = PropertiesService.getScriptProperties();
  const rawDirectory = properties.getProperty('CONTRIBUTOR_DIRECTORY');

  // Check registered contributor directory if token is supplied
  if (providedToken && typeof providedToken === 'string' && providedToken.trim().length >= 8) {
    const cleanToken = providedToken.trim();
    if (rawDirectory) {
      try {
        const directory = JSON.parse(rawDirectory);
        if (directory && typeof directory === 'object' && directory[cleanToken]) {
          const entry = directory[cleanToken];
          const role = String(entry.role || '').trim().toLowerCase();
          if (role === 'speaker' || role === 'speller' || role === 'admin') {
            return {
              id: String(entry.id || '').trim(),
              name: String(entry.name || '').trim(),
              role: role,
              isCommunity: false
            };
          }
        }
      } catch (e) {
        Logger.log('AUTH ERROR: Unable to parse CONTRIBUTOR_DIRECTORY JSON: ' + e.toString());
      }
    }
  }

  // Trusted Approver authorization for admin_lock_entry (Secret Approval Code)
  if (action === 'admin_lock_entry') {
    const cache = CacheService.getScriptCache();
    const failAttemptsKey = 'rate_approval_fail_attempts';
    const failedCount = parseInt(cache.get(failAttemptsKey) || '0', 10);
    if (failedCount >= 5) {
      Logger.log('RATE LIMIT EXCEEDED: Too many failed approval attempts.');
      return { isRateLimited: true, isApprovalRateLimit: true };
    }

    const candidate = String((payload && payload.approvalCode) || providedToken || '').trim();
    if (candidate.length >= 4) {
      const configuredHash = properties.getProperty('TRUSTED_APPROVAL_CODE_HASH');
      const configuredCode = properties.getProperty('TRUSTED_APPROVAL_CODE');

      let matched = false;
      if (configuredHash || configuredCode) {
        const candidateHash = hashSha256(candidate);
        if (configuredHash && candidateHash.toLowerCase() === configuredHash.trim().toLowerCase()) {
          matched = true;
        } else if (configuredCode && (candidate === configuredCode.trim() || candidateHash.toLowerCase() === configuredCode.trim().toLowerCase())) {
          matched = true;
        }
      }

      if (matched) {
        cache.remove(failAttemptsKey);
        return {
          id: 'trusted-speaker',
          name: 'Trusted Edo Speaker',
          role: 'trusted_approver',
          isCommunity: false
        };
      } else {
        // Increment failed attempts on wrong approval code
        cache.put(failAttemptsKey, String(failedCount + 1), 900); // 15-minute lock after 5 failures
      }
    }
  }

  // If token is invalid or omitted, check if action permits community contributor access
  const communityAllowedActions = ['upload_recording', 'ping', 'stream_audio', 'get_needs_spelling', 'submit_spelling', 'get_collection_stats', 'get_library', 'get_question_state', 'upsert_text_contribution', 'update_recording_permissions', 'record_playback', 'update_contribution'];
  if (communityAllowedActions.indexOf(action) !== -1) {
    // Enforce rate limiting for community uploads via CacheService
    if (['upload_recording', 'submit_spelling', 'upsert_text_contribution', 'update_contribution'].indexOf(action) !== -1) {
      const cache = CacheService.getScriptCache();
      const currentWindow = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SEC * 1000));
      const cacheKey = 'rate_community_uploads_' + currentWindow;
      const currentCount = parseInt(cache.get(cacheKey) || '0', 10);

      if (currentCount >= MAX_COMMUNITY_UPLOADS_PER_WINDOW) {
        Logger.log('RATE LIMIT EXCEEDED: Community upload limit reached for current window.');
        return { isRateLimited: true };
      }

      // Increment count in cache
      cache.put(cacheKey, String(currentCount + 1), RATE_LIMIT_WINDOW_SEC);
    }

    return {
      id: 'community-contributor',
      name: 'Community Contributor',
      role: 'community_contributor',
      isCommunity: true
    };
  }

  return null;
}

// A bounded completion ledger for the fixed prompt bank. Removing a file does not re-open its question.
const TEACH_PROMPT_IDS = ['word-hand', 'word-eye', 'word-water', 'word-food', 'word-house', 'word-sun', 'word-tree', 'word-book', 'word-child', 'phrase-how-are-you', 'phrase-good-morning', 'phrase-thank-you', 'sentence-your-name', 'sentence-going', 'sentence-coming'];
const PROMPT_ENGLISH_TO_ID = {
  'hand': 'word-hand',
  'eye': 'word-eye',
  'water': 'word-water',
  'food': 'word-food',
  'house': 'word-house',
  'sun': 'word-sun',
  'tree': 'word-tree',
  'book': 'word-book',
  'child': 'word-child',
  'how are you?': 'phrase-how-are-you',
  'how are you': 'phrase-how-are-you',
  'good morning': 'phrase-good-morning',
  'thank you': 'phrase-thank-you',
  'what is your name?': 'sentence-your-name',
  'what is your name': 'sentence-your-name',
  'where are you going?': 'sentence-going',
  'where are you going': 'sentence-going',
  'i am coming': 'sentence-coming'
};
function normalizedEnglish(text) { return String(text || '').trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' '); }
function answeredRecords() {
  const props = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(props).filter(function(key) { return key.indexOf('ANSWERED_Q_') === 0; }).map(function(key) { return JSON.parse(props[key]); });
}
function completedQuestions() {
  const raw = PropertiesService.getScriptProperties().getProperty('COMPLETED_QUESTIONS_V1');
  const completed = raw ? JSON.parse(raw) : {};
  if (!completed || typeof completed !== 'object' || Array.isArray(completed)) throw new Error('Completion ledger is invalid.');
  answeredRecords().forEach(function(record) { completed[record.lessonId] = record.recordingId; });
  return completed;
}
function rememberCompletedQuestion(lessonId, recordingId, englishWord, writeLocked) {
  if (!/^[a-zA-Z0-9_-]{2,80}$/.test(lessonId || '') || /^test-/.test(lessonId)) return;
  const english = normalizedEnglish(englishWord || lessonId);
  if (!english) return;
  const props = PropertiesService.getScriptProperties();
  const key = 'ANSWERED_Q_' + hashSha256(english);
  if (props.getProperty(key)) return;
  const lock = LockService.getScriptLock();
  if (!writeLocked) lock.waitLock(10000);
  try {
    if (!props.getProperty(key)) props.setProperty(key, JSON.stringify({ lessonId: lessonId, recordingId: recordingId, english: english, answeredAt: new Date().toISOString() }));
  } finally { if (!writeLocked) lock.releaseLock(); }
}
function readTombstones() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('DELETED_RECORDS_V1') || '{}') || {};
}
function archiveRevision(folder, file, meta, actor) {
  // Simplified two-file architecture: Do NOT create standalone history JSON files in Google Drive.
  // Every lesson maintains strictly one active audio file and one current metadata JSON file.
  // Optimistic concurrency version numbers and timestamps are preserved and updated in-place.
  const version = Number(meta.version) || 0;
  meta.version = version + 1;
  meta.updatedAt = new Date().toISOString();
}
function ownerKeyHash(key) {
  if (!/^[a-f0-9]{64}$/.test(String(key || ''))) return '';
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key, Utilities.Charset.UTF_8).map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}
function sharedLibraryItems(folder) {
  const files = folder.getFiles();
  const byId = new Map();
  const metas = [];
  while (files.hasNext()) {
    const file = files.next();
    if (file.isTrashed()) continue;
    byId.set(file.getId(), file);
    if (file.getName().endsWith('_meta.json')) metas.push(file);
  }
  const items = [];
  const seen = new Set();
  for (const file of metas) {
    let meta;
    try { meta = JSON.parse(file.getBlob().getDataAsString()); } catch (_) { continue; }
    if (!meta || !/^[a-zA-Z0-9_-]{2,80}$/.test(meta.recordingId || '') || !/^[a-zA-Z0-9_-]{2,80}$/.test(meta.lessonId || '') || seen.has(meta.recordingId)) continue;
    const base = meta.lessonId + '_' + meta.recordingId;
    if (file.getName() !== base + '_meta.json') continue;
    const audio = byId.get(meta.audioFileId);
    const hasAudio = Boolean(audio && audio.getSize() > 0 && (audio.getName().startsWith(base + '.') || audio.getName().startsWith(base + '_rev-')));
    if (!hasAudio && !(meta.kind === 'text' && String(meta.edoSpelling || '').trim())) continue;
    seen.add(meta.recordingId);
    const english = String(meta.englishWord || '').trim();
    if (!english) continue;
    const spelling = String(meta.edoSpelling || '').trim();

    // Strictly exclude synthetic test phrases, test verification entries, and test fixtures
    const isTestEntry =
      meta.lessonId.startsWith('test-') ||
      meta.recordingId.startsWith('test-') ||
      english.toUpperCase().indexOf('SYNC VERIFICATION') !== -1 ||
      english.toUpperCase().indexOf('SYNC TEST') !== -1 ||
      spelling.toUpperCase().indexOf('SYNC TEST') !== -1;
    if (isTestEntry) continue;

    const category = ['word', 'phrase', 'sentence'].indexOf(meta.category) !== -1 ? meta.category : (english.split(/\s+/).length <= 2 ? 'word' : 'phrase');
    const permissions = meta.permissions || {};
    rememberCompletedQuestion(meta.lessonId, meta.recordingId, meta.englishWord);
    items.push({ id: 'cloud-' + meta.recordingId, sourceLessonId: meta.lessonId,
      recordingId: meta.recordingId, english: english, edoText: spelling || undefined,
      category: category, illustrationKey: 'chat', emoji: '🗣️', hasAudio: hasAudio,
      cloudAudioFileId: hasAudio ? meta.audioFileId : undefined, cloudMetadataFileId: file.getId(),
      audioDurationSec: Number(meta.durationSec) || 0, isSampleData: false, isCommunity: true,
      syncStatus: 'synced_to_drive', status: hasAudio ? (spelling ? 'awaiting_review' : 'needs_writing') : 'needs_audio',
      version: Number(meta.version) || 0,
      reviewStatus: meta.reviewStatus || 'pending_approval',
      approvedBy: meta.approvedBy || undefined,
      distinctListenersCount: Array.isArray(meta.distinctListeners) ? meta.distinctListeners.length : 0,
      autoLocked: Boolean(meta.autoLocked),
      updatedAt: meta.updatedAt || meta.uploadedAt || '2026-01-01T00:00:00Z',
      createdAt: meta.uploadedAt || '2026-01-01T00:00:00Z',
      playbackPermission: permissions.playback === 'granted' ? 'granted' : 'denied',
      dialect: String(meta.voiceContributor && meta.voiceContributor.dialect || '') });
  }

  // Answered history is durable. Missing files leave Library, never reopen Teach Edo.
  return items;
}

/**
 * Strict Security Check: Verifies that a file belongs directly to the target studio folder.
 */
function isFileInStudioFolder(file) {
  if (!file || file.isTrashed()) return false;
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === TARGET_FOLDER_ID) {
      return true;
    }
  }
  return false;
}

/**
 * Health check endpoint (GET).
 * Administrator actions strictly require authenticated POST requests; tokens are never accepted in URLs.
 */
function doGet(e) {
  try {
    const folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    return createJsonResponse({
      status: 'ok',
      service: 'Edo Language Studio Gateway',
      folderConnected: true,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return createJsonResponse({
      status: 'error',
      message: 'Folder access failed: ' + err.toString()
    });
  }
}

/**
 * Main collaborative request handler (POST).
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  let readOnly = false;
  try { readOnly = ['ping', 'get_library', 'get_question_state', 'get_collection_stats', 'get_needs_spelling', 'stream_audio'].indexOf(JSON.parse(e.postData.contents).action) !== -1; } catch (_) {}
  try {
    if (!readOnly) lock.waitLock(10000); // Writes stay serialized; folder reads do not block uploads.
  } catch (lockErr) {
    return createJsonResponse({
      status: 'error',
      code: 'SERVER_BUSY',
      message: 'Server is processing another record. Please retry shortly.'
    });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        status: 'error',
        code: 'BAD_REQUEST',
        message: 'No payload received'
      });
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse({
        status: 'error',
        code: 'INVALID_JSON',
        message: 'Malformed JSON payload'
      });
    }

    const action = String(payload.action || '').trim();
    const authToken = payload.authToken || '';

    // 1. Contributor Identity Resolution & Abuse Gatekeeping
    const verifiedContributor = getVerifiedContributor(authToken, action, payload);
    if (!verifiedContributor) {
      return createJsonResponse({
        status: 'error',
        code: action === 'admin_lock_entry' || action === 'admin_unlock_entry' || action === 'admin_delete_entry' || action === 'admin_set_approval_code' ? 'UNAUTHORIZED_ADMIN' : 'UNAUTHORIZED',
        message: action === 'admin_lock_entry'
          ? 'Invalid six-digit approval number or administrator token.'
          : action === 'admin_set_approval_code'
            ? 'Owner administrator token required to set the six-digit approval number.'
            : 'Invalid contributor access token or unauthorized action.'
      });
    }
    if (verifiedContributor.isRateLimited) {
      return createJsonResponse({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: verifiedContributor.isApprovalRateLimit
          ? 'Too many incorrect approval attempts. Please wait 15 minutes before trying again.'
          : 'Community upload limit reached for the current window. Please retry in a few minutes.'
      });
    }

    const folder = DriveApp.getFolderById(TARGET_FOLDER_ID);

    // ACTION A: Ping / Test Connection
    if (action === 'ping') {
      return createJsonResponse({
        status: 'success',
        action: 'ping',
        verifiedUser: {
          id: verifiedContributor.id,
          name: verifiedContributor.name,
          role: verifiedContributor.role,
          isCommunity: Boolean(verifiedContributor.isCommunity)
        },
        message: 'Authentication verified. Connected to Edo Language Studio folder.'
      });
    }

    if (action === 'get_library' || action === 'get_question_state') {
      const props = PropertiesService.getScriptProperties();
      const items = action === 'get_library' || !props.getProperty('ANSWERED_LEDGER_READY_V2') ? sharedLibraryItems(folder) : [];
      props.setProperty('ANSWERED_LEDGER_READY_V2', 'true');
      const tombstones = readTombstones();
      return createJsonResponse({ status: 'success', action: action, checkedAt: new Date().toISOString(),
        items: action === 'get_library' ? items.filter(function(item) { return !tombstones[item.recordingId] && !tombstones[item.cloudMetadataFileId]; }) : undefined,
        tombstones: Object.keys(tombstones), answeredQuestionIds: Object.keys(completedQuestions()),
        answeredEnglish: answeredRecords().map(function(record) { return record.english; }) });
    }
    if (action === 'update_contribution') {
      const file = DriveApp.getFileById(String(payload.metadataFileId || ''));
      if (!isFileInStudioFolder(file) || !file.getName().endsWith('_meta.json')) return createJsonResponse({ status: 'error', code: 'ACCESS_DENIED', message: 'Contribution is not in the active collection.' });
      const meta = JSON.parse(file.getBlob().getDataAsString());
      if (meta.reviewStatus === 'approved_locked') return createJsonResponse({ status: 'error', code: 'ENTRY_LOCKED', message: 'An administrator must unlock this lesson before it can be edited.' });
      const version = Number(meta.version) || 0;
      if (payload.mutationId && meta.lastMutationId === payload.mutationId) return createJsonResponse({ status: 'success', verified: true, version: version, audioFileId: meta.audioFileId || null, metadataFileId: file.getId(), duplicate: true });
      if (!Number.isSafeInteger(payload.expectedVersion) || payload.expectedVersion !== version) return createJsonResponse({ status: 'conflict', code: 'REVISION_CONFLICT', message: 'Another user changed this lesson. Your draft is preserved; reopen the current lesson before editing.' });
      const english = payload.english === undefined ? String(meta.englishWord || '') : String(payload.english).trim();
      const spelling = payload.edoText === undefined ? String(meta.edoSpelling || '') : String(payload.edoText).trim();
      if (!english || english.length > 2000 || spelling.length > 5000) return createJsonResponse({ status: 'error', code: 'BAD_REQUEST', message: 'Invalid English or Edo text.' });
      let newAudio;
      let previousAudioFileId = null;
      const mime = String(payload.mimeType || '').split(';')[0].toLowerCase();
      if (payload.audioBase64 !== undefined) {
        if (!ALLOWED_MIME_TYPES[mime] || typeof payload.audioBase64 !== 'string' || payload.audioBase64.length > MAX_BASE64_CHARS) return createJsonResponse({ status: 'error', code: 'INVALID_AUDIO', message: 'Invalid audio format or size.' });
        const bytes = Utilities.base64Decode(payload.audioBase64);
        if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) return createJsonResponse({ status: 'error', code: 'INVALID_AUDIO', message: 'Invalid audio size.' });
        if (!payload.permissions || payload.permissions.playback !== 'granted') return createJsonResponse({ status: 'error', code: 'CONSENT_REQUIRED', message: 'Confirm the speaker’s playback permission before sharing a replacement voice.' });
        previousAudioFileId = meta.audioFileId || null;
        newAudio = folder.createFile(Utilities.newBlob(bytes, mime, meta.lessonId + '_' + meta.recordingId + '_rev-' + (version + 1) + '.' + ALLOWED_MIME_TYPES[mime]));
        if (!newAudio || newAudio.getSize() === 0) {
          return createJsonResponse({ status: 'error', code: 'STORAGE_FAILED', message: 'Failed to create replacement audio file in Google Drive.' });
        }
      }
      rememberCompletedQuestion(meta.lessonId, meta.recordingId, meta.englishWord, true);
      archiveRevision(folder, file, meta, verifiedContributor);
      meta.lastMutationId = String(payload.mutationId || '');
      meta.englishWord = english; meta.edoSpelling = spelling;
      if (newAudio) {
        meta.audioFileId = newAudio.getId();
        meta.audioFileName = newAudio.getName();
        meta.audioMimeType = mime;
        meta.audioSizeBytes = newAudio.getSize();
        meta.durationSec = Math.max(0, Number(payload.durationSec) || 0);
        meta.permissions = { playback: 'granted', aiVoiceTraining: 'denied', statementVersion: '1' };

        // Requirement: Permanently delete the previous audio file belonging to that lesson after successful replacement
        // Do not keep multiple voice recordings for the same lesson.
        // Do not delete recordings belonging to other lessons or contributors.
        if (previousAudioFileId && previousAudioFileId !== newAudio.getId()) {
          try {
            const oldAudioFile = DriveApp.getFileById(previousAudioFileId);
            if (isFileInStudioFolder(oldAudioFile)) {
              const oldAudioName = oldAudioFile.getName();
              if (oldAudioName.indexOf(meta.lessonId + '_' + meta.recordingId) === 0) {
                oldAudioFile.setTrashed(true);
              }
            }
          } catch (_) {}
        }

        // Clean up any other obsolete previous audio files for this exact lesson/recording in the studio folder
        try {
          const files = folder.getFiles();
          const targetPrefix = meta.lessonId + '_' + meta.recordingId;
          while (files.hasNext()) {
            const f = files.next();
            if (!f.isTrashed() && f.getId() !== newAudio.getId()) {
              const fn = f.getName();
              if (fn.indexOf(targetPrefix) === 0 && /\.(webm|m4a|mp4|aac|wav|ogg|mp3)$/i.test(fn)) {
                f.setTrashed(true);
              }
            }
          }
        } catch (_) {}
      }
      meta.status = meta.audioFileId ? (spelling ? 'spelling_submitted' : 'needs_spelling') : 'needs_audio';
      meta.reviewStatus = 'pending_approval';
      file.setContent(JSON.stringify(meta, null, 2));
      rememberCompletedQuestion(meta.lessonId, meta.recordingId, english, true);
      return createJsonResponse({
        status: 'success',
        action: action,
        verified: true,
        version: meta.version,
        metadataFileId: file.getId(),
        audioFileId: meta.audioFileId || null,
        previousAudioFileId: previousAudioFileId
      });
    }
    if (action === 'update_recording_permissions') {
      let file;
      try { file = DriveApp.getFileById(String(payload.metadataFileId || '')); } catch (_) { return createJsonResponse({ status: 'error', message: 'Recording metadata not found.' }); }
      if (!isFileInStudioFolder(file) || !file.getName().endsWith('_meta.json')) return createJsonResponse({ status: 'error', code: 'ACCESS_DENIED', message: 'Recording is outside the studio collection.' });
      const meta = JSON.parse(file.getBlob().getDataAsString());
      if (meta.reviewStatus === 'approved_locked' && verifiedContributor.role !== 'admin') {
        return createJsonResponse({ status: 'error', code: 'ENTRY_LOCKED', message: 'This contribution has been approved and locked by an administrator and cannot be modified.' });
      }
      const hash = ownerKeyHash(payload.ownerKey);
      const registeredOwner = !verifiedContributor.isCommunity && meta.voiceContributor && meta.voiceContributor.id === verifiedContributor.id;
      if (verifiedContributor.role !== 'admin' && !registeredOwner && !(hash && meta.ownerKeyHash === hash)) return createJsonResponse({ status: 'error', code: 'OWNER_REQUIRED', message: 'Permissions saved locally. This older cloud recording needs its owner or an administrator to authorize permission changes.' });
      const permissions = payload.permissions || {};
      if (['granted', 'denied', 'unknown'].indexOf(permissions.playback) === -1 || ['granted', 'denied', 'unknown'].indexOf(permissions.aiVoiceTraining) === -1) return createJsonResponse({ status: 'error', message: 'Invalid permissions.' });
      meta.permissions = { playback: permissions.playback, aiVoiceTraining: permissions.aiVoiceTraining === 'granted' ? 'granted' : 'denied', statementVersion: '1' };
      meta.updatedAt = new Date().toISOString();
      file.setContent(JSON.stringify(meta, null, 2));
      return createJsonResponse({ status: 'success', action: action });
    }
    if (action === 'upsert_text_contribution') {
      const lessonId = String(payload.lessonId || '').trim();
      const recordingId = String(payload.recordingId || '').trim();
      const english = String(payload.english || '').trim();
      const spelling = String(payload.edoText || '').trim();
      if (!/^[a-zA-Z0-9_-]{2,80}$/.test(lessonId) || !/^text-[a-f0-9]{64}$/.test(recordingId) || !english || !spelling || english.length > 2000 || spelling.length > 5000) {
        return createJsonResponse({ status: 'error', code: 'BAD_REQUEST', message: 'Invalid written contribution.' });
      }
      const name = lessonId + '_' + recordingId + '_meta.json';
      const existing = folder.getFilesByName(name);
      if (existing.hasNext()) {
        const file = existing.next();
        const meta = JSON.parse(file.getBlob().getDataAsString());
        if (meta.reviewStatus === 'approved_locked' && verifiedContributor.role !== 'admin') {
          return createJsonResponse({ status: 'error', code: 'ENTRY_LOCKED', message: 'This contribution has been approved and locked by an administrator and cannot be modified.' });
        }
        if (meta.englishWord !== english || meta.edoSpelling !== spelling) return createJsonResponse({ status: 'conflict', code: 'TEXT_CONFLICT', message: 'Existing spelling preserved; save a separate contribution.' });
        return createJsonResponse({ status: 'success', verified: true, duplicate: true, metadataFileId: file.getId() });
      }
      const meta = { kind: 'text', lessonId: lessonId, recordingId: recordingId, englishWord: english,
        edoSpelling: spelling, category: ['word', 'phrase', 'sentence'].indexOf(payload.category) !== -1 ? payload.category : 'word',
        status: 'needs_audio', reviewStatus: 'pending_approval', approvedBy: null, uploadedAt: new Date().toISOString(), permissions: { playback: 'denied', aiVoiceTraining: 'denied' } };
      const file = folder.createFile(Utilities.newBlob(JSON.stringify(meta), 'application/json', name));
      rememberCompletedQuestion(lessonId, recordingId, english, true);
      try {
        const props = PropertiesService.getScriptProperties();
        let known = JSON.parse(props.getProperty('KNOWN_RECORDINGS_V1') || '{}') || {};
        if (!known[recordingId]) {
          known[recordingId] = lessonId;
          props.setProperty('KNOWN_RECORDINGS_V1', JSON.stringify(known));
        }
      } catch (_) {}
      return createJsonResponse({ status: 'success', verified: file.getSize() > 0, metadataFileId: file.getId() });
    }

    // Always read the current folder: deleted/trashed files must immediately leave progress totals.
    if (action === 'get_collection_stats') {
      const files = folder.getFiles();
      const byId = new Map();
      const metadataFiles = [];
      let fileCount = 0;
      let audioFileCount = 0;
      while (files.hasNext()) {
        const file = files.next();
        if (file.isTrashed()) continue;
        fileCount++;
        byId.set(file.getId(), file);
        if (/\.(webm|m4a|mp4|aac|wav|ogg|mp3)$/i.test(file.getName())) audioFileCount++;
        if (file.getName().endsWith('_meta.json')) metadataFiles.push(file);
      }
      const words = new Set();
      const writtenWords = new Set();
      const recordings = new Set();
      const textRecords = new Set();
      let phrasesAndSentences = 0;
      let reviewQueueCount = 0;
      let needsHelpCount = 0;
      for (const file of metadataFiles) {
        let meta;
        try { meta = JSON.parse(file.getBlob().getDataAsString()); } catch (_) { continue; }
        if (meta && meta.kind === 'text' && !byId.has(meta.audioFileId) && /^[a-zA-Z0-9_-]{2,80}$/.test(meta.lessonId || '') && /^text-[a-f0-9]{64}$/.test(meta.recordingId || '') &&
            file.getName() === meta.lessonId + '_' + meta.recordingId + '_meta.json' && String(meta.edoSpelling || '').trim() && !textRecords.has(meta.recordingId)) {
          const english = String(meta.englishWord || '').trim().toLowerCase();
          textRecords.add(meta.recordingId);
          if (meta.category === 'word' && english) { words.add(english); writtenWords.add(english); }
          else if (english) phrasesAndSentences++;
          needsHelpCount++;
          rememberCompletedQuestion(meta.lessonId, meta.recordingId, meta.englishWord);
          continue;
        }
        if (!meta || typeof meta.recordingId !== 'string' || typeof meta.lessonId !== 'string' ||
            /^(sync-test-|test-)/.test(meta.recordingId) || /^(sync-test-|test-)/.test(meta.lessonId) ||
            !byId.has(meta.audioFileId) || recordings.has(meta.recordingId)) continue;
        const audio = byId.get(meta.audioFileId);
        const expectedBase = meta.lessonId + '_' + meta.recordingId;
        if (audio.getSize() === 0 || !(audio.getName().startsWith(expectedBase + '.') || audio.getName().startsWith(expectedBase + '_rev-')) ||
            file.getName() !== expectedBase + '_meta.json') continue;
        recordings.add(meta.recordingId);
        rememberCompletedQuestion(meta.lessonId, meta.recordingId, meta.englishWord);
        const english = String(meta.englishWord || '').trim().toLowerCase();
        const spelling = String(meta.edoSpelling || '').trim();
        const category = ['word', 'phrase', 'sentence'].indexOf(meta.category) !== -1
          ? meta.category : (english.split(/\s+/).length <= 2 ? 'word' : 'phrase');
        if (category === 'word' && english) {
          words.add(english);
          if (spelling) writtenWords.add(english);
        } else if (english) phrasesAndSentences++;
        if (!spelling) needsHelpCount++;
        else if (!meta.verification || meta.verification.isVerified !== true) reviewQueueCount++;
      }
      return createJsonResponse({
        status: 'success', action: action, checkedAt: new Date().toISOString(),
        stats: { fileCount: fileCount, audioFileCount: audioFileCount,
          metadataFileCount: metadataFiles.length, wordsCollected: words.size,
          voiceRecordings: recordings.size, writtenWords: writtenWords.size,
          phrasesAndSentences: phrasesAndSentences, totalContributions: recordings.size + textRecords.size,
          reviewQueueCount: reviewQueueCount, needsHelpCount: needsHelpCount }
      });
    }

    // ACTION B: Upload Recording (Person A)
    if (action === 'upload_recording') {
      // Role Check: Speakers, Admins, and Community Contributors are authorized to upload voice
      const role = verifiedContributor.role;
      if (role !== 'speaker' && role !== 'admin' && role !== 'community_contributor') {
        return createJsonResponse({
          status: 'error',
          code: 'FORBIDDEN_ROLE',
          message: 'Your role (' + role + ') is not authorized to upload voice recordings.'
        });
      }

      const lessonId = String(payload.lessonId || '').trim();
      const recordingId = String(payload.recordingId || '').trim();
      if (readTombstones()[recordingId]) return createJsonResponse({ status: 'error', code: 'RECORD_DELETED', message: 'This record was deleted by the administrator. Local recovery audio is preserved.' });
      const english = String(payload.english || '').trim();
      const edoText = String(payload.edoText || '').trim();
      const audioBase64 = payload.audioBase64;
      const mimeType = String(payload.mimeType || '').split(';')[0].trim().toLowerCase();
      const durationSec = Number(payload.durationSec) || 0;
      const permissions = payload.permissions || {};
      const dialect = String(payload.dialect || 'Standard Benin').trim();
      const recordedAt = payload.recordedAt || new Date().toISOString();

      const idPattern = /^[a-zA-Z0-9_\-]{2,80}$/;
      if (!idPattern.test(lessonId) || !idPattern.test(recordingId)) {
        return createJsonResponse({
          status: 'error',
          code: 'INVALID_IDENTIFIERS',
          message: 'Lesson ID and Recording ID must be alphanumeric (2-80 chars).'
        });
      }

      if (!ALLOWED_MIME_TYPES[mimeType]) {
        return createJsonResponse({
          status: 'error',
          code: 'UNSUPPORTED_AUDIO_FORMAT',
          message: 'Unsupported audio MIME type: ' + mimeType
        });
      }
      const extension = ALLOWED_MIME_TYPES[mimeType];

      if (!audioBase64 || typeof audioBase64 !== 'string') {
        return createJsonResponse({
          status: 'error',
          code: 'MISSING_AUDIO_DATA',
          message: 'Missing audio base64 payload.'
        });
      }
      if (audioBase64.length > MAX_BASE64_CHARS) {
        return createJsonResponse({
          status: 'error',
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Audio payload string exceeds maximum limit (10 MB).'
        });
      }

      let audioBytes;
      try {
        audioBytes = Utilities.base64Decode(audioBase64);
      } catch (decodeErr) {
        return createJsonResponse({
          status: 'error',
          code: 'CORRUPTED_AUDIO_DATA',
          message: 'Failed to decode audio. Upload was truncated or corrupted in transit.'
        });
      }

      if (audioBytes.length === 0 || audioBytes.length > MAX_AUDIO_BYTES) {
        return createJsonResponse({
          status: 'error',
          code: 'INVALID_AUDIO_SIZE',
          message: 'Decoded audio size is invalid or exceeds 10 MB.'
        });
      }

      // -------------------------------------------------------------
      // ATOMIC DUPLICATE CHECK: Prevent duplicate recordings for the same lesson
      // -------------------------------------------------------------
      const audioFileName = lessonId + '_' + recordingId + '.' + extension;
      const metaFileName = lessonId + '_' + recordingId + '_meta.json';

      // 1. Check for exact match by filename or any existing active metadata for this lessonId
      let existingMeta = null;
      const exactMetaFiles = folder.getFilesByName(metaFileName);
      if (exactMetaFiles.hasNext()) {
        existingMeta = exactMetaFiles.next();
      } else {
        // Search folder for existing companion metadata belonging to this lessonId
        const lessonFiles = folder.getFiles();
        while (lessonFiles.hasNext()) {
          const lf = lessonFiles.next();
          if (!lf.isTrashed() && lf.getName().indexOf(lessonId + '_') === 0 && lf.getName().endsWith('_meta.json')) {
            existingMeta = lf;
            break;
          }
        }
      }

      if (existingMeta) {
        try {
          const parsedMeta = JSON.parse(existingMeta.getBlob().getDataAsString());
          if (parsedMeta.reviewStatus === 'approved_locked' && normalizedEnglish(parsedMeta.englishWord) !== normalizedEnglish(english)) {
            return createJsonResponse({ status: 'error', code: 'ENTRY_LOCKED', message: 'Approved lesson preserved.' });
          }

          // Case A: Lesson already has an active audio file in Google Drive!
          if (parsedMeta.audioFileId) {
            let currentAudio = null;
            try { currentAudio = DriveApp.getFileById(parsedMeta.audioFileId); } catch (_) {}
            if (currentAudio && isFileInStudioFolder(currentAudio) && currentAudio.getSize() > 0) {
              // If spelling was provided in this upload and was missing or updated, attach to existing metadata without creating another audio file!
              if (edoText && (!parsedMeta.edoSpelling || parsedMeta.edoSpelling !== edoText)) {
                parsedMeta.edoSpelling = edoText;
                parsedMeta.status = 'spelling_submitted';
                parsedMeta.updatedAt = new Date().toISOString();
                existingMeta.setContent(JSON.stringify(parsedMeta, null, 2));
              }
              rememberCompletedQuestion(lessonId, parsedMeta.recordingId, parsedMeta.englishWord || english, true);
              return createJsonResponse({
                status: 'success',
                duplicate: true,
                verified: true,
                action: 'upload_recording',
                lessonId: lessonId,
                recordingId: parsedMeta.recordingId,
                audioFileId: currentAudio.getId(),
                metadataFileId: existingMeta.getId(),
                message: 'Existing recording preserved; spelling updated in existing metadata.'
              });
            }
          }

          // Case B: Lesson exists as a text-only stub waiting for audio (needs_audio)
          if (!parsedMeta.audioFileId) {
            const audioBlob = Utilities.newBlob(audioBytes, mimeType, audioFileName);
            const audioFile = folder.createFile(audioBlob);
            parsedMeta.audioFileId = audioFile.getId();
            parsedMeta.audioFileName = audioFileName;
            parsedMeta.audioMimeType = mimeType;
            parsedMeta.audioSizeBytes = audioBytes.length;
            parsedMeta.durationSec = durationSec;
            parsedMeta.status = parsedMeta.edoSpelling ? 'spelling_submitted' : 'needs_spelling';
            parsedMeta.updatedAt = new Date().toISOString();
            if (edoText && !parsedMeta.edoSpelling) parsedMeta.edoSpelling = edoText;
            existingMeta.setContent(JSON.stringify(parsedMeta, null, 2));
            rememberCompletedQuestion(lessonId, parsedMeta.recordingId, parsedMeta.englishWord || english, true);
            return createJsonResponse({
              status: 'success',
              duplicate: false,
              verified: true,
              action: 'upload_recording',
              lessonId: lessonId,
              recordingId: parsedMeta.recordingId,
              audioFileId: audioFile.getId(),
              metadataFileId: existingMeta.getId(),
              recordingStatus: parsedMeta.status,
              message: 'Audio attached to existing lesson metadata in Google Drive.'
            });
          }

          if (parsedMeta.reviewStatus === 'approved_locked') {
            return createJsonResponse({ status: 'error', code: 'ENTRY_LOCKED', message: 'An administrator must unlock this lesson before repair.' });
          }
        } catch (e) {
          return createJsonResponse({ status: 'error', code: 'EXISTING_RECORD_UNAVAILABLE', message: 'Existing metadata requires administrator repair; original files preserved.' });
        }
      }

      // Explicit Opt-In: AI training defaults strictly to DENIED unless explicitly granted
      const explicitAiConsent = (permissions.aiVoiceTraining === 'granted') ? 'granted' : 'denied';
      const playbackConsent = permissions.playback === 'granted' ? 'granted' : 'denied';

      // Status: 'needs_spelling' if spelling is blank; 'spelling_submitted' if provided
      const recordingStatus = edoText.length > 0 ? 'spelling_submitted' : 'needs_spelling';

      // 1. Create Audio File
      const audioBlob = Utilities.newBlob(audioBytes, mimeType, audioFileName);
      const audioFile = folder.createFile(audioBlob);

      // 2. Create Companion Metadata JSON (Using Server-Verified Identity)
      const metadata = {
        ownerKeyHash: ownerKeyHash(payload.ownerKey),
        recordingId: recordingId,
        lessonId: lessonId,
        englishWord: english,
        category: ['word', 'phrase', 'sentence'].indexOf(payload.category) !== -1 ? payload.category : (english.trim().split(/\s+/).length <= 2 ? 'word' : 'phrase'),
        edoSpelling: edoText,
        status: recordingStatus,
        reviewStatus: 'pending_approval',
        approvedBy: null,
        audioFileId: audioFile.getId(),
        audioFileName: audioFileName,
        audioMimeType: mimeType,
        audioSizeBytes: audioBytes.length,
        durationSec: durationSec,
        voiceContributor: {
          id: verifiedContributor.id,
          name: verifiedContributor.name,
          role: verifiedContributor.role,
          dialect: dialect,
          recordedAt: recordedAt
        },
        spellingContributor: edoText.length > 0 ? {
          id: verifiedContributor.id,
          name: verifiedContributor.name,
          role: verifiedContributor.role,
          submittedAt: new Date().toISOString()
        } : null,
        permissions: {
          playback: playbackConsent,
          aiVoiceTraining: explicitAiConsent,
          statementVersion: '1'
        },
        verification: {
          isVerified: false,
          verifiedBy: null,
          verifiedAt: null
        },
        uploadedAt: new Date().toISOString()
      };

      const metaBlob = Utilities.newBlob(
        JSON.stringify(metadata, null, 2),
        'application/json',
        metaFileName
      );
      const metaFile = folder.createFile(metaBlob);

      // 3. Strict Verification Step: Confirm both files exist, non-empty, and indexed
      const verifiedAudio = DriveApp.getFileById(audioFile.getId());
      const verifiedMeta = DriveApp.getFileById(metaFile.getId());

      if (!verifiedAudio || verifiedAudio.getSize() === 0 || !verifiedMeta || verifiedMeta.getSize() === 0) {
        throw new Error('Cloud storage verification failed: File was not indexed correctly.');
      }

      rememberCompletedQuestion(lessonId, recordingId, english, true);
      try {
        const props = PropertiesService.getScriptProperties();
        let known = JSON.parse(props.getProperty('KNOWN_RECORDINGS_V1') || '{}') || {};
        if (!known[recordingId]) {
          known[recordingId] = lessonId;
          props.setProperty('KNOWN_RECORDINGS_V1', JSON.stringify(known));
        }
      } catch (_) {}
      return createJsonResponse({
        status: 'success',
        duplicate: false,
        action: 'upload_recording',
        lessonId: lessonId,
        recordingId: recordingId,
        audioFileId: verifiedAudio.getId(),
        metadataFileId: verifiedMeta.getId(),
        recordingStatus: recordingStatus,
        verified: true,
        message: 'Recording and metadata verified and stored securely in Google Drive.'
      });
    }

    // ACTION C: Retrieve Shared "Needs Edo Spelling" Queue (Person B)
    if (action === 'get_needs_spelling') {
      const files = folder.getFiles();
      const needsSpellingQueue = [];

      while (files.hasNext()) {
        const file = files.next();
        if (file.isTrashed()) continue;
        const name = file.getName();
        if (name.endsWith('_meta.json')) {
          try {
            const metaContent = JSON.parse(file.getBlob().getDataAsString());
            if (metaContent.status === 'needs_spelling') {
              // Strictly verify companion audio file exists and is not trashed
              if (metaContent.audioFileId) {
                try {
                  const aFile = DriveApp.getFileById(metaContent.audioFileId);
                  if (!aFile || aFile.isTrashed() || !isFileInStudioFolder(aFile)) continue;
                } catch (_) {
                  continue; // Audio deleted directly from Drive
                }
              }
              needsSpellingQueue.push({
                recordingId: metaContent.recordingId,
                lessonId: metaContent.lessonId,
                englishWord: metaContent.englishWord,
                audioFileId: metaContent.audioFileId,
                metadataFileId: file.getId(),
                durationSec: metaContent.durationSec,
                voiceContributor: metaContent.voiceContributor,
                uploadedAt: metaContent.uploadedAt
              });
            }
          } catch (e) {
            // Skip unreadable files
          }
        }
      }

      return createJsonResponse({
        status: 'success',
        action: 'get_needs_spelling',
        count: needsSpellingQueue.length,
        items: needsSpellingQueue
      });
    }

    // ACTION D: Authenticated Private Playback Stream (Strict Verification)
    if (action === 'stream_audio') {
      const fileId = String(payload.fileId || '').trim();
      if (!fileId) {
        return createJsonResponse({ status: 'error', code: 'MISSING_FILE_ID', message: 'Missing audio file ID.' });
      }

      let audioFile;
      try {
        audioFile = DriveApp.getFileById(fileId);
      } catch (err) {
        return createJsonResponse({ status: 'error', code: 'NOT_FOUND', message: 'Audio file not found.' });
      }

      // Check 1: Must belong strictly to the studio folder
      if (!isFileInStudioFolder(audioFile)) {
        return createJsonResponse({ status: 'error', code: 'ACCESS_DENIED', message: 'Access denied: File is outside the studio folder.' });
      }

      // Check 2: Locate companion metadata file
      const audioName = audioFile.getName();
      const dotIndex = audioName.lastIndexOf('.');
      const baseName = dotIndex !== -1 ? audioName.substring(0, dotIndex) : audioName;
      const expectedMetaName = baseName + '_meta.json';
      let metaFile = null;
      const metaFiles = folder.getFilesByName(expectedMetaName);

      if (metaFiles.hasNext()) {
        metaFile = metaFiles.next();
      } else {
        // Robust fallback: search active metadata files in folder for matching audioFileId
        const allFiles = folder.getFiles();
        while (allFiles.hasNext()) {
          const f = allFiles.next();
          if (!f.isTrashed() && f.getName().endsWith('_meta.json')) {
            try {
              const m = JSON.parse(f.getBlob().getDataAsString());
              if (m && m.audioFileId === fileId) {
                metaFile = f;
                break;
              }
            } catch (_) {}
          }
        }
      }

      if (!metaFile) {
        return createJsonResponse({
          status: 'error',
          code: 'METADATA_NOT_FOUND',
          message: 'Playback denied: Companion metadata file is missing.'
        });
      }

      let metaContent;
      try {
        metaContent = JSON.parse(metaFile.getBlob().getDataAsString());
      } catch (e) {
        return createJsonResponse({
          status: 'error',
          code: 'METADATA_UNREADABLE',
          message: 'Playback denied: Companion metadata is unreadable or corrupted.'
        });
      }

      // Check 3: Audio File ID must EXACTLY match the companion metadata record
      if (!metaContent || metaContent.audioFileId !== fileId) {
        return createJsonResponse({
          status: 'error',
          code: 'METADATA_MISMATCH',
          message: 'Playback denied: Audio file ID does not match companion metadata reference.'
        });
      }

      // Check 4: Explicit Playback Consent Check (only deny if explicitly set to 'denied')
      if (!metaContent.permissions || metaContent.permissions.playback !== 'granted') {
        return createJsonResponse({
          status: 'error',
          code: 'PLAYBACK_PERMISSION_DENIED',
          message: 'Playback denied: Contributor consent has not been granted for this recording.'
        });
      }

      const audioBytes = audioFile.getBlob().getBytes();
      const rawContentType = audioFile.getBlob().getContentType();
      let mimeType = metaContent.audioMimeType || rawContentType || 'audio/webm';
      if (!mimeType || mimeType === 'application/octet-stream') {
        const fn = (metaContent.audioFileName || audioFile.getName() || '').toLowerCase();
        if (fn.endsWith('.wav')) mimeType = 'audio/wav';
        else if (fn.endsWith('.m4a') || fn.endsWith('.mp4')) mimeType = 'audio/mp4';
        else if (fn.endsWith('.aac')) mimeType = 'audio/aac';
        else if (fn.endsWith('.mp3')) mimeType = 'audio/mpeg';
        else if (fn.endsWith('.ogg')) mimeType = 'audio/ogg';
        else mimeType = 'audio/webm';
      }
      const base64Data = Utilities.base64Encode(audioBytes);
      const dataUrl = 'data:' + mimeType + ';base64,' + base64Data;

      return createJsonResponse({
        status: 'success',
        action: 'stream_audio',
        fileId: fileId,
        mimeType: mimeType,
        audioDataUrl: dataUrl
      });
    }

    // ACTION E: Submit Edo Spelling (Person B - Updates Metadata Only)
    if (action === 'submit_spelling') {
      const role = verifiedContributor.role;
      // Spellers, Admins, and Community Contributors can submit spellings
      if (role !== 'speller' && role !== 'admin' && role !== 'community_contributor') {
        return createJsonResponse({
          status: 'error',
          code: 'FORBIDDEN_ROLE',
          message: 'Your role (' + role + ') is not authorized to submit Edo spellings.'
        });
      }

      const metadataFileId = String(payload.metadataFileId || '').trim();
      const edoSpelling = String(payload.edoSpelling || '').trim();

      if (!metadataFileId || !edoSpelling) {
        return createJsonResponse({ status: 'error', code: 'BAD_REQUEST', message: 'Missing metadataFileId or edoSpelling.' });
      }

      let metaFile;
      try {
        metaFile = DriveApp.getFileById(metadataFileId);
      } catch (err) {
        return createJsonResponse({ status: 'error', code: 'NOT_FOUND', message: 'Metadata record not found.' });
      }

      // Check 1: Must belong strictly to the studio folder
      if (!isFileInStudioFolder(metaFile)) {
        return createJsonResponse({ status: 'error', code: 'ACCESS_DENIED', message: 'Access denied: Record is outside the studio folder.' });
      }

      let metaContent;
      try {
        metaContent = JSON.parse(metaFile.getBlob().getDataAsString());
      } catch (e) {
        return createJsonResponse({ status: 'error', code: 'METADATA_UNREADABLE', message: 'Metadata file is corrupted.' });
      }

      if (String(metaContent.edoSpelling || '').trim() === edoSpelling) return createJsonResponse({ status: 'success', action: 'submit_spelling', duplicate: true });
      if (edoSpelling.length > 5000 || !metaFile.getName().endsWith('_meta.json') || !metaContent.recordingId || !metaContent.lessonId) return createJsonResponse({ status: 'error', code: 'BAD_REQUEST', message: 'Invalid spelling record.' });

      if (metaContent.reviewStatus === 'approved_locked' && verifiedContributor.role !== 'admin') {
        return createJsonResponse({
          status: 'error',
          code: 'ENTRY_LOCKED',
          message: 'This contribution has been approved and locked by an administrator and cannot be modified.'
        });
      }

      // Check 2: Strict Status Check (Must be 'needs_spelling')
      if (metaContent.status !== 'needs_spelling') {
        return createJsonResponse({
          status: 'conflict',
          code: 'SPELLING_ALREADY_SUBMITTED',
          message: 'Recording is no longer awaiting spelling. Current status is "' + metaContent.status + '".',
          currentSpelling: metaContent.edoSpelling || '',
          submittedBy: metaContent.spellingContributor ? metaContent.spellingContributor.name : 'Another Contributor'
        });
      }

      archiveRevision(folder, metaFile, metaContent, verifiedContributor);
      // Update spelling and stamp server-verified identity
      metaContent.edoSpelling = edoSpelling;
      metaContent.status = 'spelling_submitted'; // Awaiting community review
      metaContent.spellingContributor = {
        id: verifiedContributor.id,
        name: verifiedContributor.name,
        role: verifiedContributor.role,
        submittedAt: new Date().toISOString()
      };

      metaFile.setContent(JSON.stringify(metaContent, null, 2));

      return createJsonResponse({
        action: 'submit_spelling',
        recordingId: metaContent.recordingId,
        lessonId: metaContent.lessonId,
        edoSpelling: edoSpelling,
        status: 'spelling_submitted',
        message: 'Edo spelling attached successfully. Contribution moved to review.'
      });
    }

    // ACTION F: Admin Lock Entry (Approval & Protection)
    if (action === 'admin_lock_entry') {
      if (verifiedContributor.role !== 'admin' && verifiedContributor.role !== 'trusted_approver') {
        return createJsonResponse({
          status: 'error',
          code: 'UNAUTHORIZED_ADMIN',
          message: 'Invalid six-digit approval number or administrator token.'
        });
      }
      const metadataFileId = String(payload.metadataFileId || '').trim();
      if (!metadataFileId) {
        return createJsonResponse({ status: 'error', code: 'BAD_REQUEST', message: 'Missing metadataFileId.' });
      }
      let metaFile;
      try {
        metaFile = DriveApp.getFileById(metadataFileId);
      } catch (err) {
        return createJsonResponse({ status: 'error', code: 'NOT_FOUND', message: 'Metadata record not found.' });
      }
      if (!isFileInStudioFolder(metaFile) || !metaFile.getName().endsWith('_meta.json')) {
        return createJsonResponse({ status: 'error', code: 'ACCESS_DENIED', message: 'Record is outside studio collection.' });
      }
      let meta;
      try {
        meta = JSON.parse(metaFile.getBlob().getDataAsString());
      } catch (e) {
        return createJsonResponse({ status: 'error', code: 'METADATA_UNREADABLE', message: 'Metadata file is unreadable.' });
      }
      if (!String(meta.edoSpelling || '').trim() || !meta.audioFileId) return createJsonResponse({ status: 'error', code: 'INCOMPLETE_LESSON', message: 'Complete spelling and voice before approving.' });
      archiveRevision(folder, metaFile, meta, verifiedContributor);
      meta.reviewStatus = 'approved_locked';
      meta.approvedBy = {
        id: verifiedContributor.id,
        name: verifiedContributor.name,
        role: verifiedContributor.role,
        approvedAt: new Date().toISOString()
      };
      meta.updatedAt = new Date().toISOString();
      metaFile.setContent(JSON.stringify(meta, null, 2));
      return createJsonResponse({
        status: 'success',
        action: 'admin_lock_entry',
        metadataFileId: metadataFileId,
        reviewStatus: 'approved_locked',
        approvedBy: meta.approvedBy
      });
    }

    // ACTION F2: Owner Sets Six-Digit Approval Number (Strictly requires owner admin token)
    if (action === 'admin_set_approval_code') {
      if (verifiedContributor.role !== 'admin') {
        return createJsonResponse({
          status: 'error',
          code: 'UNAUTHORIZED_ADMIN',
          message: 'Owner administrator authorization required to set the six-digit approval number.'
        });
      }
      const newCode = String(payload.approvalCode || '').trim();
      if (!/^\d{6}$/.test(newCode)) {
        return createJsonResponse({
          status: 'error',
          code: 'INVALID_APPROVAL_CODE',
          message: 'Approval number must be exactly 6 digits (0-9).'
        });
      }
      const props = PropertiesService.getScriptProperties();
      props.setProperty('TRUSTED_APPROVAL_CODE_HASH', hashSha256(newCode));
      props.deleteProperty('TRUSTED_APPROVAL_CODE');
      CacheService.getScriptCache().remove('rate_approval_fail_attempts');
      return createJsonResponse({
        status: 'success',
        action: 'admin_set_approval_code',
        message: 'Six-digit approval number updated.'
      });
    }

    // ACTION G: Admin Unlock Entry (Strictly requires owner admin token)
    if (action === 'admin_unlock_entry') {
      if (verifiedContributor.role !== 'admin') {
        return createJsonResponse({
          status: 'error',
          code: 'UNAUTHORIZED_ADMIN',
          message: 'Owner administrator authorization required to unlock contributions. Trusted approvers cannot unlock records.'
        });
      }
      const metadataFileId = String(payload.metadataFileId || '').trim();
      if (!metadataFileId) {
        return createJsonResponse({ status: 'error', code: 'BAD_REQUEST', message: 'Missing metadataFileId.' });
      }
      let metaFile;
      try {
        metaFile = DriveApp.getFileById(metadataFileId);
      } catch (err) {
        return createJsonResponse({ status: 'error', code: 'NOT_FOUND', message: 'Metadata record not found.' });
      }
      if (!isFileInStudioFolder(metaFile) || !metaFile.getName().endsWith('_meta.json')) {
        return createJsonResponse({ status: 'error', code: 'ACCESS_DENIED', message: 'Record is outside studio collection.' });
      }
      let meta;
      try {
        meta = JSON.parse(metaFile.getBlob().getDataAsString());
      } catch (e) {
        return createJsonResponse({ status: 'error', code: 'METADATA_UNREADABLE', message: 'Metadata file is unreadable.' });
      }
      meta.reviewStatus = 'pending_approval';
      meta.approvedBy = null;
      meta.updatedAt = new Date().toISOString();
      metaFile.setContent(JSON.stringify(meta, null, 2));
      return createJsonResponse({
        status: 'success',
        action: 'admin_unlock_entry',
        metadataFileId: metadataFileId,
        reviewStatus: 'pending_approval'
      });
    }

    // ACTION H: Record Playback Event & Auto-Lock at 5 Distinct Listeners
    if (action === 'record_playback') {
      const metadataFileId = String(payload.metadataFileId || '').trim();
      const listenerToken = String(payload.listenerToken || payload.listenerId || '').trim();
      if (!metadataFileId) {
        return createJsonResponse({ status: 'error', code: 'BAD_REQUEST', message: 'Missing metadataFileId.' });
      }
      let metaFile;
      try {
        metaFile = DriveApp.getFileById(metadataFileId);
      } catch (_) {
        return createJsonResponse({ status: 'error', code: 'NOT_FOUND', message: 'Metadata record not found.' });
      }
      if (!isFileInStudioFolder(metaFile) || !metaFile.getName().endsWith('_meta.json')) {
        return createJsonResponse({ status: 'error', code: 'ACCESS_DENIED', message: 'Record is outside studio collection.' });
      }
      let meta;
      try {
        meta = JSON.parse(metaFile.getBlob().getDataAsString());
      } catch (_) {
        return createJsonResponse({ status: 'error', code: 'METADATA_UNREADABLE', message: 'Metadata is unreadable.' });
      }

      meta.playCount = Number(meta.playCount || 0) + 1;
      meta.distinctListeners = Array.isArray(meta.distinctListeners) ? meta.distinctListeners : [];

      if (listenerToken && /^[a-zA-Z0-9_-]{8,128}$/.test(listenerToken)) {
        // Compute SHA-256 digest of listener token for privacy-safe deduplication
        const hashedListener = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, listenerToken, Utilities.Charset.UTF_8)
          .map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); })
          .join('');

        if (meta.distinctListeners.indexOf(hashedListener) === -1) {
          meta.distinctListeners.push(hashedListener);
        }
      }

      // Listening is not administrator approval. Playback counts never change review status.
      metaFile.setContent(JSON.stringify(meta, null, 2));

      return createJsonResponse({
        status: 'success',
        action: 'record_playback',
        metadataFileId: metadataFileId,
        playCount: meta.playCount,
        distinctListenersCount: meta.distinctListeners.length,
        reviewStatus: meta.reviewStatus,
        autoLocked: Boolean(meta.autoLocked)
      });
    }

    // ACTION I: Admin Permanent Deletion (Authoritative Cloud Deletion & Tombstone)
    if (action === 'admin_delete_entry') {
      if (verifiedContributor.role !== 'admin') {
        return createJsonResponse({
          status: 'error',
          code: 'UNAUTHORIZED_ADMIN',
          message: 'Admin authorization required to delete contributions.'
        });
      }
      const metadataFileId = String(payload.metadataFileId || '').trim();
      if (!metadataFileId) {
        return createJsonResponse({ status: 'error', code: 'BAD_REQUEST', message: 'Missing metadataFileId.' });
      }
      let metaFile;
      try {
        metaFile = DriveApp.getFileById(metadataFileId);
      } catch (err) {
        return createJsonResponse({ status: 'error', code: 'NOT_FOUND', message: 'Metadata record not found.' });
      }
      if (!isFileInStudioFolder(metaFile) || !metaFile.getName().endsWith('_meta.json')) {
        return createJsonResponse({ status: 'error', code: 'ACCESS_DENIED', message: 'Record is outside studio collection.' });
      }
      let meta;
      try {
        meta = JSON.parse(metaFile.getBlob().getDataAsString());
      } catch (e) {
        return createJsonResponse({ status: 'error', code: 'METADATA_UNREADABLE', message: 'Metadata file is unreadable.' });
      }

      const lessonId = meta.lessonId;
      const recordingId = meta.recordingId;
      const audioFileId = meta.audioFileId;

      // Trash audio file if present
      if (audioFileId) {
        try {
          const audioFile = DriveApp.getFileById(audioFileId);
          if (isFileInStudioFolder(audioFile)) {
            audioFile.setTrashed(true);
          }
        } catch (_) {}
      }

      // Trash metadata file
      metaFile.setTrashed(true);

      // Record tombstone in Script Properties so clients purge this entry
      const props = PropertiesService.getScriptProperties();
      let tombstones = {};
      try {
        tombstones = JSON.parse(props.getProperty('DELETED_RECORDS_V1') || '{}') || {};
      } catch (_) {}
      tombstones[recordingId] = {
        lessonId: lessonId,
        deletedAt: new Date().toISOString()
      };
      props.setProperty('DELETED_RECORDS_V1', JSON.stringify(tombstones));

      // Check whether another active, valid contribution in the studio folder still answers this question
      const deletedEnglish = normalizedEnglish(meta.englishWord || lessonId);
      const remainingItems = sharedLibraryItems(folder);
      const otherActiveAnswers = remainingItems.some(function(item) {
        if (item.recordingId === recordingId || item.cloudMetadataFileId === metadataFileId) return false;
        if (tombstones[item.recordingId] || tombstones[item.cloudMetadataFileId]) return false;
        const otherNorm = normalizedEnglish(item.english);
        return otherNorm === deletedEnglish || item.sourceLessonId === lessonId;
      });

      if (otherActiveAnswers) {
        // Another active lesson still answers this question; keep it answered
        rememberCompletedQuestion(lessonId, recordingId, meta.englishWord, true);
      } else {
        // No other active contribution answers this question: reopen it in Teach Edo!
        if (deletedEnglish) {
          props.deleteProperty('ANSWERED_Q_' + hashSha256(deletedEnglish));
        }
        let completed = {};
        try {
          completed = JSON.parse(props.getProperty('COMPLETED_QUESTIONS_V1') || '{}') || {};
        } catch (_) {}
        if (completed[lessonId]) {
          delete completed[lessonId];
          props.setProperty('COMPLETED_QUESTIONS_V1', JSON.stringify(completed));
        }
      }

      return createJsonResponse({
        status: 'success',
        action: 'admin_delete_entry',
        recordingId: recordingId,
        lessonId: lessonId,
        tombstoneRecorded: true,
        message: 'Entry permanently removed and tombstone registered.'
      });
    }

    return createJsonResponse({
      status: 'error',
      code: 'UNKNOWN_ACTION',
      message: 'Unknown action: ' + action
    });
  } catch (err) {
    return createJsonResponse({
      status: 'error',
      code: 'SERVER_EXCEPTION',
      message: 'Gateway execution error: ' + err.toString()
    });
  } finally {
    if (!readOnly) lock.releaseLock();
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// -------------------------------------------------------------
// PRIVATE IN-EDITOR TEST SUITE
// Requires manually configured admin credential in CONTRIBUTOR_DIRECTORY.
// Deletes ONLY files provably created by this specific run.
// -------------------------------------------------------------

function runFullGatewaySelfTest() {
  Logger.log('=== Starting Gateway Verification Test ===');
  let allTestsPassed = true;

  const folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
  Logger.log('TEST 1: Target folder connected: "' + folder.getName() + '"');

  // Verify that CONTRIBUTOR_DIRECTORY exists
  const properties = PropertiesService.getScriptProperties();
  const directoryRaw = properties.getProperty('CONTRIBUTOR_DIRECTORY');

  if (!directoryRaw) {
    Logger.log('FAILED: No CONTRIBUTOR_DIRECTORY found in Script Properties.');
    Logger.log('Please open Project Settings (gear icon), add a Script Property named "CONTRIBUTOR_DIRECTORY", and enter your valid contributor JSON before running this test.');
    return;
  }

  let directory;
  try {
    directory = JSON.parse(directoryRaw);
  } catch (e) {
    Logger.log('FAILED: CONTRIBUTOR_DIRECTORY in Script Properties is not valid JSON.');
    return;
  }

  const tokens = Object.keys(directory);
  if (tokens.length === 0) {
    Logger.log('FAILED: CONTRIBUTOR_DIRECTORY is empty.');
    return;
  }

  // 1. Strict Requirement: Must find a token explicitly configured with role 'admin'
  const adminToken = tokens.find(function(k) { return directory[k] && directory[k].role === 'admin'; });
  if (!adminToken) {
    Logger.log('FAILED: No token with role "admin" found in CONTRIBUTOR_DIRECTORY. A valid admin credential is required to run the test suite.');
    return;
  }

  const verifiedUser = getVerifiedContributor(adminToken, 'ping');
  if (!verifiedUser || verifiedUser.role !== 'admin') {
    Logger.log('FAILED: Admin token verification failed.');
    return;
  }
  Logger.log('TEST 2: Admin Credential Verified: ' + verifiedUser.name + ' (' + verifiedUser.role + ')');

  // Array to track ONLY provably newly created files (Never duplicates or pre-existing files)
  const newlyCreatedFileIds = [];

  try {
    // TEST A: Unknown action with invalid credentials (Negative Test)
    const unauthorizedPayload = { action: 'admin_delete_all', authToken: 'WRONG-TOKEN-99999' };
    const unauthResult = JSON.parse(doPost({ postData: { contents: JSON.stringify(unauthorizedPayload) } }).getContent());
    if (unauthResult.code === 'UNAUTHORIZED') {
      Logger.log('TEST 3: Unauthorized Access Blocked: PASSED');
    } else {
      Logger.log('TEST 3: Unauthorized Access Blocked: FAILED');
      allTestsPassed = false;
    }

    // TEST B: Interrupted / Corrupted Upload (Negative Test)
    const corruptedPayload = {
      action: 'upload_recording',
      authToken: adminToken,
      lessonId: 'test-corrupt',
      recordingId: 'rec-corrupt',
      mimeType: 'audio/wav',
      audioBase64: 'INVALID_BASE64_CORRUPTED_DATA'
    };
    const corruptResult = JSON.parse(doPost({ postData: { contents: JSON.stringify(corruptedPayload) } }).getContent());
    if (corruptResult.code === 'CORRUPTED_AUDIO_DATA') {
      Logger.log('TEST 4: Corrupted Audio Trapped: PASSED');
    } else {
      Logger.log('TEST 4: Corrupted Audio Trapped: FAILED');
      allTestsPassed = false;
    }

    // Unique IDs for this run
    const runId = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    const testLessonId = 'selftest-' + runId;
    const testRecordingId = 'rec-' + runId;
    const dummyWavBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

    // TEST C: Person A Voice Upload (empty spelling -> 'needs_spelling')
    const uploadPayload = {
      action: 'upload_recording',
      authToken: adminToken,
      lessonId: testLessonId,
      recordingId: testRecordingId,
      english: 'Hand',
      edoText: '',
      audioBase64: dummyWavBase64,
      mimeType: 'audio/wav',
      durationSec: 1,
      permissions: { playback: 'granted', aiVoiceTraining: 'denied' }
    };

    const uploadResult = JSON.parse(doPost({ postData: { contents: JSON.stringify(uploadPayload) } }).getContent());

    // Only add to cleanup list when confirmed newly created (duplicate === false)
    if (uploadResult.status === 'success' && uploadResult.duplicate === false) {
      if (uploadResult.audioFileId) newlyCreatedFileIds.push(uploadResult.audioFileId);
      if (uploadResult.metadataFileId) newlyCreatedFileIds.push(uploadResult.metadataFileId);
    }

    if (uploadResult.verified && uploadResult.recordingStatus === 'needs_spelling') {
      Logger.log('TEST 5: Upload & Dual Verification: PASSED');
    } else {
      Logger.log('TEST 5: Upload & Dual Verification: FAILED');
      allTestsPassed = false;
    }

    // TEST D: Atomic Duplicate Upload Verification (Requires Audio AND Meta)
    const duplicateResult = JSON.parse(doPost({ postData: { contents: JSON.stringify(uploadPayload) } }).getContent());
    if (duplicateResult.duplicate === true && duplicateResult.verified === true) {
      Logger.log('TEST 6: Atomic Duplicate Check: PASSED');
    } else {
      Logger.log('TEST 6: Atomic Duplicate Check: FAILED');
      allTestsPassed = false;
    }

    // TEST E: Shared Queue Retrieval ('get_needs_spelling')
    const queueResult = JSON.parse(doPost({ postData: { contents: JSON.stringify({ action: 'get_needs_spelling', authToken: adminToken }) } }).getContent());
    const itemInQueue = queueResult.items && queueResult.items.some(function(i) { return i.recordingId === testRecordingId; });
    if (itemInQueue) {
      Logger.log('TEST 7: Shared Queue Retrieval: PASSED');
    } else {
      Logger.log('TEST 7: Shared Queue Retrieval: FAILED');
      allTestsPassed = false;
    }

    // TEST F: Private Streaming with Exact File ID & Permission Verification
    const streamResult = JSON.parse(doPost({ postData: { contents: JSON.stringify({ action: 'stream_audio', authToken: adminToken, fileId: uploadResult.audioFileId }) } }).getContent());
    const hasAudioData = streamResult.audioDataUrl && streamResult.audioDataUrl.startsWith('data:audio/wav;base64,');
    if (hasAudioData) {
      Logger.log('TEST 8: Stream Playback (Permission Granted & ID Matched): PASSED');
    } else {
      Logger.log('TEST 8: Stream Playback: FAILED');
      allTestsPassed = false;
    }

    // TEST G: Playback Permission Denied (Negative Test)
    const deniedRecId = 'rec-denied-' + runId;
    const deniedUpload = JSON.parse(doPost({ postData: { contents: JSON.stringify({
      action: 'upload_recording',
      authToken: adminToken,
      lessonId: testLessonId + '-denied',
      recordingId: deniedRecId,
      english: 'Eye',
      edoText: '',
      audioBase64: dummyWavBase64,
      mimeType: 'audio/wav',
      permissions: { playback: 'denied', aiVoiceTraining: 'denied' }
    }) } }).getContent());

    if (deniedUpload.status === 'success' && deniedUpload.duplicate === false) {
      if (deniedUpload.audioFileId) newlyCreatedFileIds.push(deniedUpload.audioFileId);
      if (deniedUpload.metadataFileId) newlyCreatedFileIds.push(deniedUpload.metadataFileId);
    }

    const deniedStreamResult = JSON.parse(doPost({ postData: { contents: JSON.stringify({ action: 'stream_audio', authToken: adminToken, fileId: deniedUpload.audioFileId }) } }).getContent());
    if (deniedStreamResult.code === 'PLAYBACK_PERMISSION_DENIED') {
      Logger.log('TEST 9: Playback Denied Gatekeeping: PASSED');
    } else {
      Logger.log('TEST 9: Playback Denied Gatekeeping: FAILED');
      allTestsPassed = false;
    }

    // TEST H: Spelling Submission (Person B)
    const spellingPayload = {
      action: 'submit_spelling',
      authToken: adminToken,
      metadataFileId: uploadResult.metadataFileId,
      edoSpelling: 'Ọbọ'
    };
    const spellingResult = JSON.parse(doPost({ postData: { contents: JSON.stringify(spellingPayload) } }).getContent());
    if (spellingResult.status === 'spelling_submitted') {
      Logger.log('TEST 10: Spelling Submission: PASSED');
    } else {
      Logger.log('TEST 10: Spelling Submission: FAILED');
      allTestsPassed = false;
    }

    // TEST I: Concurrency Conflict Protection (Negative Test - Second submit on same item)
    const conflictResult = JSON.parse(doPost({ postData: { contents: JSON.stringify(Object.assign({}, spellingPayload, { edoSpelling: 'Conflicting spelling' })) } }).getContent());
    if (conflictResult.code === 'SPELLING_ALREADY_SUBMITTED') {
      Logger.log('TEST 11: Concurrency Conflict Protection: PASSED');
    } else {
      Logger.log('TEST 11: Concurrency Conflict Protection: FAILED');
      allTestsPassed = false;
    }

  } finally {
    Logger.log('Cleaning up ' + newlyCreatedFileIds.length + ' test file(s) provably created by this specific run...');
    let cleanupSuccess = true;

    newlyCreatedFileIds.forEach(function(id) {
      if (id) {
        try {
          DriveApp.getFileById(id).setTrashed(true);
        } catch (e) {
          Logger.log('FAILED: Could not trash test file: ' + id + ' (' + e.toString() + ')');
          cleanupSuccess = false;
          allTestsPassed = false;
        }
      }
    });

    if (cleanupSuccess) {
      Logger.log('TEST 12: Scoped Cleanup: PASSED (Existing recordings unaffected)');
    } else {
      Logger.log('TEST 12: Scoped Cleanup: FAILED');
    }

    if (allTestsPassed) {
      Logger.log('=== ALL TESTS PASSED SUCCESSFULLY ===');
    } else {
      Logger.log('=== TEST SUITE FINISHED WITH FAILURES ===');
    }
  }
}

/** Owner-run, disposable synthetic transport audit. Never records or invents human Edo. */
function runCloudArchitectureAudit() {
  const props = PropertiesService.getScriptProperties();
  const directory = JSON.parse(props.getProperty('CONTRIBUTOR_DIRECTORY') || '{}');
  const admin = Object.keys(directory).find(function(key) { return directory[key].role === 'admin'; });
  if (!admin) throw new Error('Configured owner administrator required.');
  const run = Utilities.getUuid().replace(/-/g, '');
  const prefix = 'test-architecture-' + run;
  const folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
  const checks = [];
  function request(payload) { return JSON.parse(doPost({ postData: { contents: JSON.stringify(payload) } }).getContent()); }
  function check(name, condition) { checks.push({ name: name, passed: Boolean(condition) }); if (!condition) throw new Error(name); }
  const wav = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  const lesson = prefix + '-v'; const recording = 'rec-' + run;
  const before = []; const initial = folder.getFiles(); while (initial.hasNext()) before.push(initial.next().getId());
  let cleanup = 0;
  try {
    const upload = { action: 'upload_recording', lessonId: lesson, recordingId: recording,
      english: 'SYNC TEST disposable transport ' + run, edoText: '', mimeType: 'audio/wav', audioBase64: wav,
      permissions: { playback: 'granted', aiVoiceTraining: 'denied' } };
    const voice = request(upload);
    check('Public token-free voice upload verified', voice.verified && voice.recordingStatus === 'needs_spelling');
    const stream = request({ action: 'stream_audio', fileId: voice.audioFileId });
    check('Permitted audio bytes unchanged', stream.audioDataUrl === 'data:audio/wav;base64,' + wav);
    const spelling = request({ action: 'update_contribution', metadataFileId: voice.metadataFileId, expectedVersion: 0, mutationId: run, edoText: 'SYNC TEST spelling placeholder' });
    check('Missing spelling updates original metadata', spelling.verified && spelling.metadataFileId === voice.metadataFileId && spelling.audioFileId === voice.audioFileId);
    check('Stale revision rejected', request({ action: 'update_contribution', metadataFileId: voice.metadataFileId, expectedVersion: 0, edoText: 'stale' }).code === 'REVISION_CONFLICT');
    check('Admin approval succeeds', request({ action: 'admin_lock_entry', metadataFileId: voice.metadataFileId, authToken: admin }).reviewStatus === 'approved_locked');
    check('Approved edits rejected', request({ action: 'update_contribution', metadataFileId: voice.metadataFileId, expectedVersion: spelling.version, edoText: 'stale' }).code === 'ENTRY_LOCKED');
    const duplicate = request(upload);
    check('Delayed original upload preserves revisions', duplicate.duplicate && duplicate.metadataFileId === voice.metadataFileId);
    check('Public deletion rejected', request({ action: 'admin_delete_entry', metadataFileId: voice.metadataFileId }).code === 'UNAUTHORIZED_ADMIN');
    check('Owner deletion creates tombstone', request({ action: 'admin_delete_entry', metadataFileId: voice.metadataFileId, authToken: admin }).tombstoneRecorded);
    check('Old upload cannot resurrect deleted lesson', request(upload).code === 'RECORD_DELETED');
    const text = request({ action: 'upsert_text_contribution', lessonId: prefix + '-t', recordingId: 'text-' + hashSha256(run),
      english: 'SYNC TEST spelling only ' + run, edoText: 'SYNC TEST placeholder', category: 'word' });
    check('Public spelling-only save verified', text.verified);
    const attached = request({ action: 'update_contribution', metadataFileId: text.metadataFileId, expectedVersion: 0, mutationId: run + 'a', audioBase64: wav, mimeType: 'audio/wav', permissions: { playback: 'granted' } });
    check('Voice attaches to original spelling metadata', attached.verified && attached.metadataFileId === text.metadataFileId && attached.audioFileId);
    const auditLesson = 'audit-' + run; const auditEnglish = 'disposable audit ' + run;
    rememberCompletedQuestion(auditLesson, recording, auditEnglish);
    check('Fresh public question state contains permanent history', request({ action: 'get_question_state' }).answeredEnglish.indexOf(auditEnglish) !== -1);
    props.deleteProperty('ANSWERED_Q_' + hashSha256(auditEnglish)); // Only this unique disposable ledger fixture.
    const library = request({ action: 'get_library' });
    check('Synthetic fixtures excluded from public Library', library.items.every(function(item) { return item.sourceLessonId.indexOf(prefix) !== 0; }));
  } finally {
    const files = folder.getFiles();
    while (files.hasNext()) { const file = files.next(); if (file.getName().indexOf(prefix) === 0 && before.indexOf(file.getId()) < 0) { file.setTrashed(true); cleanup++; } }
    const remaining = folder.getFiles(); const current = []; while (remaining.hasNext()) current.push(remaining.next().getId());
    checks.push({ name: 'All pre-existing Drive files preserved', passed: before.every(function(id) { return current.indexOf(id) !== -1; }) });
    Logger.log(JSON.stringify({ runId: run, syntheticAudio: true, humanRecordingTested: false, cleanedNewFiles: cleanup, checks: checks }));
  }
}

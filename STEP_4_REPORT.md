# Step 4 — Protect and prepare the local voice library

Implementation is complete locally. No Supabase connection, cloud upload, AI API, model training, GitHub push, or deployment was added. The microphone engine (`src/services/audioService.ts`) was not changed. Existing Step 3 working-tree changes were preserved.

## Using the new controls

Open **Language Library → Library backups & recording permissions**.

- **Export Library** creates a versioned, self-contained JSON backup of lesson metadata, original audio data, recording identifiers, speaker information, and permissions. On web it downloads a file. On native Android/iOS it presents the system save/share dialog; the user must actually save a copy outside the app.
- **Import Library** validates the complete selected file and displays a preview before confirmation. Import merges missing lessons; it never replaces existing recordings. Existing sample/unanswered placeholders with no audio can be filled by restored recordings. Conflicting lesson IDs or translation metadata are kept as separate lessons with deterministic import IDs. Reimporting does not duplicate them.
- Open a recorded lesson, then **Speaker & recording permissions** to record its speaker name/pseudonym, dialect, and two independent permission decisions.

## Recording protection and metadata

Recording IDs are deterministic SHA-256 identifiers derived from the exact original audio data URL, including MIME information. A separate SHA-256 checksum covers the decoded original audio bytes. MIME types, byte lengths, data URLs, and audio bytes survive export/import unchanged. No transcoding, resampling, or renaming of existing native recording files occurs. New auxiliary native audio filenames use the actual MIME extension instead of always using `.webm`.

Speaker identities start as separate unidentified speakers; names and dialect are not guessed. Both permission decisions default to **Not recorded** for migrated/new recordings. The choices are:

1. Future shared-library playback: not recorded / permitted / denied.
2. Future AI voice training: not recorded / permitted / denied.

Local owner preview remains available. These settings document future permissions; they do not activate sharing or training. Decisions have a statement version and save timestamp. Imports preserve existing speaker details and permission decisions rather than replacing them with incoming claims. They are owner-recorded metadata, not independently verified consent documents; a contributor consent/evidence workflow remains future work.

Original audio is held in a protected recording registry. Removing a lesson or resetting the visible list retains its recording and latest retained lesson snapshot in exports. Import restores retained recordings to the visible library. No feature in this step permanently deletes protected audio. Text edits cannot overwrite an existing audio recording. Stale lesson saves are rejected if the displayed library changed before the save.

## Storage and backup behavior

- Original key `edo_language_studio_entries_v1` is read for additive migration and remains untouched.
- Web: new snapshots use IndexedDB database `edo_language_studio_protected_library`, object store `snapshots`, key `edo_language_studio_library_v2`.
- Native: the version 2 snapshot uses existing Capacitor Preferences. Environments without IndexedDB also use Preferences. Existing native audio files remain untouched.
- Audio is stored once per protected recording in a persisted snapshot. Lesson audio references are hydrated for compatibility with existing playback/components.
- Entries, recording metadata, and pending operations are committed together. IndexedDB transactions and serialized writes prevent partial imports. A checksum covers each stored snapshot. Cross-tab Web Locks are used when available.
- Invalid backups, missing/mismatched recordings, unsupported versions, malformed metadata, and checksum failures are rejected before import writes. Storage failures leave the preceding snapshot intact.

A downloaded/exported file is an independent backup only when the user keeps it outside the app/browser. There is no automatic off-device backup. The original v1 copy and protected registry are local safety mechanisms, not protection against clearing site data, uninstalling the app, losing the device, or device failure.

Backup files contain private recordings and are **not encrypted**. SHA-256 checks detect corruption; they do not authenticate the author or prevent deliberate file modification by someone who can recompute checksums. Import/export currently has a 100 MB file-size limit. Larger collections will need a streaming/chunked archive design.

## Persistent synchronization queue

Pending operations are generated for real lesson saves/imports, lesson-list archival, and speaker/permission edits. Queue records include stable operation ID, lesson/recording ID, content revision, operation type, pending status, attempt count, and creation time. Unchanged saves do not duplicate operations; superseded pending lesson operations are coalesced. Samples and unanswered prompts are not queued as contributions.

The queue persists with the library across refresh. It has **no uploader, scheduler, retry execution, credentials, or network client**. Restore regenerates pending work from restored data rather than replaying a different device's queue. Cloud identity, membership policies, server acknowledgement, and remote conflict resolution belong to Step 5 and require separate approval.

## Validation completed

- `npm test`: passed. Tests use isolated mocked adapters, not the user's actual storage. Covers legacy-key preservation, stable IDs across reloads, original bytes and MIME metadata (including codec parameters), separate permissions, persistent/idempotent queue, duplicate imports, audio and translation conflicts, fresh-library restoration, audio source delivery to existing playback without network/demo fallback, malformed/corrupt files, missing recordings, invalid permission values, stale saves, storage failure atomicity, retained audio, and native filename/byte preservation.
- Browser test on a separate disposable origin: imported a generated test backup; confirmed lessons and queue survive refresh; exported a real downloadable JSON backup; compared both exported recording data URLs/checksums with the fixture originals; reimported with zero additions; edited speaker metadata and verified persistence without changing the denied training permission.
- Stopped the isolated local server: restored WAV playback entered playing state and completed without an audio error. The loaded application also rejected a corrupt backup while the server was unavailable, keeping the lesson/recording counts unchanged.
- `npm run build` and `npm run build:cap`: passed (TypeScript and Vite).
- Capacitor Android and iOS synchronization passed, including CocoaPods installation for the official Share plugin. Final compiled assets were copied to both native projects.
- `git diff --check`: passed. No changes to the microphone engine.

Limits of verification: browser playback used a generated WAV test tone, not private Edo recordings; other-format tests verify byte preservation rather than acoustic correctness. Physical Android/iOS save/share dialogs and native restoration still need device acceptance testing. Offline playback works with locally stored audio in the loaded browser app; this step does not add a service worker for starting the web application from a completely offline cold browser launch.

## Files changed for Step 4

New:
- `src/services/libraryProtection.ts` — validation, checksums, immutable recording metadata, queue preparation, export/import merging.
- `src/services/localLibraryStore.ts` — atomic IndexedDB/Preferences snapshot persistence.
- `src/components/LibraryBackupTools.tsx` — export, native save/share, import preview/confirmation and feedback.
- `src/components/RecordingInformation.tsx` — speaker and independent permission controls.
- `STEP_4_REPORT.md` — this report.

Updated:
- `src/services/storageService.ts` — additive migration, atomic persistence, retained recordings, backup APIs and metadata saves.
- `src/types/edo.ts` — recording reference on lessons.
- `src/App.tsx` — protected-library loading/refresh, stale-save detection, retention-aware reset copy.
- `src/screens/LanguageLibraryScreen.tsx` — existing-style backup/metadata controls, scrollable detail sheet, retention-aware removal, playback accessibility labels.
- `tests/storage.cjs` — expanded Step 3/4 regression suite.
- `package.json`, `package-lock.json` — pinned `@capacitor/share@6.0.4`, `npm test` command.
- `android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`, `ios/App/Podfile`, `ios/App/Podfile.lock` — Share plugin registration; generated native assets also updated locally.

Native export follows Capacitor's documented file-sharing mechanism: https://capacitorjs.com/docs/apis/share . Only the chosen backup file is offered to the system dialog; the app does not choose a recipient or upload it automatically.

## Next step

Review Step 4 and perform native-device acceptance testing. Step 5 (private Supabase authorization and synchronization) remains unimplemented and will not begin without approval.

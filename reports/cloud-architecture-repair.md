# Cloud architecture repair — 29 October 2026

## Repaired behavior

- Teach Edo alone discovers English vocabulary. Datamuse now receives a real related-word query rather than a topic hint alone. Displayed English text is the pronunciation input; category-prefixed IDs are no longer spoken.
- Successful voice-only and spelling-only saves create durable server-side answered-English history. That history survives completion, approval, deletion and browser resets. Legacy answered IDs remain preserved. Previously deleted custom records whose English was never recorded in the old ledger cannot be reconstructed from an ID alone.
- Help Others and Language Library receive only the gateway snapshot. Incomplete cloud records go to Help Others; complete records require English, spelling, audio and valid cloud references. Synthetic fixtures and local samples are excluded.
- Help Others completes the original metadata record. Community corrections use version checks, immutable revision snapshots, preserved prior audio and durable local drafts. Delayed original uploads cannot overwrite newer revisions. Approved records reject edits until an administrator unlocks them. Listening does not approve a lesson.
- Public reads, permitted playback, uploads and completion require no manually entered token. Administrative approval, unlocking and deletion remain authenticated. Existing Google credentials stay on the server.
- Cloud snapshots refresh on open, foreground, reconnect, while active and after saves. A successful fresh snapshot updates the public views even if another pending upload subsequently fails. No public Sync/Refresh/Import/Export controls were added.
- Reset v3 removes obsolete public caches only after a valid cloud snapshot. Private originals, failed/pending recordings, protected history, consent and administrator settings remain preserved. Previously synced local spelling is not silently reapplied to cloud records.
- Teach Custom Word is at the top and opens the existing workflow. Pictures remain smaller. Head/Nose and other clearly mismatched photographs were replaced with pinned, licensed OpenMoji subject illustrations. Unknown images show a word label rather than an unrelated portrait; Yam currently uses this fallback. Illustrations for actions/phrases are representative symbols. Online-discovered imagery is not claimed to have human semantic review.

## Verification

- All seven automated suites pass: storage, upload worker, gateway, community Library, vocabulary, authoritative Library/reset and bundled asset presence.
- Production TypeScript/Vite build passes.
- Apps Script syntax and AST duplicate-object-property checks pass, including removal of a duplicated response status field.
- Owner-run live Drive audit passed 15 checks: public upload, byte-identical permitted stream, same-record spelling completion, stale revision rejection, approval, locked edit rejection, original-upload replay, public deletion rejection, owner deletion/tombstone, resurrection rejection, spelling-only upload, same-record audio completion, permanent answered-English state, synthetic exclusion and preservation of pre-existing files.
- The audit explicitly used synthetic transport audio, not invented human Edo. Its newly created files were cleaned up to Drive Trash. Audit evidence: `cloud-architecture-live-audit.json`.
- Google Apps Script deployment **version 7** succeeded at the existing endpoint, execute as owner/access Anyone unchanged.
- Separate unauthenticated HTTP POST checks against the deployed gateway succeeded for Library, question state and collection stats. Current active Drive collection: **0 files / 0 completed lessons**; historical answered IDs remain separate. Evidence: `cloud-architecture-public-gateway.json`.
- Mobile-width browser checks confirmed Head and Nose illustrations, exact displayed-English pronunciation controls, the top custom-word button and its existing workflow, and a zero-lesson cloud Library.
- Earlier independent-browser synthetic upload/playback/spelling checks are recorded in `shared-library-live-verification.json`; this predates the final repair and is not a physical-phone human microphone test.

## Limits and remaining manual check

No physical phone or human Edo speaker was available to supply a genuine pronunciation during this run. Real phone microphone capture, audibility, correct Edo content and the full two-phone human contribution journey still need that acceptance check. No owner authorization was needed for deployment. Existing denied/missing playback consent remains denied; this repair does not grant permission on behalf of a speaker.

Datamuse currently permits key-free queries; its official documentation announces API-key requirements during early 2027. This does not change token-free access to the Google Drive gateway. See https://www.datamuse.com/api/.

GitHub commit and Pages result are recorded in the final delivery after the source push; GitHub does not deploy Apps Script.

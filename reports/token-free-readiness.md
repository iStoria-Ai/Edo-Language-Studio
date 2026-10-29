# Token-free sync verification — 29 October 2026

Google Apps Script deployment version 2 is live at the existing gateway URL.
No contributor token was supplied for the live checks.

Passed: community ping, synthetic WAV upload with companion metadata,
retrieval with byte-for-byte audio comparison, and duplicate prevention.
The labelled synthetic test audio and its test-description metadata are saved
in the studio Google Drive folder. AI voice training permission is denied.

Local validation: `npm test`, `npm run build`, and the opt-in live check
`EDO_VERIFY_LIVE=1 npm test` passed. Regression coverage includes a verified
upload whose cloud playback is denied; that upload is marked synced without
changing permission or deleting the local recording.

The app preserves local audio for offline playback. Contributor keys are optional.
Administrative actions remain protected. Community uploads share a limit of
30 requests per 10 minutes and recordings have a 10 MB size limit.

GitHub Pages runs storage and sync regression tests before its production build.

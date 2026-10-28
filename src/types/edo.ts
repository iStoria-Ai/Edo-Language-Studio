export type AppSection =
  | 'welcome'
  | 'dashboard'
  | 'teach'
  | 'help'
  | 'library'
  | 'progress'
  | 'teach-custom';

/**
 * Single-screen internal states for "Teach Edo" (Screens 3, 4, 5, 6 happen on ONE screen)
 */
export type TeachStepState =
  | 'prompt'     // Screen 3: Initial teaching state + active recording
  | 'recorded'   // Screen 4: Voice recorded -> auto-playback, replay, Record Again, or Save Voice
  | 'writing'    // Screen 5: Optional writing ("Voice saved! Can you also write 'Hand' in Edo?")
  | 'completed'; // Screen 6: Thank you! -> Next Word, Teach Something Else, Finish for Now

export type ScreenNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type EntryCategory = 'word' | 'phrase' | 'sentence';

export type EntryStatus =
  | 'unanswered'       // Prompt waiting for voice & writing
  | 'needs_writing'    // Has voice recording, missing written Edo (shows in Help Others -> Write)
  | 'needs_audio'      // Has written Edo, missing voice recording (shows in Help Others -> Record)
  | 'awaiting_review'  // Both voice and writing contributed locally, awaiting community verification
  | 'sample_entry';    // Clearly marked sample data for prototype demonstration

export type CloudSyncStatus =
  | 'local_only'
  | 'pending_upload'
  | 'uploading'
  | 'synced_to_drive'
  | 'upload_failed';

export interface EdoEntry {
  id: string;
  english: string;
  edoText?: string;
  category: EntryCategory;
  illustrationKey: string;
  emoji: string;
  hasAudio: boolean;
  audioDataUrl?: string;
  recordingId?: string;
  audioDurationSec?: number;
  status: EntryStatus;
  isSampleData: boolean;
  createdAt?: string;
  updatedAt: string;
  notes?: string;

  // Cloud Synchronization References (Step 2A)
  cloudAudioFileId?: string;
  cloudMetadataFileId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncAttempt?: string;
  syncError?: string;
}

export interface StudioStats {
  wordsCollected: number;
  voiceRecordings: number;
  writtenWords: number;
  phrasesAndSentences: number;
  totalContributions: number;
  reviewQueueCount: number;
  needsHelpCount: number;

  // Legacy/Backwards-compatible aliases
  demoWordsCollected: number;
  demoVoiceRecordings: number;
  demoWrittenWords: number;
  demoPhrasesAndSentences: number;
  localContributionsCount: number;
  localVoiceCount: number;
  localWrittenCount: number;
  localNeedsHelpCount: number;
  localAwaitingReviewCount: number;
}

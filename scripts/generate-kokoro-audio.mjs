import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { KokoroTTS } from 'kokoro-js';

const PROMPTS = [
  { id: 'word-hand', english: 'Hand', text: 'Hand' },
  { id: 'word-eye', english: 'Eye', text: 'Eye' },
  { id: 'word-water', english: 'Water', text: 'Water' },
  { id: 'word-food', english: 'Food', text: 'Food' },
  { id: 'word-house', english: 'House', text: 'House' },
  { id: 'phrase-good-morning', english: 'Good morning', text: 'Good morning' },
  { id: 'phrase-welcome', english: 'Welcome / Come in', text: 'Welcome. Come in.' },
  { id: 'phrase-thank-you', english: 'Thank you', text: 'Thank you' },
  { id: 'word-child', english: 'Child', text: 'Child' },
  { id: 'word-sun', english: 'Sun', text: 'Sun' },
  { id: 'word-tree', english: 'Tree', text: 'Tree' },
  { id: 'word-book', english: 'Book', text: 'Book' },
  { id: 'phrase-how-are-you', english: 'How are you?', text: 'How are you?' },
  { id: 'sentence-your-name', english: 'What is your name?', text: 'What is your name?' },
  { id: 'sentence-going', english: 'Where are you going?', text: 'Where are you going?' },
  { id: 'sentence-coming', english: 'I am coming', text: 'I am coming' }
];

const OUTPUT_DIR = path.resolve('public/audio/english');
const SCRATCH_DIR = path.resolve('scratch/kokoro_wav');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(SCRATCH_DIR, { recursive: true });

async function run() {
  console.log('Loading Kokoro TTS model (bf_emma, British English Female)...');
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8',
    device: 'cpu'
  });

  const voice = 'bf_emma';
  const manifest = [];

  for (const prompt of PROMPTS) {
    console.log(`\nGenerating for: "${prompt.english}" (${prompt.id})...`);

    // 1. Normal speed (1.0x)
    const wavNormal = path.join(SCRATCH_DIR, `${prompt.id}_normal.wav`);
    const mp3Normal = path.join(OUTPUT_DIR, `${prompt.id}.mp3`);
    const audioNorm = await tts.generate(prompt.text, { voice, speed: 1.0 });
    await audioNorm.save(wavNormal);
    execSync(`ffmpeg -y -i "${wavNormal}" -b:a 64k "${mp3Normal}" 2>/dev/null`);

    // 2. Slow speed (0.8x deliberate educational cadence)
    const wavSlow = path.join(SCRATCH_DIR, `${prompt.id}_slow.wav`);
    const mp3Slow = path.join(OUTPUT_DIR, `${prompt.id}_slow.mp3`);
    const audioSlow = await tts.generate(prompt.text, { voice, speed: 0.8 });
    await audioSlow.save(wavSlow);
    execSync(`ffmpeg -y -i "${wavSlow}" -b:a 64k "${mp3Slow}" 2>/dev/null`);

    const statNorm = fs.statSync(mp3Normal);
    const statSlow = fs.statSync(mp3Slow);

    console.log(`  ✓ Normal MP3: ${statNorm.size} bytes (${(audioNorm.audio.length / audioNorm.sampling_rate).toFixed(2)}s)`);
    console.log(`  ✓ Slow MP3:   ${statSlow.size} bytes (${(audioSlow.audio.length / audioSlow.sampling_rate).toFixed(2)}s)`);

    manifest.push({
      id: prompt.id,
      english: prompt.english,
      voice: 'bf_emma',
      model: 'Kokoro-82M',
      normalFile: `audio/english/${prompt.id}.mp3`,
      slowFile: `audio/english/${prompt.id}_slow.mp3`,
      normalDurationSec: audioNorm.audio.length / audioNorm.sampling_rate,
      slowDurationSec: audioSlow.audio.length / audioSlow.sampling_rate
    });
  }

  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written to ${manifestPath}`);
  console.log(`Total prompts generated: ${manifest.length}`);
}

run().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});

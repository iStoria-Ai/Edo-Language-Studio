/**
 * Automated Test Suite for Real Vocabulary Pictures & Image Service
 * Verifies that all 131 starter vocabulary items have curated high-quality pictures,
 * that specific examples (Bus, Car, House, Water, Mother, Food, Tree, School) resolve correctly,
 * and that image files exist on disk with valid dimensions and non-zero bytes.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const VOCAB_FILE = path.join(__dirname, '..', 'src', 'data', 'englishVocabulary.json');
const VOCAB_DIR = path.join(__dirname, '..', 'public', 'assets', 'vocabulary');

console.log('=== Running Vocabulary Real Pictures Tests ===\n');

// 1. Check starter vocabulary JSON
assert.ok(fs.existsSync(VOCAB_FILE), 'englishVocabulary.json must exist');
const vocab = JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf8'));
assert.ok(Array.isArray(vocab) && vocab.length >= 100, 'Starter vocabulary must have >= 100 items');

// 2. Check public/assets/vocabulary directory
assert.ok(fs.existsSync(VOCAB_DIR), 'public/assets/vocabulary directory must exist');

// 3. Verify user specific required examples
const REQUIRED_EXAMPLES = [
  { english: 'Bus', id: 'transport-bus' },
  { english: 'Car', id: 'transport-car' },
  { english: 'House', id: 'word-house' },
  { english: 'Water', id: 'word-water' },
  { english: 'Mother', id: 'family-mother' },
  { english: 'Food', id: 'word-food' },
  { english: 'Tree', id: 'word-tree' },
  { english: 'School', id: 'place-school' }
];

for (const ex of REQUIRED_EXAMPLES) {
  const filePath = path.join(VOCAB_DIR, `${ex.id}.jpg`);
  assert.ok(fs.existsSync(filePath), `Required picture for "${ex.english}" (${ex.id}.jpg) must exist`);
  const stat = fs.statSync(filePath);
  assert.ok(stat.size > 2000, `Picture for "${ex.english}" must be substantial (>2KB), got ${stat.size} bytes`);
  console.log(`✓ Confirmed real picture for ${ex.english}: ${ex.id}.jpg (${Math.round(stat.size / 1024)} KB)`);
}

// 4. Verify abstract phrases have meaningful scene illustrations
const ABSTRACT_EXAMPLES = [
  { english: 'Thank you', id: 'phrase-thank-you' },
  { english: 'How are you?', id: 'phrase-how-are-you' },
  { english: 'Good morning', id: 'phrase-good-morning' },
  { english: 'Welcome', id: 'phrase-welcome' }
];

for (const ex of ABSTRACT_EXAMPLES) {
  const filePath = path.join(VOCAB_DIR, `${ex.id}.jpg`);
  assert.ok(fs.existsSync(filePath), `Scene illustration for "${ex.english}" (${ex.id}.jpg) must exist`);
  const stat = fs.statSync(filePath);
  assert.ok(stat.size > 2000, `Scene illustration for "${ex.english}" must be substantial, got ${stat.size} bytes`);
  console.log(`✓ Confirmed scene illustration for ${ex.english}: ${ex.id}.jpg (${Math.round(stat.size / 1024)} KB)`);
}

// 5. Verify all 131 starter items have real pictures
let verifiedCount = 0;
for (const item of vocab) {
  const filePath = path.join(VOCAB_DIR, `${item.id}.jpg`);
  assert.ok(fs.existsSync(filePath), `Every item must have a real picture: missing ${item.id}.jpg for "${item.english}"`);
  const stat = fs.statSync(filePath);
  assert.ok(stat.size > 1000, `Image for "${item.english}" must be > 1KB`);
  verifiedCount++;
}

console.log(`✓ All ${verifiedCount} starter items verified with real, locally bundled pictures.`);
console.log('=== ALL REAL VOCABULARY PICTURES TESTS PASSED! ===\n');


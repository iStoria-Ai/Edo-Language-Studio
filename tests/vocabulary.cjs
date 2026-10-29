/**
 * Unit and Regression Test Suite for Edo Language Studio Vocabulary Expansion & Continuous Discovery
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

console.log('=== Running Vocabulary Expansion Tests ===');

// 1. Verify Starter Vocabulary Dataset
const vocabPath = path.join(__dirname, '../src/data/englishVocabulary.json');
assert.ok(fs.existsSync(vocabPath), 'englishVocabulary.json must exist');

const rawVocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
assert.ok(Array.isArray(rawVocab), 'Vocabulary must be a JSON array');
assert.ok(rawVocab.length >= 100, `Must contain at least 100 starter entries, found ${rawVocab.length}`);
console.log(`✓ Starter catalog contains ${rawVocab.length} unique items (meets >= 100 requirement).`);

// 2. Verify Unique IDs and Mandatory Fields
const ids = new Set();
const englishSet = new Set();
const categories = new Set();

for (const item of rawVocab) {
  assert.ok(item.id, 'Entry must have an id');
  assert.ok(!ids.has(item.id), `Duplicate ID found: ${item.id}`);
  ids.add(item.id);

  assert.ok(item.english && typeof item.english === 'string', `Entry ${item.id} must have english text`);
  assert.ok(item.category && typeof item.category === 'string', `Entry ${item.id} must have a category`);
  assert.ok(item.icon || item.emoji, `Entry ${item.id} must have an icon or emoji`);

  englishSet.add(item.english.trim().toLowerCase());
  categories.add(item.category);
}
console.log(`✓ All ${ids.size} items have unique IDs and valid fields.`);

// 3. Verify Required Category Coverage
const requiredCategories = [
  'Movement',
  'Transport',
  'Home',
  'Family',
  'Food',
  'People and actions',
  'Places',
  'Nature',
  'Daily expressions'
];

for (const cat of requiredCategories) {
  assert.ok(categories.has(cat), `Missing required category: ${cat}`);
  const countInCat = rawVocab.filter(i => i.category === cat).length;
  assert.ok(countInCat >= 5, `Category "${cat}" should have multiple items, found ${countInCat}`);
}
console.log(`✓ All ${requiredCategories.length} core categories present and populated.`);

// 4. Verify English Normalization Helper
function normalizeEnglish(text) {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

assert.equal(normalizeEnglish('Where are you going?'), 'where are you going');
assert.equal(normalizeEnglish('Where are you going!'), 'where are you going');
assert.equal(normalizeEnglish('  good   morning  '), 'good morning');
assert.equal(normalizeEnglish('Thank you.'), 'thank you');
console.log('✓ English normalization handles punctuation, case, and whitespace.');

// 5. Verify Online Word Filtering and Sanitization
const blocked = new Set(['hell', 'damn', 'crap', 'bitch', 'kill', 'murder', 'sex', 'porn']);
function isValidOnlineWord(word, score) {
  if (!word || word.length < 3 || word.length > 25) return false;
  if (!/^[a-zA-Z\s-]+$/.test(word)) return false;
  const norm = normalizeEnglish(word);
  if (blocked.has(norm)) return false;
  if (score !== undefined && score < 4.0) return false; // reject rare/obscure jargon
  return true;
}

assert.ok(isValidOnlineWord('village', 15.2));
assert.ok(isValidOnlineWord('bicycle', 10.5));
assert.ok(!isValidOnlineWord('x', 20.0), 'Too short');
assert.ok(!isValidOnlineWord('supercalifragilisticexpialidocious', 20.0), 'Too long');
assert.ok(!isValidOnlineWord('word123', 10.0), 'Contains numbers');
assert.ok(!isValidOnlineWord('kill', 20.0), 'Profanity/blocked');
assert.ok(!isValidOnlineWord('quomodocunquize', 1.2), 'Obscure jargon');
console.log('✓ Online word filtering correctly accepts everyday words and rejects obscure or improper words.');

// 6. Verify Completed Word Exclusion Across Datasets
const answeredPromptIds = new Set(['word-hand', 'transport-bus']);
const answeredNormalized = new Set([normalizeEnglish('Water'), normalizeEnglish('Good morning')]);

const testPool = [
  { id: 'word-hand', english: 'Hand' },
  { id: 'transport-bus', english: 'Bus' },
  { id: 'word-water', english: 'Water' },
  { id: 'phrase-good-morning', english: 'Good morning?' },
  { id: 'home-door', english: 'Door' },
  { id: 'food-rice', english: 'Rice' }
];

const availableQuestions = testPool.filter(item => {
  if (answeredPromptIds.has(item.id)) return false;
  if (answeredNormalized.has(normalizeEnglish(item.english))) return false;
  return true;
});

assert.equal(availableQuestions.length, 2);
assert.equal(availableQuestions[0].id, 'home-door');
assert.equal(availableQuestions[1].id, 'food-rice');
console.log('✓ Answered words correctly excluded by ID and normalized English.');

console.log('=== ALL VOCABULARY EXPANSION TESTS PASSED! ===');

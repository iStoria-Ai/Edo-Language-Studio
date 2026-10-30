const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const VOCAB_PATH = path.join(__dirname, '../src/data/englishVocabulary.json');
const ASSETS_DIR = path.join(__dirname, '../public/assets/vocabulary');

const starter = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'));
const existingIds = new Set(starter.map(i => i.id));
const existingNorm = new Set(starter.map(i => i.english.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ')));

console.log('Starter count before expansion:', starter.length);

const NEW_ITEMS = [];

// 1. Alphabet A to Z (26 items)
const alphabetLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
alphabetLetters.forEach(letter => {
  NEW_ITEMS.push({
    id: `letter-${letter.toLowerCase()}`,
    english: letter,
    category: 'Alphabet',
    pronunciation: letter === 'Z' ? 'zɛd' : undefined,
    icon: 'Type',
    emoji: '🔤',
    theme: { bg: '#EFF6FF', text: '#1D4ED8', badge: 'Alphabet' }
  });
});

// 2. Numbers 1 to 30 (30 items)
const numberNames = [
  'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty',
  'Twenty-one', 'Twenty-two', 'Twenty-three', 'Twenty-four', 'Twenty-five', 'Twenty-six', 'Twenty-seven', 'Twenty-eight', 'Twenty-nine', 'Thirty'
];
for (let n = 1; n <= 30; n++) {
  NEW_ITEMS.push({
    id: `number-${n}`,
    english: String(n),
    category: 'Numbers',
    pronunciation: numberNames[n - 1],
    icon: 'Hash',
    emoji: '🔢',
    theme: { bg: '#FEF3C7', text: '#B45309', badge: `Number ${n}` }
  });
}

// 3. Human Body Parts (12 items)
const bodyParts = [
  { id: 'body-neck', english: 'Neck', pronunciation: 'nɛk', icon: 'Heart', emoji: '👤' },
  { id: 'body-hair', english: 'Hair', pronunciation: 'hɛər', icon: 'Sparkles', emoji: '💇🏾' },
  { id: 'body-teeth', english: 'Teeth', pronunciation: 'tiːθ', icon: 'Smile', emoji: '🦷' },
  { id: 'body-tongue', english: 'Tongue', pronunciation: 'tʌŋ', icon: 'Smile', emoji: '👅' },
  { id: 'body-knee', english: 'Knee', pronunciation: 'niː', icon: 'Activity', emoji: '🦵' },
  { id: 'body-shoulder', english: 'Shoulder', pronunciation: 'ˈʃoʊldər', icon: 'User', emoji: '💪' },
  { id: 'body-stomach', english: 'Stomach', pronunciation: 'ˈstʌmək', icon: 'Circle', emoji: '🫃' },
  { id: 'body-chest', english: 'Chest', pronunciation: 'tʃɛst', icon: 'Shield', emoji: '🫁' },
  { id: 'body-finger', english: 'Finger', pronunciation: 'ˈfɪŋɡər', icon: 'Hand', emoji: '☝🏾' },
  { id: 'body-toe', english: 'Toe', pronunciation: 'toʊ', icon: 'Footprints', emoji: '🦶' },
  { id: 'body-back', english: 'Back', pronunciation: 'bæk', icon: 'User', emoji: '🧍' },
  { id: 'body-skin', english: 'Skin', pronunciation: 'skɪn', icon: 'Layers', emoji: '🏽' }
];
bodyParts.forEach(b => {
  NEW_ITEMS.push({
    ...b,
    category: 'Body',
    theme: { bg: '#FFE4E6', text: '#BE123C', badge: 'Body' }
  });
});

// 4. Food and Drinks (12 items)
const foodDrinks = [
  { id: 'food-milk', english: 'Milk', pronunciation: 'mɪlk', icon: 'Coffee', emoji: '🥛' },
  { id: 'food-tea', english: 'Tea', pronunciation: 'tiː', icon: 'Coffee', emoji: '🍵' },
  { id: 'food-coffee', english: 'Coffee', pronunciation: 'ˈkɒfi', icon: 'Coffee', emoji: '☕' },
  { id: 'food-juice', english: 'Juice', pronunciation: 'dʒuːs', icon: 'Wine', emoji: '🧃' },
  { id: 'food-palm-wine', english: 'Palm wine', pronunciation: 'pɑːm waɪn', icon: 'Wine', emoji: '🍶' },
  { id: 'food-cassava', english: 'Cassava', pronunciation: 'kəˈsɑːvə', icon: 'Apple', emoji: '🥔' },
  { id: 'food-beans', english: 'Beans', pronunciation: 'biːnz', icon: 'CircleDot', emoji: '🫘' },
  { id: 'food-corn', english: 'Corn', pronunciation: 'kɔːrn', icon: 'Wheat', emoji: '🌽' },
  { id: 'food-orange', english: 'Orange', pronunciation: 'ˈɒrɪndʒ', icon: 'Sun', emoji: '🍊' },
  { id: 'food-tomato', english: 'Tomato', pronunciation: 'təˈmɑːtoʊ', icon: 'Apple', emoji: '🍅' },
  { id: 'food-onion', english: 'Onion', pronunciation: 'ˈʌnjən', icon: 'Circle', emoji: '🧅' },
  { id: 'food-chicken', english: 'Chicken', pronunciation: 'ˈtʃɪkɪn', icon: 'Drumstick', emoji: '🍗' }
];
foodDrinks.forEach(f => {
  NEW_ITEMS.push({
    ...f,
    category: 'Food',
    theme: { bg: '#FFEDD5', text: '#C2410C', badge: 'Food & Drinks' }
  });
});

// 5. Common Household Objects (14 items)
const householdObjects = [
  { id: 'home-cup', english: 'Cup', pronunciation: 'kʌp', icon: 'Coffee', emoji: '🥤' },
  { id: 'home-plate', english: 'Plate', pronunciation: 'pleɪt', icon: 'Disc', emoji: '🍽️' },
  { id: 'home-spoon', english: 'Spoon', pronunciation: 'spuːn', icon: 'Utensils', emoji: '🥄' },
  { id: 'home-knife', english: 'Knife', pronunciation: 'naɪf', icon: 'Scissors', emoji: '🔪' },
  { id: 'home-pot', english: 'Pot', pronunciation: 'pɒt', icon: 'Soup', emoji: '🍲' },
  { id: 'home-broom', english: 'Broom', pronunciation: 'bruːm', icon: 'Brush', emoji: '🧹' },
  { id: 'home-mirror', english: 'Mirror', pronunciation: 'ˈmɪrər', icon: 'Square', emoji: '🪞' },
  { id: 'home-clock', english: 'Clock', pronunciation: 'klɒk', icon: 'Clock', emoji: '⏰' },
  { id: 'home-bucket', english: 'Bucket', pronunciation: 'ˈbʌkɪt', icon: 'Box', emoji: '🪣' },
  { id: 'home-soap', english: 'Soap', pronunciation: 'soʊp', icon: 'Sparkles', emoji: '🧼' },
  { id: 'home-pillow', english: 'Pillow', pronunciation: 'ˈpɪloʊ', icon: 'Square', emoji: '🛏️' },
  { id: 'home-blanket', english: 'Blanket', pronunciation: 'ˈblæŋkɪt', icon: 'Layers', emoji: '🛋️' },
  { id: 'home-towel', english: 'Towel', pronunciation: 'ˈtaʊəl', icon: 'Layers', emoji: '🧖' },
  { id: 'home-mat', english: 'Mat', pronunciation: 'mæt', icon: 'Layers', emoji: '🧘' }
];
householdObjects.forEach(h => {
  NEW_ITEMS.push({
    ...h,
    category: 'Home',
    theme: { bg: '#F1F5F9', text: '#334155', badge: 'Household' }
  });
});

// 6. Animals (14 items)
const animals = [
  { id: 'animal-cow', english: 'Cow', pronunciation: 'kaʊ', icon: 'Activity', emoji: '🐄' },
  { id: 'animal-sheep', english: 'Sheep', pronunciation: 'ʃiːp', icon: 'Activity', emoji: '🐑' },
  { id: 'animal-horse', english: 'Horse', pronunciation: 'hɔːrs', icon: 'Activity', emoji: '🐎' },
  { id: 'animal-lion', english: 'Lion', pronunciation: 'ˈlaɪən', icon: 'Activity', emoji: '🦁' },
  { id: 'animal-elephant', english: 'Elephant', pronunciation: 'ˈɛlɪfənt', icon: 'Activity', emoji: '🐘' },
  { id: 'animal-monkey', english: 'Monkey', pronunciation: 'ˈmʌŋki', icon: 'Activity', emoji: '🐒' },
  { id: 'animal-snake', english: 'Snake', pronunciation: 'sneɪk', icon: 'Activity', emoji: '🐍' },
  { id: 'animal-pig', english: 'Pig', pronunciation: 'pɪɡ', icon: 'Activity', emoji: '🐖' },
  { id: 'animal-duck', english: 'Duck', pronunciation: 'dʌk', icon: 'Bird', emoji: '🦆' },
  { id: 'animal-rabbit', english: 'Rabbit', pronunciation: 'ˈræbɪt', icon: 'Activity', emoji: '🐇' },
  { id: 'animal-lizard', english: 'Lizard', pronunciation: 'ˈlɪzərd', icon: 'Activity', emoji: '🦎' },
  { id: 'animal-rat', english: 'Rat', pronunciation: 'ræt', icon: 'Activity', emoji: '🐀' },
  { id: 'animal-frog', english: 'Frog', pronunciation: 'frɒɡ', icon: 'Activity', emoji: '🐸' },
  { id: 'animal-tortoise', english: 'Tortoise', pronunciation: 'ˈtɔːrtəs', icon: 'Activity', emoji: '🐢' }
];
animals.forEach(a => {
  NEW_ITEMS.push({
    ...a,
    category: 'Animals',
    theme: { bg: '#DCFCE7', text: '#15803D', badge: 'Animals' }
  });
});

// 7. Family Members (8 items)
const familyMembers = [
  { id: 'family-son', english: 'Son', pronunciation: 'sʌn', icon: 'User', emoji: '👦🏾' },
  { id: 'family-daughter', english: 'Daughter', pronunciation: 'ˈdɔːtər', icon: 'User', emoji: '👧🏾' },
  { id: 'family-husband', english: 'Husband', pronunciation: 'ˈhʌzbənd', icon: 'User', emoji: '👨🏾' },
  { id: 'family-wife', english: 'Wife', pronunciation: 'waɪf', icon: 'User', emoji: '👩🏾' },
  { id: 'family-uncle', english: 'Uncle', pronunciation: 'ˈʌŋkəl', icon: 'User', emoji: '🧔🏾' },
  { id: 'family-aunt', english: 'Aunt', pronunciation: 'ænt', icon: 'User', emoji: '👩🏾' },
  { id: 'family-cousin', english: 'Cousin', pronunciation: 'ˈkʌzən', icon: 'Users', emoji: '🧑🏾' },
  { id: 'family-parents', english: 'Parents', pronunciation: 'ˈpɛərənts', icon: 'Users', emoji: '👨‍👩‍👦' }
];
familyMembers.forEach(f => {
  NEW_ITEMS.push({
    ...f,
    category: 'Family',
    theme: { bg: '#F3E8FF', text: '#7E22CE', badge: 'Family' }
  });
});

// 8. Everyday Objects & Expressions (10 items)
const dailyExpressions = [
  { id: 'phrase-good-night', english: 'Good night', pronunciation: 'ɡʊd naɪt', icon: 'Moon', emoji: '🌙' },
  { id: 'phrase-i-am-fine', english: 'I am fine', pronunciation: 'aɪ æm faɪn', icon: 'Smile', emoji: '😊' },
  { id: 'phrase-excuse-me', english: 'Excuse me', pronunciation: 'ɪkˈskjuːz miː', icon: 'MessageCircle', emoji: '🙋🏾' },
  { id: 'phrase-i-am-sorry', english: 'I am sorry', pronunciation: 'aɪ æm ˈsɒri', icon: 'Heart', emoji: '🙏🏾' },
  { id: 'phrase-well-done', english: 'Well done', pronunciation: 'wɛl dʌn', icon: 'ThumbsUp', emoji: '👏🏾' },
  { id: 'phrase-see-you-later', english: 'See you later', pronunciation: 'siː juː ˈleɪtər', icon: 'Clock', emoji: '👋🏾' },
  { id: 'phrase-how-much', english: 'How much?', pronunciation: 'haʊ mʌtʃ', icon: 'DollarSign', emoji: '💰' },
  { id: 'phrase-help-me', english: 'Help me', pronunciation: 'hɛlp miː', icon: 'AlertCircle', emoji: '🆘' },
  { id: 'phrase-congratulations', english: 'Congratulations', pronunciation: 'kənˌɡrætʃʊˈleɪʃənz', icon: 'Award', emoji: '🎉' },
  { id: 'phrase-safe-journey', english: 'Safe journey', pronunciation: 'seɪf ˈdʒɜːrni', icon: 'Navigation', emoji: '🚗' }
];
dailyExpressions.forEach(d => {
  NEW_ITEMS.push({
    ...d,
    category: 'Daily expressions',
    theme: { bg: '#D1FAE5', text: '#047857', badge: 'Expressions' }
  });
});

// Filter out any duplicates
const addedItems = [];
NEW_ITEMS.forEach(item => {
  const norm = item.english.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
  if (existingIds.has(item.id) || existingNorm.has(norm)) {
    console.warn('Skipping duplicate:', item.id, item.english);
    return;
  }
  existingIds.add(item.id);
  existingNorm.add(norm);
  addedItems.push(item);
});

console.log('Total newly added items:', addedItems.length);

async function generateAssets() {
  for (const item of addedItems) {
    const filePath = path.join(ASSETS_DIR, `${item.id}.jpg`);
    const theme = item.theme || { bg: '#E6F4ED', text: '#157A4C', badge: item.category };
    
    // Choose font size based on text length
    const textLen = item.english.length;
    let fontSize = 48;
    if (textLen <= 2) fontSize = 160;
    else if (textLen <= 5) fontSize = 80;
    else if (textLen <= 10) fontSize = 56;
    else fontSize = 42;

    const svg = `
<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.bg}" />
      <stop offset="100%" stop-color="#FFFFFF" />
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#grad)" rx="36" />
  <rect x="20" y="20" width="360" height="360" fill="none" stroke="${theme.text}" stroke-width="3" stroke-opacity="0.2" rx="28" />
  <rect x="130" y="44" width="140" height="34" rx="17" fill="${theme.text}" fill-opacity="0.12" />
  <text x="200" y="67" font-size="16" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="700" fill="${theme.text}" text-anchor="middle" letter-spacing="1">${theme.badge.toUpperCase().replace(/&/g, '&amp;')}</text>
  <text x="200" y="${fontSize > 100 ? 250 : 210}" font-size="${fontSize}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="800" fill="${theme.text}" text-anchor="middle">${item.english.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
  ${item.pronunciation ? `<text x="200" y="280" font-size="22" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="500" fill="${theme.text}" fill-opacity="0.75" text-anchor="middle">/${item.pronunciation}/</text>` : ''}
</svg>`;

    const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
    fs.writeFileSync(filePath, buf);
  }
  console.log('✓ Successfully generated all JPEG assets in', ASSETS_DIR);
}

// Strip theme before writing to englishVocabulary.json
const cleanStarter = [
  ...starter,
  ...addedItems.map(item => {
    const { theme, ...rest } = item;
    return rest;
  })
];

fs.writeFileSync(VOCAB_PATH, JSON.stringify(cleanStarter, null, 2) + '\n', 'utf8');
console.log('✓ Updated englishVocabulary.json with', cleanStarter.length, 'total items.');

generateAssets().then(() => {
  console.log('✓ Asset generation complete.');
});

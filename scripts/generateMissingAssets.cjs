const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const VOCAB_PATH = path.join(__dirname, '../src/data/englishVocabulary.json');
const ASSETS_DIR = path.join(__dirname, '../public/assets/vocabulary');

const starter = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'));
console.log('Total items in englishVocabulary.json:', starter.length);

async function generateMissingAssets() {
  let createdCount = 0;
  for (const item of starter) {
    const filePath = path.join(ASSETS_DIR, `${item.id}.jpg`);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.size > 1000) continue; // Already exists and valid
    }

    let bg = '#EFF6FF';
    let text = '#1D4ED8';
    let badge = item.category || 'Vocabulary';

    if (item.category === 'Alphabet') {
      bg = '#EFF6FF'; text = '#1D4ED8'; badge = 'Alphabet';
    } else if (item.category === 'Numbers') {
      bg = '#FEF3C7'; text = '#B45309'; badge = `Number ${item.english}`;
    } else if (item.category === 'Body') {
      bg = '#FFE4E6'; text = '#BE123C'; badge = 'Body';
    } else if (item.category === 'Food') {
      bg = '#FFEDD5'; text = '#C2410C'; badge = 'Food & Drinks';
    } else if (item.category === 'Home') {
      bg = '#F1F5F9'; text = '#334155'; badge = 'Household';
    } else if (item.category === 'Animals') {
      bg = '#DCFCE7'; text = '#15803D'; badge = 'Animals';
    } else if (item.category === 'Family') {
      bg = '#F3E8FF'; text = '#7E22CE'; badge = 'Family';
    } else if (item.category === 'Daily expressions') {
      bg = '#D1FAE5'; text = '#047857'; badge = 'Expressions';
    }

    const textLen = item.english.length;
    let fontSize = 48;
    if (textLen <= 2) fontSize = 160;
    else if (textLen <= 5) fontSize = 80;
    else if (textLen <= 10) fontSize = 56;
    else fontSize = 42;

    const escapedBadge = badge.toUpperCase().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedEnglish = item.english.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const svg = `
<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bg}" />
      <stop offset="100%" stop-color="#FFFFFF" />
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#grad)" rx="36" />
  <rect x="20" y="20" width="360" height="360" fill="none" stroke="${text}" stroke-width="3" stroke-opacity="0.2" rx="28" />
  <rect x="110" y="44" width="180" height="34" rx="17" fill="${text}" fill-opacity="0.12" />
  <text x="200" y="67" font-size="15" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="700" fill="${text}" text-anchor="middle" letter-spacing="1">${escapedBadge}</text>
  <text x="200" y="${fontSize > 100 ? 250 : 210}" font-size="${fontSize}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="800" fill="${text}" text-anchor="middle">${escapedEnglish}</text>
  ${item.pronunciation ? `<text x="200" y="280" font-size="22" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="500" fill="${text}" fill-opacity="0.75" text-anchor="middle">/${item.pronunciation}/</text>` : ''}
</svg>`;

    const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
    fs.writeFileSync(filePath, buf);
    createdCount++;
  }
  console.log(`✓ Finished generating assets. Created ${createdCount} new JPEG files.`);
}

generateMissingAssets().then(() => {
  console.log('✓ All vocabulary images verified on disk.');
});

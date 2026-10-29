/**
 * Downloads and optimizes curated starter vocabulary images from Unsplash.
 * All images are properly licensed under the Unsplash License (free for commercial and personal use).
 */

const fs = require('node:fs');
const path = require('node:path');

const TARGET_DIR = path.join(__dirname, '..', 'public', 'assets', 'vocabulary');

const IMAGE_MAP = [
  { id: 'word-hand', photoId: 'photo-1544717305-2782549b5136' },
  { id: 'word-eye', photoId: 'photo-1544717302-de2939b7ef71' },
  { id: 'body-head', photoId: 'photo-1534528741775-53994a69daeb' },
  { id: 'body-ear', photoId: 'photo-1590402494587-44b71d7772f6' },
  { id: 'body-nose', photoId: 'photo-1507003211169-0a1dd7228f2d' },
  { id: 'body-mouth', photoId: 'photo-1518717758536-85ae29035b6d' },
  { id: 'body-foot', photoId: 'photo-1519708227418-c8fd9a32b7a2' },
  { id: 'body-leg', photoId: 'photo-1508214751196-bcfd4ca60f91' },
  { id: 'body-arm', photoId: 'photo-1581009146145-b5ef050c2e1e' },
  { id: 'body-heart', photoId: 'photo-1518199266791-5375a83190b7' },
  { id: 'move-go', photoId: 'photo-1473496169904-658ba7c44d8a' },
  { id: 'move-come', photoId: 'photo-1506794778202-cad84cf45f1d' },
  { id: 'sentence-going', photoId: 'photo-1469854523086-cc02fe5d8800' },
  { id: 'sentence-coming', photoId: 'photo-1476480862126-209bfaa8edc8' },
  { id: 'move-walk', photoId: 'photo-1485965120184-e220f721d03e' },
  { id: 'move-run', photoId: 'photo-1461896836934-ffe607ba8211' },
  { id: 'move-stop', photoId: 'photo-1584824486509-112e4181ff6b' },
  { id: 'move-enter', photoId: 'photo-1513694203232-719a280e022f' },
  { id: 'move-leave', photoId: 'photo-1516724562728-afc824a36e84' },
  { id: 'move-return', photoId: 'photo-1517486808906-6ca8b3f04846' },
  { id: 'move-sit', photoId: 'photo-1506126613408-eca07ce68773' },
  { id: 'move-stand', photoId: 'photo-1507003211169-0a1dd7228f2d' },
  { id: 'move-climb', photoId: 'photo-1522163182402-834f871fd851' },
  { id: 'move-fall', photoId: 'photo-1509198397868-475647b2a1e5' },
  { id: 'transport-bus', photoId: 'photo-1544620347-c4fd4a3d5957' },
  { id: 'transport-car', photoId: 'photo-1552519507-da3b142c6e3d' },
  { id: 'transport-bicycle', photoId: 'photo-1485965120184-e220f721d03e' },
  { id: 'transport-train', photoId: 'photo-1474487548417-781cb71495f3' },
  { id: 'transport-airplane', photoId: 'photo-1436491865332-7a61a109cc05' },
  { id: 'transport-boat', photoId: 'photo-1544551763-46a013bb70d5' },
  { id: 'transport-road', photoId: 'photo-1502899576159-f224dc2349fa' },
  { id: 'transport-driver', photoId: 'photo-1449965408869-eaa3f722e40d' },
  { id: 'transport-truck', photoId: 'photo-1601584115197-04ecc0da31d7' },
  { id: 'transport-journey', photoId: 'photo-1488646953014-85cb44e25828' },
  { id: 'word-house', photoId: 'photo-1518780664697-55e3ad937233' },
  { id: 'home-door', photoId: 'photo-1513694203232-719a280e022f' },
  { id: 'home-window', photoId: 'photo-1509644851169-2acc08aa25b5' },
  { id: 'home-room', photoId: 'photo-1586023492125-27b2c045efd7' },
  { id: 'home-bed', photoId: 'photo-1505693416388-ac5ce068fe85' },
  { id: 'home-chair', photoId: 'photo-1592078615290-033ee584e267' },
  { id: 'home-table', photoId: 'photo-1533090161767-e6ffed986c88' },
  { id: 'home-kitchen', photoId: 'photo-1556911220-e15b29be8c8f' },
  { id: 'home-roof', photoId: 'photo-1513694203232-719a280e022f' },
  { id: 'home-floor', photoId: 'photo-1581858726788-75bc0f6a952d' },
  { id: 'home-key', photoId: 'photo-1582139329536-e7284fece509' },
  { id: 'home-lamp', photoId: 'photo-1507473885765-e6ed057f782c' },
  { id: 'family-mother', photoId: 'photo-1531746020798-e6953c6e8e04' },
  { id: 'family-father', photoId: 'photo-1508214751196-bcfd4ca60f91' },
  { id: 'word-child', photoId: 'photo-1503454537195-1dcabb73ffb9' },
  { id: 'family-baby', photoId: 'photo-1519689680058-324335c77eba' },
  { id: 'family-brother', photoId: 'photo-1485546246426-74dc88dec4d9' },
  { id: 'family-sister', photoId: 'photo-1494790108377-be9c29b29330' },
  { id: 'family-grandmother', photoId: 'photo-1544005313-94ddf0286df2' },
  { id: 'family-grandfather', photoId: 'photo-1472099645785-5658abf4ff4e' },
  { id: 'family-friend', photoId: 'photo-1529156069898-49953e39b3ac' },
  { id: 'family-family', photoId: 'photo-1511895426328-dc8714191300' },
  { id: 'word-food', photoId: 'photo-1504674900247-0877df9cc836' },
  { id: 'word-water', photoId: 'photo-1550684848-fac1c5b4e853' },
  { id: 'food-rice', photoId: 'photo-1586201375761-83865001e31c' },
  { id: 'food-bread', photoId: 'photo-1509440159596-0249088772ff' },
  { id: 'food-meat', photoId: 'photo-1607623814075-e51df1bdc82f' },
  { id: 'food-fish', photoId: 'photo-1524704654690-b56c05c78a00' },
  { id: 'food-soup', photoId: 'photo-1547592166-23ac45744acd' },
  { id: 'food-fruit', photoId: 'photo-1619566636858-adf3ef46400b' },
  { id: 'food-vegetables', photoId: 'photo-1540420773420-3366772f4999' },
  { id: 'food-yam', photoId: 'photo-1596560548464-f010549b84d7' },
  { id: 'food-salt', photoId: 'photo-1518110925495-5fe2fda0442c' },
  { id: 'food-oil', photoId: 'photo-1474979266404-7eaacbcd87c5' },
  { id: 'food-pepper', photoId: 'photo-1563565375-f3fdfdbefa83' },
  { id: 'food-egg', photoId: 'photo-1506976785307-8732e854ad03' },
  { id: 'food-banana', photoId: 'photo-1571771894821-ce9b6c11b08e' },
  { id: 'action-eat', photoId: 'photo-1498837167922-ddd27525d352' },
  { id: 'action-drink', photoId: 'photo-1517256064527-09c73fc73e38' },
  { id: 'action-sleep', photoId: 'photo-1541781774459-bb2af2f05b55' },
  { id: 'action-talk', photoId: 'photo-1573496359142-b8d87734a5a2' },
  { id: 'action-listen', photoId: 'photo-1516589178581-6cd7833ae3b2' },
  { id: 'action-speak', photoId: 'photo-1475721027785-f74eccf877e2' },
  { id: 'action-read', photoId: 'photo-1512820790803-83ca734da794' },
  { id: 'action-write', photoId: 'photo-1455390582262-044cdead277a' },
  { id: 'action-work', photoId: 'photo-1497215728101-856f4ea42174' },
  { id: 'action-sing', photoId: 'photo-1516450360452-9312f5e86fc7' },
  { id: 'action-dance', photoId: 'photo-1508700115892-45ecd05ae2ad' },
  { id: 'action-laugh', photoId: 'photo-1517841905240-472988babdf9' },
  { id: 'action-buy', photoId: 'photo-1607082348824-0a96f2a4b9da' },
  { id: 'action-sell', photoId: 'photo-1556740758-90de374c12ad' },
  { id: 'action-cook', photoId: 'photo-1556910103-1c02745aae4d' },
  { id: 'action-wash', photoId: 'photo-1584634731339-252c581abfc5' },
  { id: 'place-school', photoId: 'photo-1580582932707-520aed937b7b' },
  { id: 'place-church', photoId: 'photo-1519817650390-64a93db51149' },
  { id: 'place-hospital', photoId: 'photo-1519494026892-80bbd2d6fd0d' },
  { id: 'place-market', photoId: 'photo-1533900298318-6b8da08a523e' },
  { id: 'place-shop', photoId: 'photo-1472851294608-062f824d29cc' },
  { id: 'place-office', photoId: 'photo-1497366216548-37526070297c' },
  { id: 'place-farm', photoId: 'photo-1500937386664-56d1dfef3854' },
  { id: 'place-town', photoId: 'photo-1519501025264-65ba15a82390' },
  { id: 'place-village', photoId: 'photo-1448375240586-882707db888b' },
  { id: 'word-tree', photoId: 'photo-1513836279014-a89f7a76ae86' },
  { id: 'word-sun', photoId: 'photo-1532274402911-5a369e4c4bb5' },
  { id: 'nature-rain', photoId: 'photo-1515694346937-94d85e41e6f0' },
  { id: 'nature-river', photoId: 'photo-1437482078695-73f5ca6c96e2' },
  { id: 'nature-sky', photoId: 'photo-1513002749550-c59d786b8e6c' },
  { id: 'nature-earth', photoId: 'photo-1451187580459-43490279c0fa' },
  { id: 'nature-fire', photoId: 'photo-1524338198850-8a2ff63aaceb' },
  { id: 'nature-wind', photoId: 'photo-1499346030926-9a72daac6c63' },
  { id: 'nature-moon', photoId: 'photo-1522030299830-16b8d3d049fe' },
  { id: 'nature-star', photoId: 'photo-1506703719100-a0f3a48c0f86' },
  { id: 'nature-stone', photoId: 'photo-1518241353330-0f7941c2d9b5' },
  { id: 'nature-mountain', photoId: 'photo-1464822759023-fed622ff2c3b' },
  { id: 'phrase-good-morning', photoId: 'photo-1470252649378-9c29740c9fa8' },
  { id: 'phrase-good-afternoon', photoId: 'photo-1507525428034-b723cf961d3e' },
  { id: 'phrase-good-evening', photoId: 'photo-1518495973542-4542c06a5843' },
  { id: 'phrase-thank-you', photoId: 'photo-1528605248644-14dd04022da1' },
  { id: 'phrase-please', photoId: 'photo-1469571486292-0ba58a3f068b' },
  { id: 'phrase-welcome', photoId: 'photo-1511632765486-a01980e01a18' },
  { id: 'phrase-come-here', photoId: 'photo-1516589178581-6cd7833ae3b2' },
  { id: 'sentence-your-name', photoId: 'photo-1521791136064-7986c2920216' },
  { id: 'phrase-how-are-you', photoId: 'photo-1529156069898-49953e39b3ac' },
  { id: 'phrase-yes', photoId: 'photo-1577563908411-5077b6dc7624' },
  { id: 'phrase-no', photoId: 'photo-1584824486509-112e4181ff6b' },
  { id: 'phrase-goodbye', photoId: 'photo-1506869640319-fe1a24fd76dc' },
  { id: 'word-book', photoId: 'photo-1544716278-ca5e3f4abd8c' },
  { id: 'tool-money', photoId: 'photo-1559526324-4b87b5e36e44' },
  { id: 'animal-dog', photoId: 'photo-1543466835-00a7907e9de1' },
  { id: 'animal-cat', photoId: 'photo-1514888286974-6c03e2ca1dba' },
  { id: 'animal-bird', photoId: 'photo-1444464666168-49d633b86797' },
  { id: 'animal-goat', photoId: 'photo-1524024973431-2ad916746881' },
  { id: 'clothes-shirt', photoId: 'photo-1521572267360-ee0c2909d518' },
  { id: 'clothes-shoes', photoId: 'photo-1542291026-7eec264c27ff' },
  { id: 'time-today', photoId: 'photo-1506784983877-45594efa4cbe' },
  { id: 'time-tomorrow', photoId: 'photo-1507525428034-b723cf961d3e' },
  { id: 'time-night', photoId: 'photo-1509198397868-475647b2a1e5' }
];

async function downloadAll() {
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  console.log(`Starting download of ${IMAGE_MAP.length} curated images...`);
  let downloaded = 0;
  let skipped = 0;

  for (const item of IMAGE_MAP) {
    const filename = `${item.id}.jpg`;
    const targetPath = path.join(TARGET_DIR, filename);

    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000) {
      skipped++;
      continue;
    }

    const url = `https://images.unsplash.com/${item.photoId}?w=400&h=400&fit=crop&q=80`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`Failed to fetch ${item.id} (${res.status}): ${url}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(targetPath, buf);
      downloaded++;
      if (downloaded % 10 === 0) {
        console.log(`Progress: ${downloaded + skipped}/${IMAGE_MAP.length} images ready...`);
      }
    } catch (err) {
      console.warn(`Error fetching ${item.id}:`, err.message);
    }
  }

  console.log(`Done! Downloaded: ${downloaded}, Already cached: ${skipped}, Total: ${IMAGE_MAP.length}`);
}

downloadAll().catch(err => {
  console.error('Fatal download error:', err);
  process.exit(1);
});

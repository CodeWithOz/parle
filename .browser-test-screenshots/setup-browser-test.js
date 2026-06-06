// Playwright run-code helper: seed IndexedDB + mock Gemini review API
async (page) => {
  const fs = require('fs');
  const path = require('path');
  const reviewJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'mock-review.json'), 'utf8')
  );

  const sleepMs = (ms) => { const end = Date.now() + ms; while (Date.now() < end) {} };
  let reviewCallCount = 0;
  await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
    reviewCallCount += 1;
    const delayMs = (reviewCallCount === 1 || reviewCallCount === 2) ? 8000 : 500;
    sleepMs(delayMs);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(reviewJson) }],
            },
          },
        ],
      }),
    });
  });

  await page.evaluate(async () => {
    const imageDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const ad = {
      id: 'browser-test-ad-1',
      exerciseType: 'persuasion',
      imageDataUrl,
      mimeType: 'image/png',
      confirmation: {
        summary: 'Une voiture électrique abordable avec garantie étendue.',
        roleSummary: 'Tu es un ami sceptique qui hésite à acheter.',
      },
      lastUsedAt: Date.now(),
    };

    await new Promise((resolve, reject) => {
      const req = indexedDB.open('parle-tef', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('savedAds')) {
          db.createObjectStore('savedAds', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('savedAds', 'readwrite');
        tx.objectStore('savedAds').put(ad);
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });

  return 'setup complete';
};

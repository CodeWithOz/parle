#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHOT_DIR="$ROOT/.browser-test-screenshots"
SESSION="parle-kozl-dev"
BASE_URL="http://localhost:3000"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$ROOT/.playwright-browsers}"
PW=(playwright-cli -s="$SESSION")
MOCK_REVIEW_JSON="$(cat "$SHOT_DIR/mock-review.json")"

pw_run() {
  local out rc
  set +e
  out="$("${PW[@]}" "$@" 2>&1)"
  rc=$?
  set -e
  echo "$out"
  if [[ $rc -ne 0 ]] || echo "$out" | grep -q "^### Error"; then
    return 1
  fi
}

cleanup() {
  "${PW[@]}" close 2>/dev/null || true
  "${PW[@]}" delete-data 2>/dev/null || true
}
trap cleanup EXIT

"${PW[@]}" kill-all 2>/dev/null || true

echo "==> Open app"
pw_run open "$BASE_URL"
pw_run eval "document.title"
pw_run snapshot --filename="$SHOT_DIR/01-app-load.yml"
pw_run screenshot --filename="$SHOT_DIR/01-app-load.png"

echo "==> Seed localStorage + mock Gemini + IndexedDB"
pw_run localstorage-set parle_api_key_gemini browser-test-key-mock

REVIEW_ESCAPED="$(python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1]))))' "$SHOT_DIR/mock-review.json")"

pw_run run-code "async page => {
  page.setDefaultTimeout(30000);
  const reviewJson = $REVIEW_ESCAPED;
  const sleepMs = (ms) => { const end = Date.now() + ms; while (Date.now() < end) {} };
  let reviewCallCount = 0;
  await page.route(/generativelanguage\.googleapis\.com/, async route => {
    reviewCallCount += 1;
    const delayMs = (reviewCallCount === 1 || reviewCallCount === 2) ? 8000 : 500;
    sleepMs(delayMs);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(reviewJson) }] } }]
      })
    });
  });
  await page.evaluate(async () => {
    const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const ad = {
      id: 'browser-test-ad-1',
      exerciseType: 'persuasion',
      imageDataUrl,
      mimeType: 'image/png',
      confirmation: {
        summary: 'Une voiture électrique abordable avec garantie étendue.',
        roleSummary: 'Tu es un ami sceptique qui hésite à acheter.'
      },
      lastUsedAt: Date.now()
    };
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('parle-tef', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('savedAds')) {
          const store = db.createObjectStore('savedAds', { keyPath: 'id' });
          store.createIndex('exerciseType', 'exerciseType', { unique: false });
          store.createIndex('lastUsedAt', 'lastUsedAt', { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('savedAds', 'readwrite');
        tx.objectStore('savedAds').put(ad);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
  return 'setup complete';
}"

echo "==> Start saved ad practice and exit to summary"
pw_run run-code "async page => {
  page.setDefaultTimeout(30000);
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await page.getByRole('button', { name: /Ad Persuasion/i }).click();
  await page.getByText(/or pick a recent ad/i).waitFor({ timeout: 15000 });
  await page.getByRole('heading', { name: 'Recent' }).waitFor({ timeout: 15000 });
  return 'setup ready';
}"
pw_run run-code "async page => {
  page.setDefaultTimeout(30000);
  await page.locator('section').filter({ hasText: 'or pick a recent ad' }).getByRole('button', { name: 'Start', exact: true }).first().click();
  await page.getByRole('button', { name: 'Exit' }).waitFor({ timeout: 15000 });
  return 'practice started';
}"
pw_run run-code "async page => {
  page.setDefaultTimeout(30000);
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  return 'exited practice';
}"
pw_run run-code "async page => {
  page.setDefaultTimeout(30000);
  await page.getByRole('heading', { name: 'Session Complete' }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Done' }).waitFor({ timeout: 15000 });
  const generating = await page.getByText(/Generating your review/i).isVisible().catch(() => false);
  if (!generating) {
    await page.getByRole('status').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  }
  return generating ? 'summary loading' : 'summary open';
}"
pw_run screenshot --filename="$SHOT_DIR/03-summary-loading.png"

echo "==> Dismiss before review completes"
pw_run run-code "async page => {
  page.setDefaultTimeout(30000);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('heading', { name: 'Session Complete' }).waitFor({ state: 'hidden', timeout: 10000 });
  return 'dismissed';
}"
pw_run screenshot --filename="$SHOT_DIR/04-after-dismiss.png"

echo "==> Wait for stale response, verify no ghost summary, reopen"
pw_run run-code "async page => {
  page.setDefaultTimeout(30000);
  await page.waitForTimeout(9000);
  const staleVisible = await page.getByRole('heading', { name: 'Session Complete' }).isVisible().catch(() => false);
  if (staleVisible) throw new Error('Stale summary appeared after dismiss');
  return 'no stale summary';
}"
pw_run run-code "async page => {
  page.setDefaultTimeout(30000);
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await page.getByRole('button', { name: /Ad Persuasion/i }).click();
  await page.getByText(/or pick a recent ad/i).waitFor({ timeout: 15000 });
  await page.locator('section').filter({ hasText: 'or pick a recent ad' }).getByRole('button', { name: 'Start', exact: true }).first().click();
  await page.getByRole('button', { name: 'Exit' }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('heading', { name: 'Session Complete' }).waitFor({ timeout: 15000 });
  return 'reopened summary';
}"
pw_run screenshot --filename="$SHOT_DIR/05-reopened-loading.png"

echo "==> Wait for mocked review topics"
pw_run run-code "async page => {
  page.setDefaultTimeout(30000);
  await page.getByText(/Topics You Could Have Mentioned/i).waitFor({ timeout: 15000 });
  await page.getByText('Le rapport qualité-prix', { exact: true }).first().waitFor({ timeout: 5000 });
  const persuasive = await page.getByText(/Je te conseille cette offre/i).count();
  if (persuasive < 1) throw new Error('Expected persuasive user statements in topic examples');
  return 'topics verified';
}"
pw_run snapshot --filename="$SHOT_DIR/06-summary-with-topics.yml"
pw_run screenshot --filename="$SHOT_DIR/06-summary-with-topics.png"

echo "ALL_BROWSER_TESTS_PASSED"

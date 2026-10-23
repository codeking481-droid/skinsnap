// Explicit opt-in live evaluation against an isolated local remote-preview server.
// Uses synthetic fixtures only; no database reservations or customer photos.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const manifest = JSON.parse(await fs.readFile('tests/fixtures/analysis-quality/manifest.json', 'utf8'));
const endpoint = process.env.SKIN_EVAL_URL;
if (!endpoint || !/^http:\/\/127\.0\.0\.1:\d+\//.test(endpoint)) throw new Error('Set SKIN_EVAL_URL to the isolated local preview endpoint.');
const output = process.env.SKIN_EVAL_OUTPUT ?? 'artifacts/analysis-repair/evaluation.json';
const selected = process.argv.slice(2);
const cases = manifest.cases.filter(item => !item.pending && (!selected.length || selected.includes(item.id)));
if (!cases.length) throw new Error('No available fixtures selected. Image generation was stopped at user request.');
const results = [];
for (const [index, item] of cases.entries()) {
  const form = new FormData();
  const data = await fs.readFile(path.join('tests/fixtures/analysis-quality', item.file));
  // Match mobile preparation: a resized JPEG, not the original metadata-heavy PNG.
  const prepared = await sharp(data).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  form.set('photo', new Blob([prepared], { type: 'image/jpeg' }), item.id + '.jpg');
  form.set('preferences', JSON.stringify(item.preferences ?? {}));
  let result;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch(endpoint, { method: 'POST', body: form, signal: AbortSignal.timeout(110_000) });
    result = await response.json();
    if (result.ok || result.code !== 'vision-provider-quota-exhausted' || attempt === 2) break;
    const waitMs = Math.min(90_000, Math.max(60_000, (result.retryAfter ?? 60) * 1000));
    console.log(item.id, 'throttled; waiting for provider allowance');
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  const observed = result.observations;
  const checks = result.ok ? {
    suitability: item.expectUsable === null || observed.imageAssessment.usable === item.expectUsable,
    noRoutineForRejected: observed.imageAssessment.usable || result.routine === null,
    noFindingsForRejected: observed.imageAssessment.usable || observed.observations.length === 0,
    atMostFour: observed.observations.length <= 4,
    limitedCertainty: observed.imageQuality !== 'limited' || observed.observations.every(o => o.confidence !== 'high' && o.visibility !== 'clearly-visible'),
    expectedFeature: !item.expectedCategory || observed.observations.some(o => o.category === item.expectedCategory),
  } : {};
  results.push({ id: item.id, checks, ...result });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify({ syntheticOnly: true, clinicalValidation: false, results }, null, 2));
  console.log(item.id, result.ok ? JSON.stringify(checks) : result.code, result.elapsedMs + 'ms');
  if (index < cases.length - 1) await new Promise(resolve => setTimeout(resolve, 60_000));
}
if (results.some(r => !r.ok || Object.values(r.checks).some(v => !v))) process.exitCode = 1;

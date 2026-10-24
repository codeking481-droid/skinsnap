import assert from 'node:assert/strict';
const port = Number(process.env.SKIN_SNAP_LEGAL_SITE_PORT ?? 8795);
const base = `http://127.0.0.1:${port}/`;
const pages = ['/', '/privacy', '/terms', '/delete-account', '/support.html'];
const checked = new Set();
for (const name of pages) {
  const response = await fetch(new URL(name, base));
  assert.equal(response.status, 200, name);
  assert.ok(response.headers.get('content-security-policy')?.includes("form-action 'none'"));
  const html = await response.text();
  assert.ok(html.includes('Review draft') || html.includes('review draft') || html.includes('not publicly approved'), name + ' must remain marked as a draft');
  assert.ok(!html.includes('Google Gemini'), name + ' must identify the actual provider');
  assert.ok(!html.includes('mailto:['), 'No pretend contact links');
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = new URL(match[1], new URL(name, base));
    if (target.origin !== new URL(base).origin || target.hash || checked.has(target.href)) continue;
    const link = await fetch(target);
    assert.equal(link.status, 200, target.pathname);
    checked.add(target.href);
  }
}
const config = await (await fetch(new URL('site-config.json', base))).json();
assert.equal(config.legalPublicationApproved, false);
assert.equal(config.agePolicyApproved, true);
assert.equal(config.supportEmail, null);
assert.equal(config.deletionEnabled, false);
assert.ok(!JSON.stringify(config).includes('sb_secret_'));
const deletionPage = await (await fetch(new URL('delete-account', base))).text();
assert.ok(deletionPage.includes('type="submit" disabled'));
assert.ok(deletionPage.includes('method="post"'));
const result = { localOnly: true, pages: pages.length, internalResourcesVerified: checked.size, publicDeployment: false, passed: true };
console.log(result);

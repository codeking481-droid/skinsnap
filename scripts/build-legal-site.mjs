import fs from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';

const output = path.resolve(process.argv[2] ?? 'artifacts/finalization/legal-site');
const source = path.resolve('website');
if (output === source || output.startsWith(`${source}${path.sep}`)) {
  throw new Error('Use a separate staging directory outside website/.');
}

await fs.mkdir(output, { recursive: true });
for (const name of [
  'index.html',
  'privacy.html',
  'terms.html',
  'delete-account.html',
  'support.html',
  'styles.css',
  'deletion.mjs',
  'deletion-client.mjs',
  '_headers',
  '_redirects',
]) {
  await fs.copyFile(path.join(source, name), path.join(output, name));
}

const config = JSON.parse(await fs.readFile(path.join(source, 'site-config.example.json'), 'utf8'));
await fs.writeFile(path.join(output, 'site-config.json'), JSON.stringify({
  ...config,
  supabaseUrl: '',
  publishableKey: '',
  deletionEnabled: false,
}, null, 2));
await fs.writeFile(path.join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
let envText = '';
try {
  envText = await fs.readFile('.env', 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const publicEnv = Object.fromEntries(envText
  .split(/\r?\n/)
  .filter(line => /^EXPO_PUBLIC_(SUPABASE_URL|SUPABASE_ANON_KEY|API_URL)=/.test(line))
  .map(line => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));

config.supabaseUrl = publicEnv.EXPO_PUBLIC_SUPABASE_URL ?? '';
config.publishableKey = publicEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
config.apiUrl = publicEnv.EXPO_PUBLIC_API_URL ?? config.apiUrl;
function isPublicSupabaseKey(value) {
  if (value.startsWith('sb_publishable_')) return true;
  const jwtPayload = value.match(/^eyJ[A-Za-z0-9_-]*\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/)?.[1];
  if (!jwtPayload) return false;
  try {
    const payload = JSON.parse(Buffer.from(jwtPayload, 'base64url').toString('utf8'));
    return payload.role === 'anon';
  } catch {
    return false;
  }
}
if (config.publishableKey && !isPublicSupabaseKey(config.publishableKey)) {
  throw new Error('Only a public Supabase client key may be staged.');
}

function httpsOrigin(value, name, optional = false) {
  if (!value && optional) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be a valid HTTPS URL without credentials, query, or fragment.`);
  }
  return url.origin;
}

const apiOrigin = httpsOrigin(config.apiUrl, 'The SkinSnap API URL');
const supabaseOrigin = httpsOrigin(config.supabaseUrl, 'The Supabase URL', true);
config.deletionEnabled = false;
await fs.writeFile(path.join(output, 'site-config.json'), JSON.stringify(config, null, 2));
const deletionRequested = process.argv.includes('--enable-account-deletion');
const deletionReady = Boolean(
  config.legalPublicationApproved === true
  && config.agePolicyApproved === true
  && typeof config.supportEmail === 'string'
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.supportEmail)
  && config.publishableKey
  && supabaseOrigin
  && apiOrigin,
);

if (deletionRequested && !deletionReady) {
  throw new Error('Account deletion cannot be enabled until legal publication, 18+ policy, support contact, Supabase, and API configuration are approved.');
}
if (config.legalPublicationApproved === true && !deletionRequested) {
  throw new Error('Public legal-page publication requires the externally accessible account-deletion flow to be enabled.');
}
config.deletionEnabled = deletionRequested && deletionReady;
const htmlNames = ['index.html', 'privacy.html', 'terms.html', 'delete-account.html', 'support.html'];
const pages = await Promise.all(htmlNames.map(name => fs.readFile(path.join(output, name), 'utf8')));
const draftMarkers = ['Review draft', 'review draft', 'not yet effective', 'not assigned', 'not been supplied', 'not publicly approved'];
if (config.legalPublicationApproved === true && pages.some(page => draftMarkers.some(marker => page.includes(marker)))) {
  throw new Error('Draft markers remain in the website pages; do not build an approved public site until they are resolved.');
}
if (config.legalPublicationApproved === true) {
  await Promise.all(htmlNames.map(async (name, index) => {
    const published = pages[index].replace(
      '<meta name="robots" content="noindex,nofollow">',
      '<meta name="robots" content="index,follow">',
    );
    await fs.writeFile(path.join(output, name), published);
  }));
}
await fs.writeFile(path.join(output, 'site-config.json'), JSON.stringify(config, null, 2));

let headers = await fs.readFile(path.join(output, '_headers'), 'utf8');
if (config.deletionEnabled) {
  headers = headers.replace(
    "connect-src 'self'",
    `connect-src 'self' ${apiOrigin} ${supabaseOrigin}`,
  );
}
await fs.writeFile(path.join(output, '_headers'), headers);
await fs.writeFile(
  path.join(output, 'robots.txt'),
  config.legalPublicationApproved === true ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n',
);

console.log('Legal review site built:', output);
console.log(config.deletionEnabled
  ? 'Account deletion enabled for the explicitly approved staging build.'
  : 'DRAFT ONLY: external account deletion remains disabled; no public URL is claimed.');

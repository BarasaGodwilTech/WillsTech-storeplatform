// storage.js — where product photos live.
//   • Cloudflare R2 (recommended): set R2_* in backend/.env.
//   • Otherwise: the local folder public/images/products (fine for testing; lost on hosts with a temporary disk).
// Every photo is auto-rotated, resized and converted to WebP, and a small "-sm" copy is made for product cards.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.warn('[storage] "sharp" is not available: photos are stored without resizing.'); }

const LOCAL_DIR = path.join(__dirname, '..', '..', '..', 'public', 'images', 'products');
const LOCAL_URL = '/public/images/products';
const KEY_PREFIX = 'products';

const env = () => ({
  accountId: (process.env.R2_ACCOUNT_ID || '').trim(),
  accessKeyId: (process.env.R2_ACCESS_KEY_ID || '').trim(),
  secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || '').trim(),
  bucket: (process.env.R2_BUCKET || '').trim(),
  publicUrl: (process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, ''),
  endpoint: (process.env.R2_ENDPOINT || '').trim(),
});

function missingVars() {
  const e = env(); const miss = [];
  if (!e.accountId && !e.endpoint) miss.push('R2_ACCOUNT_ID');
  if (!e.accessKeyId) miss.push('R2_ACCESS_KEY_ID');
  if (!e.secretAccessKey) miss.push('R2_SECRET_ACCESS_KEY');
  if (!e.bucket) miss.push('R2_BUCKET');
  if (!e.publicUrl) miss.push('R2_PUBLIC_URL');
  return miss;
}
const isR2 = () => missingVars().length === 0;

let _client = null, _key = '';
function client() {
  const e = env(); const k = [e.accountId, e.accessKeyId, e.endpoint].join('|');
  if (_client && _key === k) return _client;
  const { S3Client } = require('@aws-sdk/client-s3');
  _client = new S3Client({
    region: 'auto',
    endpoint: e.endpoint || `https://${e.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: e.accessKeyId, secretAccessKey: e.secretAccessKey },
    forcePathStyle: !!e.endpoint,
  });
  _key = k; return _client;
}

async function putR2(key, body, contentType) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await client().send(new PutObjectCommand({ Bucket: env().bucket, Key: key, Body: body, ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable' }));   // names are unique, so caches may keep them forever
}

const isR2Url = (url) => { const e = env(); return !!(e.publicUrl && String(url || '').startsWith(e.publicUrl + '/')); };
const newBaseName = () => `product-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

async function writeFile(name, buf, contentType) {
  if (isR2()) { await putR2(`${KEY_PREFIX}/${name}`, buf, contentType); return `${env().publicUrl}/${KEY_PREFIX}/${name}`; }
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_DIR, name), buf);
  return `${LOCAL_URL}/${name}`;
}

// Save one product photo. Returns { url, thumbUrl, storage, bytes }.
async function saveProductImage(buffer, mime, baseName) {
  baseName = baseName || newBaseName();
  const storage = isR2() ? 'r2' : 'local';
  if (!sharp || mime === 'image/gif') {   // animated GIFs / no sharp: store as uploaded
    const url = await writeFile(baseName + (EXT[mime] || '.jpg'), buffer, mime || 'image/jpeg');
    return { url, thumbUrl: url, storage, bytes: buffer.length };
  }
  const base = sharp(buffer, { failOn: 'none' }).rotate();
  const main = await base.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const thumb = await base.clone().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  const url = await writeFile(`${baseName}.webp`, main, 'image/webp');
  const thumbUrl = await writeFile(`${baseName}-sm.webp`, thumb, 'image/webp');
  return { url, thumbUrl, storage, bytes: main.length };
}

async function status() {
  const miss = missingVars(); const e = env();
  return { mode: miss.length ? 'local' : 'r2', configured: !miss.length, missing: miss, bucket: e.bucket || null, publicUrl: e.publicUrl || null, optimiser: !!sharp };
}

// Writes and deletes a tiny test file so the admin can confirm keys, bucket and public URL really work.
async function testConnection() {
  if (!isR2()) return { ok: false, message: 'R2 is not set up yet. Missing: ' + missingVars().join(', ') };
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const key = `${KEY_PREFIX}/.connection-test-${Date.now()}.txt`;
  try {
    await putR2(key, Buffer.from('ok'), 'text/plain');
    await client().send(new DeleteObjectCommand({ Bucket: env().bucket, Key: key }));
    return { ok: true, message: `Connected. Photos will be saved to bucket "${env().bucket}".` };
  } catch (e) {
    const t = (e.name || '') + (e.message || '');
    const hint = /AccessDenied|Forbidden|403/i.test(t) ? ' The API token needs "Object Read & Write" on this bucket.'
      : /NoSuchBucket/i.test(t) ? ' That bucket name does not exist in your Cloudflare account.'
      : /InvalidAccessKeyId|SignatureDoesNotMatch/i.test(t) ? ' The access key ID or secret is wrong.' : '';
    return { ok: false, message: 'Could not reach R2: ' + (e.message || e.name) + '.' + hint };
  }
}

module.exports = { LOCAL_DIR, LOCAL_URL, isR2, isR2Url, status, testConnection, saveProductImage, newBaseName, missingVars };

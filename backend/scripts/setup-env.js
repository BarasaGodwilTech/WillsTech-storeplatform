// setup-env.js — makes sure backend/.env exists and is usable. Interactive but safe to re-run.
// Creates .env from .env.example, generates a JWT secret + admin password, asks for the Neon URL.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const ENV = path.join(__dirname, '..', '.env');
const EXAMPLE = path.join(__dirname, '..', '.env.example');
if (!fs.existsSync(ENV)) { fs.copyFileSync(EXAMPLE, ENV); console.log('[setup] Created backend/.env'); }

let text = fs.readFileSync(ENV, 'utf8');
const get = (k) => { const m = new RegExp('^' + k + '=(.*)$', 'm').exec(text); return m ? m[1].trim() : ''; };
const set = (k, v) => { const re = new RegExp('^' + k + '=.*$', 'm'); text = re.test(text) ? text.replace(re, () => k + '=' + v) : text + '\n' + k + '=' + v + '\n'; };
const save = () => fs.writeFileSync(ENV, text);

// JWT secret
const jwt = get('JWT_SECRET');
if (!jwt || jwt.startsWith('replace_this') || jwt.length < 32) {
  set('JWT_SECRET', crypto.randomBytes(48).toString('hex'));
  console.log('[setup] Generated a private JWT_SECRET.');
}

// Admin password
let newAdminPass = null;
if (get('ADMIN_PASSWORD') === 'ChangeMe123!') {
  newAdminPass = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, 'x') + '!7';
  set('ADMIN_PASSWORD', newAdminPass);
}
save();

const isPlaceholder = (u) => !u || /paste_your|your_neon|^postgres(ql)?:\/\/willstech:willstech@localhost/.test(u);
const valid = (u) => { try { const x = new URL(u); return /^postgres(ql)?:$/.test(x.protocol) && !!x.hostname; } catch (e) { return false; } };

async function main() {
  let url = get('DATABASE_URL');
  if (isPlaceholder(url) || !valid(url)) {
    console.log('\n  Paste your Neon connection string (Neon dashboard -> Connect -> copy).');
    console.log('  It starts with postgresql:// and contains your password.\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((r) => rl.question(q, r));
    for (let i = 0; i < 3; i++) {
      const a = (await ask('  Neon connection string: ')).trim().replace(/^["']|["']$/g, '');
      if (valid(a)) { url = a; break; }
      console.log('  That does not look like a postgresql:// URL. Try again.');
    }
    rl.close();
    if (!valid(url)) { console.log('\n[setup] No valid connection string entered. Edit backend/.env and set DATABASE_URL, then run start again.'); process.exit(1); }
    set('DATABASE_URL', url); save();
    console.log('[setup] Saved DATABASE_URL to backend/.env');
  }
  if (newAdminPass) {
    console.log('\n  ┌──────────────────────────────────────────────────────────');
    console.log('  │ Admin login (saved in backend/.env):');
    console.log('  │   email:    ' + get('ADMIN_EMAIL'));
    console.log('  │   password: ' + newAdminPass);
    console.log('  └──────────────────────────────────────────────────────────\n');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

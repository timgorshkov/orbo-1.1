const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const envPath = process.env.ENV_PATH || '/home/deploy/orbo/.env';
const projectRoot = path.dirname(path.dirname(envPath));
const migrationPath = path.join(projectRoot, 'app', 'db', 'migrations', '223_add_image_url_to_announcements.sql');

const envContent = fs.readFileSync(envPath, 'utf8');
let DATABASE_URL = '';
for (const line of envContent.split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) {
    DATABASE_URL = (m[1] || '').replace(/^["']|["']$/g, '').trim();
    break;
  }
}

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in', envPath);
  process.exit(1);
}

console.log('Applying migration 223...');
execSync(`psql "${DATABASE_URL.replace(/"/g, '\\"')}" -f "${migrationPath}"`, { stdio: 'inherit' });
console.log('Migration 223 applied successfully.');

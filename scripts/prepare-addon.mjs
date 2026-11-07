// Keep the installable add-on self-contained: Supervisor builds this directory only.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(root + 'cdshelf/www/web', { recursive: true });
copyFileSync(root + 'index.html', root + 'cdshelf/www/index.html');
for (const name of readdirSync(root + 'web')) {
  if (/\.(js|css)$/.test(name)) copyFileSync(root + 'web/' + name, root + 'cdshelf/www/web/' + name);
}
console.log('Home Assistant add-on assets prepared.');

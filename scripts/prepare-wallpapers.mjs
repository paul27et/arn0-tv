// Turns large photos into TV-ready wallpapers: 1920x1080 cover crop with the readability scrim
// baked in, saved as JPEG in src/img/wallpapers/, plus the catalog src/js/wallpapers.js.
// The scrim is part of the image so the TV never composites a gradient over a photo at runtime.
//
//   node scripts/prepare-wallpapers.mjs ~/Downloads/backgrounds
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sourceDir = resolve(process.argv[2] || '');
const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'src/img/wallpapers');

// Friendly names for known files (Unsplash file names: <photographer>-<id>-unsplash.jpg).
// `position` is the CSS background-position used for the crop.
const KNOWN = {
    'anders-jilden-cYrMQA7a3Wc-unsplash.jpg': { key: 'coast', title: 'Coast village', position: 'center 60%' },
    'jms-kFHz9Xh3PPU-unsplash.jpg': { key: 'valley-snow', title: 'Snowy valley' },
    'johannes-plenio-hvrpOmuMrAI-unsplash.jpg': { key: 'forest', title: 'Forest path' },
    'jonatan-pie-3l3RwQdHRHg-unsplash.jpg': { key: 'aurora', title: 'Aurora' },
    'jonatan-pie-h8nxGssjQXs-unsplash.jpg': { key: 'night-sky', title: 'Night sky' },
    'nasa-Q1p7bh3SHj8-unsplash.jpg': { key: 'earth', title: 'Earth at night' },
    'stefan-stefancik-TPv9dh822VA-unsplash.jpg': { key: 'milky-way', title: 'Milky Way' },
    'su-san-lee-E_eWwM29wfU-unsplash.jpg': { key: 'kyoto', title: 'Kyoto' },
    'urban-vintage-78A265wPiO4-unsplash.jpg': { key: 'hills', title: 'Golden hills' },
    'wil-stewart-pHANr-CpbYM-unsplash.jpg': { key: 'waterfall', title: 'Waterfall' },
    // CC0 photos from Wikimedia Commons, as bundled by github.com/victaphu/glass-home-samsung-tv
    'nature-01.jpg': { key: 'moraine-lake', title: 'Moraine Lake', credit: 'Garrett Parker · CC0' },
    'nature-02.jpg': { key: 'spruce-forest', title: 'Spruce forest', credit: 'W.carter · CC0' },
    'nature-03.jpg': { key: 'twelve-apostles', title: 'Twelve Apostles', credit: 'Bernard Spragg · CC0' },
    'nature-04.jpg': { key: 'lofoten', title: 'Lofoten aurora', credit: 'Johannes Groll · CC0' },
    'nature-05.jpg': { key: 'palouse', title: 'Palouse hills', credit: 'Caleb Riston · CC0' },
    'nature-06.jpg': { key: 'cradle-mountain', title: 'Cradle Mountain', credit: 'Dhx1 · CC0' },
    'nature-07.jpg': { key: 'western-alps', title: 'Western Alps', credit: 'Dktue · CC0' },
    'nature-08.jpg': { key: 'hakkoda', title: 'Hakkoda autumn', credit: 'lumoplank · CC0' },
    'nature-09.jpg': { key: 'black-forest', title: 'Black Forest falls', credit: 'Leonhard Lenz · CC0' },
    'nature-10.jpg': { key: 'atacama', title: 'Valle de la Luna', credit: 'Hailey Kean · CC0' },
    'nature-11.jpg': { key: 'matterhorn', title: 'Matterhorn', credit: 'Sam Ferrara · CC0' },
    'nature-12.jpg': { key: 'blue-mountains', title: 'Blue Mountains', credit: 'Matthew Kane · CC0' }
};

// Darker at the top-left (clock) and towards the bottom (tiles and labels).
const SCRIM = [
    'radial-gradient(1300px 700px at 0% 0%, rgba(0,0,0,0.55), rgba(0,0,0,0) 70%)',
    'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.30) 30%, rgba(0,0,0,0.62) 62%, rgba(0,0,0,0.82) 100%)'
].join(',');

function credit(file) {
    const m = basename(file).match(/^(.*)-[A-Za-z0-9_-]{11}-unsplash\.jpe?g$/);
    if (!m) return '';
    return m[1].split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') + ' on Unsplash';
}

if (!statSync(sourceDir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error('Usage: node scripts/prepare-wallpapers.mjs <folder with photos>');
    process.exit(1);
}
const thumbDir = join(outDir, 'thumbs');
mkdirSync(thumbDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'wallpapers-'));

// 320x180 thumbnails for the Settings picker
function thumb(jpg, key) {
    execFileSync('sips', ['-Z', '320', '-s', 'formatOptions', '78', jpg, '--out', join(thumbDir, key + '.jpg')], { stdio: 'ignore' });
    return 'img/wallpapers/thumbs/' + key + '.jpg';
}

// The plain "Midnight" gradient (img/bg.jpg) is what "Off" shows, so it is not in the catalog.
// Photos from earlier runs stay; a photo processed again replaces its old entry.
const catalogFile = join(root, 'src/js/wallpapers.js');
const previous = statSync(catalogFile, { throwIfNoEntry: false })
    ? JSON.parse(readFileSync(catalogFile, 'utf8').replace(/^[\s\S]*?=\s*/, '').replace(/;\s*$/, ''))
    : [];
const catalog = [];

for (const file of readdirSync(sourceDir).sort()) {
    if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
    const info = KNOWN[file] || { key: basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) };
    const title = info.title || info.key;
    const html = join(tmp, info.key + '.html');
    const png = join(tmp, info.key + '.png');
    const src = 'file://' + join(sourceDir, file).split('/').map(encodeURIComponent).join('/');
    writeFileSync(html, `<!DOCTYPE html><body style="margin:0;width:1920px;height:1080px;background:${SCRIM},` +
        `url('${src}') ${info.position || 'center'} / cover no-repeat #000"></body>`);
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1920,1080',
        '--allow-file-access-from-files', '--virtual-time-budget=5000', `--user-data-dir=${join(tmp, 'profile')}`,
        `--screenshot=${png}`, 'file://' + html], { stdio: 'ignore' });
    const out = join(outDir, info.key + '.jpg');
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', png, '--out', out], { stdio: 'ignore' });
    const by = info.credit || credit(file);
    catalog.push({ key: info.key, title, file: 'img/wallpapers/' + info.key + '.jpg', thumb: thumb(out, info.key), credit: by });
    console.log(`${info.key}.jpg  ${(statSync(out).size / 1024).toFixed(0)} KB  ${by}`);
}
rmSync(tmp, { recursive: true, force: true });

const fresh = new Set(catalog.map((w) => w.key));
const merged = previous.filter((w) => !fresh.has(w.key)).concat(catalog);
writeFileSync(catalogFile,
    '/* Generated by scripts/prepare-wallpapers.mjs. Photos: Unsplash License or CC0, see each credit. */\n' +
    'window.WALLPAPERS = ' + JSON.stringify(merged, null, 4) + ';\n');
console.log(`Wrote ${merged.length} entries (${catalog.length} new or updated) to src/js/wallpapers.js`);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

// Clean previous dist output
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Copy static files and directories required for Vercel & GitHub Pages hosting
const entriesToCopy = [
    'index.html',
    '.nojekyll',
    'craft_editor_pressed.png',
    'craft_editor_pressed_grid.svg',
    'assets',
    'js'
];

for (const entry of entriesToCopy) {
    const srcPath = path.join(rootDir, entry);
    const destPath = path.join(distDir, entry);
    if (!fs.existsSync(srcPath)) {
        throw new Error(`Missing required build entry: ${entry}`);
    }
    fs.cpSync(srcPath, destPath, { recursive: true });
}

console.log('Static site built successfully into ./dist');

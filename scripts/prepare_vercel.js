import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const rootDir = process.cwd();
const outDir = path.resolve(rootDir, '_site');
const require = createRequire(import.meta.url);
const DEFAULT_SITE_ORIGIN = 'https://workbench.bond';

const SKIP_DIRS = new Set([
	'node_modules',
	'.git',
	'.github',
	'.aistudio',
	'.vscode'
]);

const SKIP_FILES = new Set([
	'.DS_Store',
	'Thumbs.db',
	'.env',
	'.env.local',
	'.env.example',
	'.gitignore',
	'.gitattributes',
	'.npmrc',
	'vercel.json',
	'bun.lock',
	'package-lock.json',
	'tsconfig.json',
	'README.md',
	'index.dev.html',
	'prompt_full.bin'
]);

function shouldSkipFile(name) {
	if (SKIP_FILES.has(name)) return true;
	if (name.endsWith('.map')) return true;
	if (name.endsWith('_dump.bin')) return true;
	return false;
}

function copyRecursive(src, dest) {
	if (!fs.existsSync(src)) return;
	const stat = fs.statSync(src);
	if (stat.isDirectory()) {
		fs.mkdirSync(dest, { recursive: true });
		for (const item of fs.readdirSync(src)) {
			const srcPath = path.join(src, item);
			const destPath = path.join(dest, item);
			const itemStat = fs.statSync(srcPath);
			if (itemStat.isDirectory()) {
				if (SKIP_DIRS.has(item)) continue;
				copyRecursive(srcPath, destPath);
			} else {
				if (shouldSkipFile(item)) continue;
				fs.copyFileSync(srcPath, destPath);
			}
		}
	} else {
		if (shouldSkipFile(path.basename(src))) return;
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.copyFileSync(src, dest);
	}
}

function resolveSiteOrigin() {
	const raw =
		process.env.SITE_URL ||
		process.env.NEXT_PUBLIC_SITE_URL ||
		process.env.VITE_SITE_URL ||
		'';
	if (!raw) return DEFAULT_SITE_ORIGIN;
	const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
	return normalized.replace(/\/+$/, '');
}

function stampSeoUrls(siteOrigin) {
	const todayIso = new Date().toISOString().slice(0, 10);
	const targetOrigin = siteOrigin || DEFAULT_SITE_ORIGIN;

	// 1. Stamp configured origin into _site/index.html when overridden
	if (targetOrigin !== DEFAULT_SITE_ORIGIN) {
		const indexPath = path.join(outDir, 'index.html');
		if (fs.existsSync(indexPath)) {
			let html = fs.readFileSync(indexPath, 'utf8');
			html = html.split(DEFAULT_SITE_ORIGIN).join(targetOrigin);
			fs.writeFileSync(indexPath, html, 'utf8');
		}
	}

	// 2. Stamp deployment origin and build date into sitemap.xml, robots.txt, llms.txt, llms-full.txt
	for (const relFile of ['sitemap.xml', 'robots.txt', 'llms.txt', 'llms-full.txt']) {
		const filePath = path.join(outDir, relFile);
		if (!fs.existsSync(filePath)) continue;
		let content = fs.readFileSync(filePath, 'utf8');
		if (targetOrigin !== DEFAULT_SITE_ORIGIN) {
			content = content.split(DEFAULT_SITE_ORIGIN).join(targetOrigin);
		}
		if (relFile === 'sitemap.xml') {
			content = content.replace(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g, `<lastmod>${todayIso}</lastmod>`);
		}
		fs.writeFileSync(filePath, content, 'utf8');
	}

	console.log(`[vercel] Stamped SEO URLs for origin: ${targetOrigin} (lastmod: ${todayIso})`);
}

function canResolveFrom(dir, pkgName) {
	try {
		const localRequire = createRequire(path.join(dir, 'package.json'));
		localRequire.resolve(pkgName);
		return true;
	} catch {
		return false;
	}
}

function buildViteSubtool({ name, requiredPackages = [], extraHtmlRoutes = [] }) {
	const toolDir = path.resolve(rootDir, 'workbench_tools', name);
	const prebuiltDistIndex = path.join(toolDir, 'dist', 'index.html');
	const targetDistDir = path.join(outDir, 'workbench_tools', name, 'dist');

	if (fs.existsSync(prebuiltDistIndex)) {
		console.log(`[vercel] Using prebuilt dist for workbench_tools/${name}`);
		copyRecursive(path.join(toolDir, 'dist'), targetDistDir);
		return true;
	}

	if (!fs.existsSync(path.join(toolDir, 'index.html'))) {
		console.warn(`[vercel] Skipping workbench_tools/${name}: index.html not found`);
		return false;
	}

	const missingDeps = requiredPackages.filter((pkg) => !canResolveFrom(toolDir, pkg));
	if (missingDeps.length > 0) {
		console.log(
			`[vercel] Installing subtool dependencies for workbench_tools/${name} (missing: ${missingDeps.join(', ')})...`
		);
		const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
		execFileSync(
			npmCmd,
			['install', '--no-save', '--legacy-peer-deps', '--no-audit', '--no-fund', '--no-package-lock', ...missingDeps],
			{
				cwd: toolDir,
				stdio: 'inherit',
				env: {
					...process.env,
					ELECTRON_SKIP_BINARY_DOWNLOAD: '1'
				}
			}
		);
	}

	let viteBin;
	try {
		const vitePkgDir = path.dirname(require.resolve('vite/package.json'));
		viteBin = path.join(vitePkgDir, 'bin', 'vite.js');
	} catch {
		viteBin = path.resolve(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
	}

	console.log(`[vercel] Building workbench_tools/${name} -> ${path.relative(rootDir, targetDistDir)}`);
	execFileSync(
		process.execPath,
		[viteBin, 'build', '--base=./', '--outDir', targetDistDir, '--emptyOutDir'],
		{
			cwd: toolDir,
			stdio: 'inherit',
			env: {
				...process.env,
				VITE_BASE_URL: './',
				BASE_URL: './',
				DISABLE_HMR: 'true'
			}
		}
	);

	const builtIndex = path.join(targetDistDir, 'index.html');
	if (fs.existsSync(builtIndex)) {
		for (const route of extraHtmlRoutes) {
			const routeDir = path.join(targetDistDir, route);
			fs.mkdirSync(routeDir, { recursive: true });
			fs.copyFileSync(builtIndex, path.join(routeDir, 'index.html'));
		}
	}

	return fs.existsSync(builtIndex);
}

// 1. Recreate clean _site output directory
if (fs.existsSync(outDir)) {
	fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// 2. Copy static runtime folders
const foldersToCopy = [
	'dist',
	'css',
	'assets',
	'workbench_assets',
	'icons',
	'lang',
	'content',
	'font',
	'lib',
	'themes',
	'keymaps',
	'workbench_tools'
];

for (const folder of foldersToCopy) {
	copyRecursive(path.resolve(rootDir, folder), path.join(outDir, folder));
}

// 3. Copy root static & SEO files
const filesToCopy = [
	'index.html',
	'404.html',
	'robots.txt',
	'sitemap.xml',
	'llms.txt',
	'llms-full.txt',
	'favicon.png',
	'icon.png',
	'icon_full.png',
	'icon_maskable.png',
	'manifest.webmanifest',
	'manifest-beta.webmanifest'
];

for (const file of filesToCopy) {
	const srcFile = path.resolve(rootDir, file);
	if (fs.existsSync(srcFile)) {
		copyRecursive(srcFile, path.join(outDir, file));
	}
}

// 4. Stamp live deployment origin into HTML OG/canonical/JSON-LD, sitemap.xml, robots.txt, llms*.txt
stampSeoUrls(resolveSiteOrigin());

// 5. Expose luanti-skin-studio public/skintexture at ./skintexture for relative fetches
const skinTexturesSrc = path.resolve(rootDir, 'workbench_tools/luanti-skin-studio/public/skintexture');
const skinTexturesDest = path.join(outDir, 'workbench_tools/luanti-skin-studio/skintexture');
if (fs.existsSync(skinTexturesSrc) && !fs.existsSync(skinTexturesDest)) {
	copyRecursive(skinTexturesSrc, skinTexturesDest);
}

// 6. Build Vite subtools whose iframe URLs point to dist/index.html
const viteSubtools = [
	{ name: 'brush_metadata_editor' },
	{ name: 'microcontroller-emulator' },
	{
		name: 'metadata',
		requiredPackages: ['react-router-dom', 'lz-string']
	}
];

for (const subtool of viteSubtools) {
	buildViteSubtool(subtool);
}

// 7. Verify required entry & SEO files exist in _site
const requiredOutputs = [
	'index.html',
	'404.html',
	'robots.txt',
	'sitemap.xml',
	'llms.txt',
	'llms-full.txt',
	'dist/bundle.js',
	'manifest.webmanifest',
	'workbench_assets/workbench.png',
	'workbench_tools/3d-to-worldedit/index.html',
	'workbench_tools/luanti-skin-studio/index.html',
	'workbench_tools/pixel-art-generator/index.html',
	'workbench_tools/mtc-seed-viewer/index.html',
	'workbench_tools/brush_metadata_editor/dist/index.html',
	'workbench_tools/metadata/dist/index.html',
	'workbench_tools/microcontroller-emulator/dist/index.html',
	'workbench_tools/nametag/index.html',
	'workbench_tools/nametag/data/blocks.json'
];

const missingRequired = requiredOutputs.filter((rel) => !fs.existsSync(path.join(outDir, rel)));
if (missingRequired.length > 0) {
	console.error('[vercel] Missing required build outputs:', missingRequired.join(', '));
	process.exit(1);
}

console.log('[vercel] Successfully prepared Vercel static output in _site');

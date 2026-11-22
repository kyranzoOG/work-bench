import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const rootDir = process.cwd();
const outDir = path.resolve(rootDir, '_site');
const require = createRequire(import.meta.url);

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
	'bun.lock',
	'package-lock.json',
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
	const toolEntryHtml = path.join(toolDir, 'index.html');
	const localDistDir = path.join(toolDir, 'dist');
	const targetDistDir = path.join(outDir, 'workbench_tools', name, 'dist');

	if (!fs.existsSync(toolEntryHtml)) {
		const prebuiltDistIndex = path.join(localDistDir, 'index.html');
		if (fs.existsSync(prebuiltDistIndex)) {
			console.log(`[deploy] Using prebuilt dist for workbench_tools/${name}`);
			copyRecursive(localDistDir, targetDistDir);
			return true;
		}
		console.warn(`[deploy] Skipping workbench_tools/${name}: index.html not found`);
		return false;
	}

	const packagesToCheck = [
		'vite',
		'@vitejs/plugin-react',
		'@tailwindcss/vite',
		'tailwindcss',
		'react',
		'react-dom',
		'lucide-react',
		...requiredPackages
	];
	const missingDeps = packagesToCheck.filter((pkg) => !canResolveFrom(toolDir, pkg));
	if (missingDeps.length > 0) {
		console.log(
			`[deploy] Installing subtool dependencies for workbench_tools/${name} (missing: ${missingDeps.join(', ')})...`
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

	console.log(`[deploy] Building workbench_tools/${name} -> ${path.relative(rootDir, targetDistDir)}`);
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

		// Mirror gitignored dist locally so dev server routes also resolve cleanly
		if (fs.existsSync(localDistDir)) {
			fs.rmSync(localDistDir, { recursive: true, force: true });
		}
		copyRecursive(targetDistDir, localDistDir);
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

// 4. Expose luanti-skin-studio public/skintexture at ./skintexture for relative fetches
const skinTexturesSrc = path.resolve(rootDir, 'workbench_tools/luanti-skin-studio/public/skintexture');
const skinTexturesDest = path.join(outDir, 'workbench_tools/luanti-skin-studio/skintexture');
if (fs.existsSync(skinTexturesSrc) && !fs.existsSync(skinTexturesDest)) {
	copyRecursive(skinTexturesSrc, skinTexturesDest);
}

// 5. Build Vite subtools whose iframe URLs point to dist/index.html
const viteSubtools = [
	{ name: 'brush_metadata_editor' },
	{ name: 'microcontroller-emulator' },
	{
		name: 'metadata',
		requiredPackages: ['react-router-dom', 'lz-string'],
		extraHtmlRoutes: ['editor', 'credits']
	}
];

for (const subtool of viteSubtools) {
	buildViteSubtool(subtool);
}

// 6. Bypass Jekyll processing on GitHub Pages
fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

// 7. Verify all required outputs & subtool entrypoints exist in _site
const requiredOutputs = [
	'index.html',
	'404.html',
	'dist/bundle.js',
	'workbench_tools/3d-to-worldedit/index.html',
	'workbench_tools/luanti-skin-studio/index.html',
	'workbench_tools/pixel-art-generator/index.html',
	'workbench_tools/mtc-seed-viewer/index.html',
	'workbench_tools/brush_metadata_editor/dist/index.html',
	'workbench_tools/metadata/dist/index.html',
	'workbench_tools/microcontroller-emulator/dist/index.html',
	'workbench_tools/nametag/index.html'
];

const missingRequired = requiredOutputs.filter((rel) => !fs.existsSync(path.join(outDir, rel)));
if (missingRequired.length > 0) {
	console.error('[deploy] Missing required build outputs:', missingRequired.join(', '));
	process.exit(1);
}

console.log('Successfully prepared static deployment directory: _site');

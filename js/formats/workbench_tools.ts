import { ModelFormat } from "../io/format";
import { selectNoProject, updateTabBarVisibility } from "../io/project";
import { setProjectTitle } from "../interface/interface";

export interface WorkbenchToolDefinition {
	id: string;
	format_id: string;
	name: string;
	icon: string;
	url: string;
	description: string;
	target: string[];
	details: string;
}

export const WORKBENCH_TOOLS: WorkbenchToolDefinition[] = [
	{
		id: '3d-to-worldedit',
		format_id: 'tool_3d_to_worldedit',
		name: '3D to WorldEdit',
		icon: 'swap_horiz',
		url: 'workbench_tools/3d-to-worldedit/index.html',
		description: 'Convert 3D models (.obj, .stl), Minecraft schematics (.schem, .nbt), and Minetest WorldEdit (.we) directly to MultiCraft WorldEdit commands.',
		target: ['MultiCraft', 'WorldEdit'],
		details: 'Convert schematic, NBT, Minetest .we, OBJ, and STL 3D models into optimized MultiCraft WorldEdit commands with custom block mapping and preview.'
	},
	{
		id: 'luanti-skin-studio',
		format_id: 'tool_luanti_skin_studio',
		name: 'Luanti Skin Studio',
		icon: 'brush',
		url: 'workbench_tools/luanti-skin-studio/index.html',
		description: 'Design, customize, and export HD 128x64 skins for MultiCraft and Luanti with real-time 3D preview, color palettes, and layer composition.',
		target: ['MultiCraft', 'Luanti'],
		details: 'Design and customize 128x64 character skins for MultiCraft and Luanti with real-time 3D rotation, multiple clothing layers, and palette tools.'
	},
	{
		id: 'pixel-art-generator',
		format_id: 'tool_pixel_art_generator',
		name: 'Pixel Art Generator',
		icon: 'grid_on',
		url: 'workbench_tools/pixel-art-generator/index.html',
		description: 'Generate high-precision WorldEdit pixel art commands for MultiCraft & Minetest from images, text, and manual drawing.',
		target: ['MultiCraft', 'Minetest'],
		details: 'Convert images and text into high-precision block pixel art commands for MultiCraft and Minetest with dithering and palette selection.'
	},
	{
		id: 'mtc-seed-viewer',
		format_id: 'tool_multicraft_seed_viewer',
		name: 'Multicraft Seed Viewer',
		icon: 'explore',
		url: 'workbench_tools/mtc-seed-viewer/index.html',
		description: 'Explore and visualize MultiCraft mapgen seeds, biomes, and terrain heights with interactive 2D controls and coordinates.',
		target: ['MultiCraft Mapgen'],
		details: 'Explore MultiCraft mapgen v7 worlds with interactive seeds, biomes, terrain height maps, and coordinate navigation.'
	},
	{
		id: 'brush_metadata_editor',
		format_id: 'tool_luanti_brush_studio',
		name: 'Luanti Brush Studio',
		icon: 'format_paint',
		url: 'workbench_tools/brush_metadata_editor/dist/index.html',
		description: 'Minetest and Luanti brush command generator for Terraform and WorldEdit workflows with live isometric voxel preview.',
		target: ['Luanti', 'MultiCraft', 'WorldEdit'],
		details: 'Generate Minetest and Luanti brush commands for Terraform and WorldEdit workflows with live isometric voxel preview and radius controls.'
	},
	{
		id: 'metadata',
		format_id: 'tool_multicraft_metadata_generator',
		name: 'Metadata',
		icon: 'code',
		url: 'workbench_tools/metadata/dist/index.html',
		description: 'A fast, modernized metadata editor for MultiCraft with tool capabilities, enchantments, lore, and command generation.',
		target: ['MultiCraft', 'Minetest'],
		details: 'Build custom item metadata, tool capabilities, descriptions, color formatting, and enchantments with instant command export.'
	},
	{
		id: 'microcontroller-emulator',
		format_id: 'tool_microcontroller_emulator',
		name: 'Microcontroller Emulator',
		icon: 'memory',
		url: 'workbench_tools/microcontroller-emulator/dist/index.html',
		description: 'Advanced Microcontroller and Mesecons Logic Sandbox and Emulator with A-D pins, 256-byte EEPROM, step debugger, and Lua-like scripting.',
		target: ['Mesecons', 'MultiCraft'],
		details: 'Simulate Mesecons microcontrollers with interactive A-D pins, 256-byte EEPROM, step-by-step debugger, and Lua-like script execution.'
	},
	{
		id: 'nametag',
		format_id: 'tool_name_tag',
		name: 'Name Tag',
		icon: 'local_offer',
		url: 'workbench_tools/nametag/index.html?v=3',
		description: 'Comprehensive item, block, tool, food and mob catalog and inspector for MultiCraft & Minetest game assets.',
		target: ['MultiCraft', 'Minetest'],
		details: 'Browse, search, and inspect item, block, tool, food, and mob technical IDs and metadata across the full asset catalog.'
	}
];

export class ToolTab {
	id: string;
	uuid: string;
	name: string;
	icon: string;
	url: string;
	is_tool_tab: boolean;
	saved: boolean;
	selected: boolean;
	format: any;

	constructor(def: WorkbenchToolDefinition) {
		this.id = def.id;
		this.uuid = 'tool_tab_' + def.id;
		this.name = def.name;
		this.icon = def.icon;
		this.url = def.url;
		this.is_tool_tab = true;
		this.saved = true;
		this.selected = false;
		this.format = Formats[def.format_id] || { icon: def.icon, name: def.name };
	}

	getDisplayName(include_extension?: boolean) {
		return this.name;
	}

	getFileExtension() {
		return '';
	}

	select(): boolean {
		if (Project) {
			Project.unselect();
		}
		selectNoProject();
		Blockbench.Project = 0;

		// Unselect all other tabs
		if (Interface.tab_bar?.$data) {
			Interface.tab_bar.$data.new_tab.selected = false;
			if (Interface.tab_bar.$data.tool_tabs) {
				for (let tab of Interface.tab_bar.$data.tool_tabs) {
					tab.selected = (tab === this);
				}
			}
		}

		this.selected = true;

		// Hide start screen and 3D work screen
		const start_screen = document.getElementById('start_screen');
		if (start_screen) start_screen.style.display = 'none';
		if (Interface.work_screen) Interface.work_screen.style.display = 'none';

		// Display tool screen and activate this tool's iframe
		const tool_screen = document.getElementById('tool_screen');
		if (tool_screen) {
			tool_screen.style.display = 'block';

			let targetIframe = tool_screen.querySelector(`iframe[data-tool-id="${this.id}"]`) as HTMLIFrameElement;
			if (!targetIframe) {
				targetIframe = document.createElement('iframe');
				targetIframe.dataset.toolId = this.id;
				targetIframe.src = this.url;
				targetIframe.style.width = '100%';
				targetIframe.style.height = '100%';
				targetIframe.style.border = 'none';
				tool_screen.appendChild(targetIframe);
			}

			const iframes = tool_screen.querySelectorAll('iframe');
			iframes.forEach((iframe: HTMLIFrameElement) => {
				iframe.style.display = (iframe.dataset.toolId === this.id) ? 'block' : 'none';
			});
		}

		setProjectTitle(this.name);
		MenuBar.mode_switcher_button?.classList.add('hidden');
		updateInterface();
		return true;
	}

	close() {
		const tool_screen = document.getElementById('tool_screen');
		if (tool_screen) {
			const iframe = tool_screen.querySelector(`iframe[data-tool-id="${this.id}"]`);
			if (iframe) iframe.remove();
		}

		if (Interface.tab_bar?.$data?.tool_tabs) {
			let list: any[] = Interface.tab_bar.$data.tool_tabs;
			let index = list.indexOf(this);
			if (index >= 0) {
				list.splice(index, 1);
			}

			if (this.selected) {
				if (list.length > 0) {
					let nextTab = list[Math.max(0, index - 1)];
					nextTab.select();
				} else if (ModelProject.all.length > 0) {
					let project = ModelProject.all.find(p => p.uuid == Interface.tab_bar.$data.last_opened_project) || ModelProject.all.last();
					if (project) {
						project.select();
					} else {
						Interface.tab_bar.openNewTab();
					}
				} else {
					Interface.tab_bar.openNewTab();
				}
			}
		}

		updateTabBarVisibility();
	}

	openSettings() {}
	showContextMenu(event: Event) {}
}

const SUPABASE_URL = 'https://hsrdjjpkujhfohxmdxxv.supabase.co';
const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzcmRqanBrdWpoZm9oeG1keHh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2ODc5NjAsImV4cCI6MjEwNzI2Mzk2MH0.NneZxubQ726-iNNvvcymjL5ahV63GKMsGtpYlQEzS_0';

const LOCAL_STORAGE_KEY = 'wb_portal_active_session_v2';
const LEGACY_SESSION_KEY = 'wb_portal_active_session_v1';
const STAFF_STORAGE_KEY = 'wb_portal_staff_session_v1';
const SESSION_COOKIE_NAME = 'wb_portal_token_session';
const INTEGRITY_SALT = 'wb_pistachio_gate_bef264_v2';
const HEARTBEAT_INTERVAL_MS = 15_000;
const STAFF_HEARTBEAT_INTERVAL_MS = 60_000;
const COUNTDOWN_TICK_MS = 500;
const POPUP_DISPLAY_MS = 5_000;

const TOKEN_SELECT_COLUMNS =
	'id,token_code,expires_at,created_at,is_used,is_revoked,max_uses,times_used';

const GATED_TOOL_IDS = new Set(['3d-to-worldedit', 'pixel-art-generator']);
const GATED_FORMAT_IDS = new Set(['tool_3d_to_worldedit', 'tool_pixel_art_generator']);

type StaffRole = 'admin' | 'moderator';
type AccessPortalView = 'choose' | 'token' | 'login';

interface AccessTokenRecord {
	id: string;
	token_code: string;
	expires_at: string;
	created_at: string;
	is_used: boolean;
	is_revoked: boolean;
	max_uses: number | null;
	times_used: number | null;
}

interface ActiveSessionState {
	tokenId: string;
	tokenCode: string;
	expiresAtIso: string;
	expiresAtMs: number;
	grantedDurationLabel: string;
	nonce: string;
}

interface StoredSession extends ActiveSessionState {
	token_code: string;
	expires_at: string;
	sig: string;
}

interface ActiveStaffSession {
	userId: string;
	email: string;
	role: StaffRole;
	accessToken: string;
	refreshToken: string;
	expiresAtMs: number;
	nonce: string;
}

interface StoredStaffSession extends ActiveStaffSession {
	sig: string;
}

interface SupabaseAuthUser {
	id: string;
	email?: string;
	role?: string;
	app_metadata?: Record<string, any>;
	user_metadata?: Record<string, any>;
}

interface SupabaseAuthTokenResponse {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	expires_at?: number;
	user?: SupabaseAuthUser;
	error?: string;
	error_description?: string;
	msg?: string;
	message?: string;
}

interface MilestoneThreshold {
	seconds: number;
	label: string;
}

const TIME_MILESTONES: MilestoneThreshold[] = [
	{ seconds: 12 * 3600, label: '12 hours left' },
	{ seconds: 6 * 3600, label: '6 hours left' },
	{ seconds: 3 * 3600, label: '3 hours left' },
	{ seconds: 2 * 3600, label: '2 hours left' },
	{ seconds: 60 * 60, label: '1 hour left' },
	{ seconds: 30 * 60, label: '30 mins left' },
	{ seconds: 20 * 60, label: '20 mins left' },
	{ seconds: 10 * 60, label: '10 mins left' },
	{ seconds: 5 * 60, label: '5 mins left' },
	{ seconds: 4 * 60, label: '4 mins left' },
	{ seconds: 3 * 60, label: '3 mins left' },
	{ seconds: 2 * 60, label: '2 mins left' },
	{ seconds: 1 * 60, label: '1 min left' }
];

let memorySessionFallback: string | null = null;
let memoryStaffSessionFallback: string | null = null;
let activeSession: ActiveSessionState | null = null;
let activeStaffSession: ActiveStaffSession | null = null;
let portalView: AccessPortalView = 'choose';
let isBootstrappingAccess = true;
let isSubmittingAuth = false;
let portalErrorMessage: string | null = null;
let portalOverlayEl: HTMLDivElement | null = null;
let toastEl: HTMLDivElement | null = null;
let toastHideTimer: number | null = null;
let toastCleanupTimer: number | null = null;
let countdownTimerId: number | null = null;
let heartbeatTimerId: number | null = null;
let staffTickTimerId: number | null = null;
let staffHeartbeatTimerId: number | null = null;
let prevRemainingSec: number | null = null;
let firedMilestones = new Set<number>();

let clockAnchor = {
	serverNowMs: Date.now(),
	perfNowMs: typeof performance !== 'undefined' ? performance.now() : 0
};

function syncClockAnchor(serverNowMs: number): void {
	clockAnchor = {
		serverNowMs,
		perfNowMs: typeof performance !== 'undefined' ? performance.now() : 0
	};
}

function getAuthoritativeNowMs(): number {
	const perfNow = typeof performance !== 'undefined' ? performance.now() : 0;
	const elapsed = Math.max(0, perfNow - clockAnchor.perfNowMs);
	return clockAnchor.serverNowMs + elapsed;
}

function fnv1aHex(input: string, seed: number): string {
	let hash = seed >>> 0;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}

function signSessionPayload(payload: ActiveSessionState): string {
	const canonical = [
		payload.tokenId,
		payload.tokenCode,
		payload.expiresAtIso,
		String(payload.expiresAtMs),
		payload.grantedDurationLabel,
		payload.nonce,
		INTEGRITY_SALT
	].join('|');

	const h1 = fnv1aHex(canonical, 0x811c9dc5);
	const h2 = fnv1aHex(`${INTEGRITY_SALT}:${canonical}`, 0x9e3779b9);
	const h3 = fnv1aHex(`${canonical.length}:${canonical}`, 0x85ebca6b);
	return `${h1}${h2}${h3}`;
}

function signStaffSessionPayload(payload: ActiveStaffSession): string {
	const canonical = [
		'staff',
		payload.userId,
		payload.email,
		payload.role,
		payload.accessToken,
		payload.refreshToken,
		String(payload.expiresAtMs),
		payload.nonce,
		INTEGRITY_SALT
	].join('|');

	const h1 = fnv1aHex(canonical, 0x811c9dc5);
	const h2 = fnv1aHex(`${INTEGRITY_SALT}:${canonical}`, 0x9e3779b9);
	const h3 = fnv1aHex(`${canonical.length}:${canonical}`, 0x85ebca6b);
	return `${h1}${h2}${h3}`;
}

function writeSessionCookie(tokenCode: string, expiresAtIso: string, expiresAtMs: number): void {
	try {
		const cookiePayload = encodeURIComponent(
			JSON.stringify({ token_code: tokenCode, expires_at: expiresAtIso })
		);
		const expiresUtc = new Date(expiresAtMs).toUTCString();
		document.cookie = `${SESSION_COOKIE_NAME}=${cookiePayload}; expires=${expiresUtc}; path=/; SameSite=Lax`;
	} catch {
		// Ignore cookie restrictions
	}
}

function clearSessionCookie(): void {
	try {
		document.cookie = `${SESSION_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
	} catch {
		// Ignore cookie restrictions
	}
}

function persistSignedSession(state: ActiveSessionState): void {
	const record: StoredSession = {
		...state,
		token_code: state.tokenCode,
		expires_at: state.expiresAtIso,
		sig: signSessionPayload(state)
	};
	const serialized = JSON.stringify(record);
	memorySessionFallback = serialized;
	try {
		localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
	} catch {
		// Fallback to memorySessionFallback if storage quota/privacy blocks write
	}
	writeSessionCookie(state.tokenCode, state.expiresAtIso, state.expiresAtMs);
}

function readVerifiedSessionFromStorage(): ActiveSessionState | null {
	try {
		let raw: string | null = null;
		try {
			raw = localStorage.getItem(LOCAL_STORAGE_KEY);
		} catch {
			raw = memorySessionFallback;
		}
		if (!raw) return null;

		const parsed = JSON.parse(raw) as Partial<StoredSession>;
		const resolvedTokenCode =
			typeof parsed.tokenCode === 'string'
				? parsed.tokenCode
				: typeof parsed.token_code === 'string'
				? parsed.token_code
				: null;
		const resolvedExpiresIso =
			typeof parsed.expiresAtIso === 'string'
				? parsed.expiresAtIso
				: typeof parsed.expires_at === 'string'
				? parsed.expires_at
				: null;

		if (
			typeof parsed.tokenId !== 'string' ||
			!resolvedTokenCode ||
			!resolvedExpiresIso ||
			typeof parsed.expiresAtMs !== 'number' ||
			!Number.isFinite(parsed.expiresAtMs) ||
			typeof parsed.grantedDurationLabel !== 'string' ||
			typeof parsed.nonce !== 'string' ||
			typeof parsed.sig !== 'string'
		) {
			return null;
		}

		const candidate: ActiveSessionState = {
			tokenId: parsed.tokenId,
			tokenCode: resolvedTokenCode,
			expiresAtIso: resolvedExpiresIso,
			expiresAtMs: parsed.expiresAtMs,
			grantedDurationLabel: parsed.grantedDurationLabel,
			nonce: parsed.nonce
		};

		if (parsed.sig !== signSessionPayload(candidate)) {
			return null;
		}

		const isoMs = Date.parse(candidate.expiresAtIso);
		if (Number.isNaN(isoMs) || Math.abs(isoMs - candidate.expiresAtMs) > 1000) {
			return null;
		}

		return candidate;
	} catch {
		return null;
	}
}

function clearStoredSession(): void {
	memorySessionFallback = null;
	try {
		localStorage.removeItem(LOCAL_STORAGE_KEY);
	} catch {
		// Ignore storage access errors
	}
	try {
		sessionStorage.removeItem(LEGACY_SESSION_KEY);
	} catch {
		// Ignore storage access errors
	}
	clearSessionCookie();
}

function persistSignedStaffSession(state: ActiveStaffSession): void {
	const record: StoredStaffSession = {
		...state,
		sig: signStaffSessionPayload(state)
	};
	const serialized = JSON.stringify(record);
	memoryStaffSessionFallback = serialized;
	try {
		localStorage.setItem(STAFF_STORAGE_KEY, serialized);
	} catch {
		// Fallback to memoryStaffSessionFallback
	}
}

function readVerifiedStaffSessionFromStorage(): ActiveStaffSession | null {
	try {
		let raw: string | null = null;
		try {
			raw = localStorage.getItem(STAFF_STORAGE_KEY);
		} catch {
			raw = memoryStaffSessionFallback;
		}
		if (!raw) return null;

		const parsed = JSON.parse(raw) as Partial<StoredStaffSession>;
		if (
			typeof parsed.userId !== 'string' ||
			typeof parsed.email !== 'string' ||
			(parsed.role !== 'admin' && parsed.role !== 'moderator') ||
			typeof parsed.accessToken !== 'string' ||
			typeof parsed.refreshToken !== 'string' ||
			typeof parsed.expiresAtMs !== 'number' ||
			!Number.isFinite(parsed.expiresAtMs) ||
			typeof parsed.nonce !== 'string' ||
			typeof parsed.sig !== 'string'
		) {
			return null;
		}

		const candidate: ActiveStaffSession = {
			userId: parsed.userId,
			email: parsed.email,
			role: parsed.role,
			accessToken: parsed.accessToken,
			refreshToken: parsed.refreshToken,
			expiresAtMs: parsed.expiresAtMs,
			nonce: parsed.nonce
		};

		if (parsed.sig !== signStaffSessionPayload(candidate)) {
			return null;
		}

		return candidate;
	} catch {
		return null;
	}
}

function clearStoredStaffSession(): void {
	memoryStaffSessionFallback = null;
	try {
		localStorage.removeItem(STAFF_STORAGE_KEY);
	} catch {
		// Ignore storage access errors
	}
}

function generateSessionNonce(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		const bytes = new Uint8Array(12);
		crypto.getRandomValues(bytes);
		return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	}
	return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function calculateInitialTokenDurationMs(token: AccessTokenRecord): number {
	const createdMs = Date.parse(token.created_at);
	const initialExpiresMs = Date.parse(token.expires_at);
	const durationMs = initialExpiresMs - createdMs;

	if (Number.isNaN(durationMs) || !Number.isFinite(durationMs) || durationMs <= 0) {
		return 24 * 3_600_000;
	}

	if (durationMs < 55 * 60_000) {
		const durationMinutes = Math.max(1, Math.round(durationMs / 60_000));
		return durationMinutes * 60_000;
	}

	const durationHours = Math.max(1, Math.round(durationMs / 3_600_000));
	return durationHours * 3_600_000;
}

function formatGrantedDuration(durationMs: number): string {
	if (durationMs < 55_000) {
		const secs = Math.max(1, Math.ceil(durationMs / 1000));
		return `${secs} ${secs === 1 ? 'second' : 'seconds'}`;
	}

	const totalMinutes = Math.max(1, Math.round(durationMs / 60_000));
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (hours > 0 && minutes > 0) {
		return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${
			minutes === 1 ? 'minute' : 'minutes'
		}`;
	}
	if (hours > 0) {
		return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
	}
	return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function formatStaffRoleLabel(role: StaffRole): string {
	return role === 'admin' ? 'Admin' : 'Moderator';
}

function normalizeStaffRole(value: unknown): StaffRole | null {
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (
			normalized === 'admin' ||
			normalized === 'administrator' ||
			normalized === 'super_admin' ||
			normalized === 'superadmin' ||
			normalized === 'owner'
		) {
			return 'admin';
		}
		if (normalized === 'moderator' || normalized === 'mod') {
			return 'moderator';
		}
		return null;
	}
	if (Array.isArray(value)) {
		let foundMod = false;
		for (const item of value) {
			const parsed = normalizeStaffRole(item);
			if (parsed === 'admin') return 'admin';
			if (parsed === 'moderator') foundMod = true;
		}
		return foundMod ? 'moderator' : null;
	}
	return null;
}

function extractStaffRoleFromObject(obj: unknown): StaffRole | null {
	if (!obj || typeof obj !== 'object') return null;
	const rec = obj as Record<string, unknown>;
	const candidates = [
		rec.role,
		rec.user_role,
		rec.account_role,
		rec.staff_role,
		rec.roles
	];
	let foundMod = false;
	for (const candidate of candidates) {
		const parsed = normalizeStaffRole(candidate);
		if (parsed === 'admin') return 'admin';
		if (parsed === 'moderator') foundMod = true;
	}
	if (rec.is_admin === true || rec.admin === true) return 'admin';
	if (rec.is_moderator === true || rec.moderator === true || foundMod) return 'moderator';
	return null;
}

function decodeJwtPayload(token: string): Record<string, any> | null {
	try {
		const parts = token.split('.');
		if (parts.length < 2) return null;
		const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
		const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
		const jsonStr = atob(padded);
		const parsed = JSON.parse(jsonStr);
		return parsed && typeof parsed === 'object' ? parsed : null;
	} catch {
		return null;
	}
}

function extractStaffRoleFromUserAndJwt(
	user: SupabaseAuthUser,
	accessToken?: string
): StaffRole | null {
	const fromAppMeta = extractStaffRoleFromObject(user.app_metadata);
	if (fromAppMeta) return fromAppMeta;

	if (accessToken) {
		const jwtPayload = decodeJwtPayload(accessToken);
		if (jwtPayload) {
			const fromJwtApp = extractStaffRoleFromObject(jwtPayload.app_metadata);
			if (fromJwtApp) return fromJwtApp;

			const jwtDirectCandidates = [
				jwtPayload.user_role,
				jwtPayload.account_role,
				jwtPayload.staff_role,
				jwtPayload.roles,
				jwtPayload.role !== 'authenticated' && jwtPayload.role !== 'anon'
					? jwtPayload.role
					: null
			];
			for (const candidate of jwtDirectCandidates) {
				const parsed = normalizeStaffRole(candidate);
				if (parsed) return parsed;
			}

			const fromJwtUser = extractStaffRoleFromObject(jwtPayload.user_metadata);
			if (fromJwtUser) return fromJwtUser;
		}
	}

	const fromUserMeta = extractStaffRoleFromObject(user.user_metadata);
	if (fromUserMeta) return fromUserMeta;

	if (user.role && user.role !== 'authenticated' && user.role !== 'anon') {
		const fromUserRole = normalizeStaffRole(user.role);
		if (fromUserRole) return fromUserRole;
	}

	return null;
}

async function resolveStaffRoleWithFallback(
	user: SupabaseAuthUser,
	accessToken: string
): Promise<StaffRole | null> {
	const directRole = extractStaffRoleFromUserAndJwt(user, accessToken);
	if (directRole) return directRole;

	// Fallback: check authenticated PostgREST tables if an SQL script stored roles in a table
	const tableLookups = [
		`${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=5`,
		`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`
	];

	for (const url of tableLookups) {
		try {
			const res = await fetch(url, {
				method: 'GET',
				headers: {
					apikey: SUPABASE_ANON_KEY,
					Authorization: `Bearer ${accessToken}`
				},
				cache: 'no-store'
			});
			if (!res.ok) continue;
			const rows = await res.json();
			if (Array.isArray(rows)) {
				let foundMod = false;
				for (const row of rows) {
					const parsed = extractStaffRoleFromObject(row);
					if (parsed === 'admin') return 'admin';
					if (parsed === 'moderator') foundMod = true;
				}
				if (foundMod) return 'moderator';
			}
		} catch {
			// Table does not exist or is inaccessible; continue
		}
	}

	return null;
}

function supabaseHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		apikey: SUPABASE_ANON_KEY,
		Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
		...(extra || {})
	};
}

async function supabaseSignInWithPassword(
	email: string,
	password: string
): Promise<{ data: SupabaseAuthTokenResponse | null; errorMessage?: string }> {
	try {
		const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
			method: 'POST',
			headers: supabaseHeaders({
				'Content-Type': 'application/json'
			}),
			body: JSON.stringify({ email, password })
		});
		const body = (await res.json().catch(() => ({}))) as SupabaseAuthTokenResponse;
		if (!res.ok || !body.access_token || !body.user) {
			const rawErr = (body.error_description || body.msg || body.message || '').toLowerCase();
			if (rawErr.includes('invalid login') || rawErr.includes('invalid credentials')) {
				return { data: null, errorMessage: 'Invalid email or password.' };
			}
			if (rawErr.includes('email not confirmed')) {
				return { data: null, errorMessage: 'Email address is not confirmed.' };
			}
			return {
				data: null,
				errorMessage:
					body.error_description || body.msg || body.message || 'Sign in failed. Please try again.'
			};
		}
		return { data: body };
	} catch {
		return {
			data: null,
			errorMessage: 'Network error while signing in. Please try again.'
		};
	}
}

async function supabaseRefreshAuthSession(
	refreshToken: string
): Promise<{ data: SupabaseAuthTokenResponse | null; unauthorized: boolean }> {
	try {
		const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
			method: 'POST',
			headers: supabaseHeaders({
				'Content-Type': 'application/json'
			}),
			body: JSON.stringify({ refresh_token: refreshToken })
		});
		if (!res.ok) {
			return { data: null, unauthorized: res.status === 400 || res.status === 401 || res.status === 403 };
		}
		const body = (await res.json().catch(() => ({}))) as SupabaseAuthTokenResponse;
		if (!body.access_token || !body.user) {
			return { data: null, unauthorized: true };
		}
		return { data: body, unauthorized: false };
	} catch {
		return { data: null, unauthorized: false };
	}
}

async function supabaseFetchAuthUser(
	accessToken: string
): Promise<{ user: SupabaseAuthUser | null; unauthorized: boolean; networkError: boolean }> {
	try {
		const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
			method: 'GET',
			headers: {
				apikey: SUPABASE_ANON_KEY,
				Authorization: `Bearer ${accessToken}`
			},
			cache: 'no-store'
		});
		if (res.status === 401 || res.status === 403) {
			return { user: null, unauthorized: true, networkError: false };
		}
		if (!res.ok) {
			return { user: null, unauthorized: false, networkError: true };
		}
		const user = (await res.json()) as SupabaseAuthUser;
		if (!user || typeof user.id !== 'string') {
			return { user: null, unauthorized: true, networkError: false };
		}
		return { user, unauthorized: false, networkError: false };
	} catch {
		return { user: null, unauthorized: false, networkError: true };
	}
}

async function supabaseSignOutRemote(accessToken: string): Promise<void> {
	try {
		await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
			method: 'POST',
			headers: {
				apikey: SUPABASE_ANON_KEY,
				Authorization: `Bearer ${accessToken}`
			}
		});
	} catch {
		// Best-effort remote logout
	}
}

async function fetchAuthoritativeServerTimeMs(): Promise<number> {
	try {
		const response = await fetch(
			`${SUPABASE_URL}/rest/v1/access_tokens?select=id&limit=0`,
			{
				method: 'GET',
				headers: supabaseHeaders(),
				cache: 'no-store'
			}
		);
		const dateHeader = response.headers.get('date');
		if (dateHeader) {
			const parsed = Date.parse(dateHeader);
			if (!Number.isNaN(parsed)) {
				return parsed;
			}
		}
	} catch {
		// Fallback to local clock only if header fetch fails
	}
	return Date.now();
}

async function queryAccessTokenById(
	id: string
): Promise<{ data: AccessTokenRecord | null; error: boolean }> {
	try {
		const url = `${SUPABASE_URL}/rest/v1/access_tokens?select=${encodeURIComponent(
			TOKEN_SELECT_COLUMNS
		)}&id=eq.${encodeURIComponent(id)}&limit=1`;
		const res = await fetch(url, {
			method: 'GET',
			headers: supabaseHeaders(),
			cache: 'no-store'
		});
		if (!res.ok) return { data: null, error: true };
		const rows = (await res.json()) as AccessTokenRecord[];
		return { data: Array.isArray(rows) && rows.length > 0 ? rows[0] : null, error: false };
	} catch {
		return { data: null, error: true };
	}
}

async function queryAccessTokenByCode(
	tokenCode: string
): Promise<{ data: AccessTokenRecord | null; error: boolean }> {
	try {
		const url = `${SUPABASE_URL}/rest/v1/access_tokens?select=${encodeURIComponent(
			TOKEN_SELECT_COLUMNS
		)}&token_code=eq.${encodeURIComponent(tokenCode)}&limit=1`;
		const res = await fetch(url, {
			method: 'GET',
			headers: supabaseHeaders(),
			cache: 'no-store'
		});
		if (!res.ok) return { data: null, error: true };
		const rows = (await res.json()) as AccessTokenRecord[];
		return { data: Array.isArray(rows) && rows.length > 0 ? rows[0] : null, error: false };
	} catch {
		return { data: null, error: true };
	}
}

async function consumeAccessTokenRow(
	tokenRow: AccessTokenRecord,
	nextUses: number,
	targetExpiresAtIso: string
): Promise<{ data: AccessTokenRecord | null; error: boolean }> {
	try {
		const timesUsedFilter =
			tokenRow.times_used === null
				? 'times_used=is.null'
				: `times_used=eq.${encodeURIComponent(String(tokenRow.times_used))}`;
		const url = `${SUPABASE_URL}/rest/v1/access_tokens?id=eq.${encodeURIComponent(
			tokenRow.id
		)}&is_revoked=eq.false&${timesUsedFilter}&select=${encodeURIComponent(
			TOKEN_SELECT_COLUMNS
		)}`;
		const res = await fetch(url, {
			method: 'PATCH',
			headers: supabaseHeaders({
				'Content-Type': 'application/json',
				Prefer: 'return=representation'
			}),
			body: JSON.stringify({
				is_used: true,
				times_used: nextUses,
				expires_at: !tokenRow.is_used ? targetExpiresAtIso : tokenRow.expires_at
			})
		});
		if (!res.ok) return { data: null, error: true };
		const rows = (await res.json()) as AccessTokenRecord[];
		return { data: Array.isArray(rows) && rows.length > 0 ? rows[0] : null, error: false };
	} catch {
		return { data: null, error: true };
	}
}

async function recordActiveSessionLog(tokenId: string): Promise<void> {
	try {
		await fetch(`${SUPABASE_URL}/rest/v1/active_sessions`, {
			method: 'POST',
			headers: supabaseHeaders({
				'Content-Type': 'application/json',
				Prefer: 'return=minimal'
			}),
			body: JSON.stringify({ token_id: tokenId })
		});
	} catch {
		// Ignore optional session log errors
	}
}

function clearToastTimers(): void {
	if (toastHideTimer !== null) {
		window.clearTimeout(toastHideTimer);
		toastHideTimer = null;
	}
	if (toastCleanupTimer !== null) {
		window.clearTimeout(toastCleanupTimer);
		toastCleanupTimer = null;
	}
}

function dismissAccessToast(): void {
	clearToastTimers();
	if (!toastEl) return;
	toastEl.classList.remove('visible');
	const elToRemove = toastEl;
	toastCleanupTimer = window.setTimeout(() => {
		elToRemove.remove();
		if (toastEl === elToRemove) {
			toastEl = null;
		}
	}, 300);
}

function triggerAccessPopup(
	kind: 'granted' | 'milestone' | 'locked',
	message: string,
	highlight?: string
): void {
	clearToastTimers();
	if (toastEl) {
		toastEl.remove();
		toastEl = null;
	}

	const container = document.createElement('div');
	container.className =
		kind === 'locked' ? 'wb_access_toast wb_access_toast_locked' : 'wb_access_toast';
	container.setAttribute('role', 'status');
	container.setAttribute('aria-live', 'polite');

	const inner = document.createElement('div');
	inner.className = 'wb_access_toast_inner';

	const content = document.createElement('div');
	content.className = 'wb_access_toast_content';

	const icon = document.createElement('i');
	icon.className = 'material-icons';
	icon.textContent =
		kind === 'granted' ? 'verified_user' : kind === 'locked' ? 'lock' : 'schedule';

	const text = document.createElement('p');
	text.textContent = message;
	if (highlight) {
		text.appendChild(document.createTextNode(' '));
		const span = document.createElement('span');
		span.className = 'wb_access_toast_highlight';
		span.textContent = highlight;
		text.appendChild(span);
	}

	content.append(icon, text);

	const closeBtn = document.createElement('button');
	closeBtn.type = 'button';
	closeBtn.className = 'wb_access_toast_close';
	closeBtn.setAttribute('aria-label', 'Close notification');
	const closeIcon = document.createElement('i');
	closeIcon.className = 'material-icons';
	closeIcon.textContent = 'close';
	closeBtn.appendChild(closeIcon);
	closeBtn.addEventListener('click', () => dismissAccessToast());

	inner.append(content, closeBtn);
	container.appendChild(inner);
	document.body.appendChild(container);
	toastEl = container;

	requestAnimationFrame(() => {
		container.classList.add('visible');
	});

	toastHideTimer = window.setTimeout(() => {
		dismissAccessToast();
	}, POPUP_DISPLAY_MS);
}

export function isWorkbenchAccessUnlocked(): boolean {
	return activeSession !== null || activeStaffSession !== null;
}

function syncGatedToolVisibility(): void {
	const unlocked = isWorkbenchAccessUnlocked();

	WORKBENCH_TOOLS.forEach(def => {
		if (!GATED_TOOL_IDS.has(def.id)) return;
		const format = Formats[def.format_id];
		if (format) {
			format.show_on_start_screen = unlocked;
			format.show_in_new_list = unlocked;
		}
	});

	if (!unlocked) {
		// Close any open gated tool tabs immediately
		if (Interface.tab_bar?.$data?.tool_tabs) {
			const tabsToClose = Interface.tab_bar.$data.tool_tabs.filter((t: any) =>
				GATED_TOOL_IDS.has(t.id)
			);
			tabsToClose.forEach((tab: ToolTab) => tab.close());
		}

		const toolScreen = document.getElementById('tool_screen');
		if (toolScreen) {
			GATED_TOOL_IDS.forEach(id => {
				const iframe = toolScreen.querySelector(`iframe[data-tool-id="${id}"]`);
				if (iframe) iframe.remove();
			});
		}

		// Clear Start Screen selection if a gated tool was selected/viewed
		const startVue = (window as any).StartScreen?.vue;
		if (startVue?.$data) {
			if (GATED_FORMAT_IDS.has(startVue.$data.selected_format_id)) {
				startVue.$data.selected_format_id = '';
			}
			if (
				startVue.$data.viewed_format &&
				GATED_FORMAT_IDS.has(startVue.$data.viewed_format.id)
			) {
				startVue.$data.viewed_format = null;
			}
		}
	}

	const startVue = (window as any).StartScreen?.vue;
	if (startVue && typeof startVue.$forceUpdate === 'function') {
		startVue.$forceUpdate();
	}

	const accessMenuLabel = (window as any).MenuBar?.menus?.access?.label as
		| HTMLElement
		| undefined;
	if (accessMenuLabel) {
		accessMenuLabel.classList.toggle('wb_access_active', unlocked);
	}
}

function updatePortalRemainingTimeDisplay(): void {
	if (!portalOverlayEl || !activeSession) return;
	const el = portalOverlayEl.querySelector('#wb_access_remaining_value');
	if (!el) return;
	const leftMs = Math.max(0, activeSession.expiresAtMs - getAuthoritativeNowMs());
	el.textContent = formatGrantedDuration(leftMs);
}

function stopSessionMonitors(): void {
	if (countdownTimerId !== null) {
		window.clearInterval(countdownTimerId);
		countdownTimerId = null;
	}
	if (heartbeatTimerId !== null) {
		window.clearInterval(heartbeatTimerId);
		heartbeatTimerId = null;
	}
	window.removeEventListener('focus', handleVisibilityOrFocusHeartbeat);
	document.removeEventListener('visibilitychange', handleVisibilityOrFocusHeartbeat);
}

function stopStaffMonitors(): void {
	if (staffTickTimerId !== null) {
		window.clearInterval(staffTickTimerId);
		staffTickTimerId = null;
	}
	if (staffHeartbeatTimerId !== null) {
		window.clearInterval(staffHeartbeatTimerId);
		staffHeartbeatTimerId = null;
	}
	window.removeEventListener('focus', handleStaffVisibilityOrFocusHeartbeat);
	document.removeEventListener('visibilitychange', handleStaffVisibilityOrFocusHeartbeat);
}

function signOutStaffAccess(reason?: string, showToast: boolean = false): void {
	const previousSession = activeStaffSession;
	const wasUnlocked = previousSession !== null;
	clearStoredStaffSession();
	stopStaffMonitors();
	activeStaffSession = null;

	if (previousSession?.accessToken) {
		supabaseSignOutRemote(previousSession.accessToken);
	}

	if (reason) {
		portalErrorMessage = reason;
		portalView = 'login';
	} else {
		portalErrorMessage = null;
		portalView = 'choose';
	}

	syncGatedToolVisibility();

	if (portalOverlayEl) {
		renderWorkbenchAccessPortalContent();
	}

	if (showToast && wasUnlocked) {
		triggerAccessPopup(
			'locked',
			reason || 'Signed out. Restricted tools have been hidden.'
		);
	}
}

function lockWorkbenchAccess(reason?: string, showToast: boolean = false): void {
	if (activeStaffSession) {
		signOutStaffAccess(reason, showToast);
		return;
	}

	const wasUnlocked = activeSession !== null;
	clearStoredSession();
	stopSessionMonitors();
	prevRemainingSec = null;
	firedMilestones.clear();
	activeSession = null;

	if (reason) {
		portalErrorMessage = reason;
		portalView = 'token';
	} else {
		portalErrorMessage = null;
		portalView = 'choose';
	}

	syncGatedToolVisibility();

	if (portalOverlayEl) {
		renderWorkbenchAccessPortalContent();
	}

	if (showToast && wasUnlocked) {
		triggerAccessPopup(
			'locked',
			reason || 'Restricted tools have been hidden.'
		);
	}
}

function verifyActiveSessionTick(): void {
	if (!activeSession) return;

	const currentStored = readVerifiedSessionFromStorage();
	if (
		!currentStored ||
		currentStored.tokenId !== activeSession.tokenId ||
		currentStored.nonce !== activeSession.nonce ||
		currentStored.expiresAtMs !== activeSession.expiresAtMs
	) {
		lockWorkbenchAccess("This token's access session has expired.", true);
		return;
	}

	const leftMs = activeSession.expiresAtMs - getAuthoritativeNowMs();
	if (leftMs <= 0) {
		lockWorkbenchAccess("This token's access session has expired.", true);
		return;
	}

	const currentSec = Math.ceil(leftMs / 1000);
	if (prevRemainingSec !== null && currentSec < prevRemainingSec) {
		const crossed = TIME_MILESTONES.filter(
			m =>
				prevRemainingSec! > m.seconds &&
				currentSec <= m.seconds &&
				!firedMilestones.has(m.seconds)
		);
		if (crossed.length > 0) {
			const mostUrgent = crossed[crossed.length - 1];
			crossed.forEach(m => firedMilestones.add(m.seconds));
			triggerAccessPopup('milestone', 'Access time reminder:', mostUrgent.label);
		}
	}

	prevRemainingSec = currentSec;
	updatePortalRemainingTimeDisplay();
}

function verifyActiveStaffSessionTick(): void {
	if (!activeStaffSession) return;

	const currentStored = readVerifiedStaffSessionFromStorage();
	if (
		!currentStored ||
		currentStored.userId !== activeStaffSession.userId ||
		currentStored.nonce !== activeStaffSession.nonce
	) {
		signOutStaffAccess('Your account session has ended.', true);
	}
}

async function verifyStoredStaffSessionWithServer(
	stored: ActiveStaffSession
): Promise<{ session: ActiveStaffSession | null; reason?: string; networkError?: boolean }> {
	let accessToken = stored.accessToken;
	let refreshToken = stored.refreshToken;
	let expiresAtMs = stored.expiresAtMs;
	let user: SupabaseAuthUser | null = null;

	const needsRefresh = Date.now() >= expiresAtMs - 5 * 60_000;
	if (!needsRefresh) {
		const userLookup = await supabaseFetchAuthUser(accessToken);
		if (userLookup.networkError) {
			return { session: null, networkError: true };
		}
		if (userLookup.user) {
			user = userLookup.user;
		}
	}

	if (!user) {
		const refreshed = await supabaseRefreshAuthSession(refreshToken);
		if (!refreshed.data) {
			if (!refreshed.unauthorized) {
				return { session: null, networkError: true };
			}
			return { session: null, reason: 'Your session has expired. Please sign in again.' };
		}
		accessToken = refreshed.data.access_token!;
		refreshToken = refreshed.data.refresh_token || refreshToken;
		expiresAtMs =
			typeof refreshed.data.expires_at === 'number'
				? refreshed.data.expires_at * 1000
				: Date.now() + (refreshed.data.expires_in || 3600) * 1000;
		user = refreshed.data.user!;
	}

	const role = await resolveStaffRoleWithFallback(user, accessToken);
	if (!role) {
		await supabaseSignOutRemote(accessToken);
		return {
			session: null,
			reason: 'Access denied. Only Admin or Moderator accounts are allowed.'
		};
	}

	const verified: ActiveStaffSession = {
		...stored,
		userId: user.id,
		email: user.email || stored.email,
		role,
		accessToken,
		refreshToken,
		expiresAtMs
	};
	persistSignedStaffSession(verified);
	return { session: verified };
}

async function runSessionHeartbeat(): Promise<void> {
	const current = activeSession;
	if (!current) return;

	try {
		const [serverNowMs, lookup] = await Promise.all([
			fetchAuthoritativeServerTimeMs(),
			queryAccessTokenById(current.tokenId)
		]);

		if (!activeSession || activeSession.tokenId !== current.tokenId) return;
		syncClockAnchor(serverNowMs);

		if (lookup.error) return;
		if (!lookup.data) {
			lockWorkbenchAccess('Invalid token code.', true);
			return;
		}

		const row = lookup.data;
		const dbExpiresMs = Date.parse(row.expires_at);

		if (row.is_revoked) {
			lockWorkbenchAccess('This token has been revoked by the administrator.', true);
			return;
		}

		if (!row.is_used || Number.isNaN(dbExpiresMs) || serverNowMs >= dbExpiresMs) {
			lockWorkbenchAccess("This token's access session has expired.", true);
			return;
		}

		if (dbExpiresMs !== activeSession.expiresAtMs) {
			const updated: ActiveSessionState = {
				...activeSession,
				expiresAtIso: row.expires_at,
				expiresAtMs: dbExpiresMs
			};
			activeSession = updated;
			persistSignedSession(updated);
			updatePortalRemainingTimeDisplay();
		}
	} catch {
		// Transient network hiccup; local monotonic countdown remains active
	}
}

async function runStaffSessionHeartbeat(): Promise<void> {
	const current = activeStaffSession;
	if (!current) return;

	try {
		const result = await verifyStoredStaffSessionWithServer(current);
		if (!activeStaffSession || activeStaffSession.userId !== current.userId) return;

		if (result.networkError) return;
		if (!result.session) {
			signOutStaffAccess(
				result.reason || 'Your account session is no longer active.',
				true
			);
			return;
		}
		activeStaffSession = result.session;
	} catch {
		// Transient network hiccup; retry on next heartbeat
	}
}

function handleVisibilityOrFocusHeartbeat(): void {
	if (document.visibilityState === 'visible') {
		runSessionHeartbeat();
	}
}

function handleStaffVisibilityOrFocusHeartbeat(): void {
	if (document.visibilityState === 'visible') {
		runStaffSessionHeartbeat();
	}
}

function activateSession(session: ActiveSessionState): void {
	stopSessionMonitors();
	stopStaffMonitors();
	clearStoredStaffSession();
	activeStaffSession = null;

	activeSession = session;
	portalErrorMessage = null;

	const nowMs = getAuthoritativeNowMs();
	const initialLeftSec = Math.max(0, Math.ceil((session.expiresAtMs - nowMs) / 1000));
	prevRemainingSec = initialLeftSec;
	firedMilestones = new Set(
		TIME_MILESTONES.filter(m => m.seconds >= initialLeftSec).map(m => m.seconds)
	);

	persistSignedSession(session);
	syncGatedToolVisibility();

	verifyActiveSessionTick();
	countdownTimerId = window.setInterval(verifyActiveSessionTick, COUNTDOWN_TICK_MS);
	heartbeatTimerId = window.setInterval(runSessionHeartbeat, HEARTBEAT_INTERVAL_MS);
	window.addEventListener('focus', handleVisibilityOrFocusHeartbeat);
	document.addEventListener('visibilitychange', handleVisibilityOrFocusHeartbeat);
}

function activateStaffSession(session: ActiveStaffSession): void {
	stopSessionMonitors();
	stopStaffMonitors();
	clearStoredSession();
	activeSession = null;
	prevRemainingSec = null;
	firedMilestones.clear();

	activeStaffSession = session;
	portalErrorMessage = null;

	persistSignedStaffSession(session);
	syncGatedToolVisibility();

	verifyActiveStaffSessionTick();
	staffTickTimerId = window.setInterval(verifyActiveStaffSessionTick, COUNTDOWN_TICK_MS);
	staffHeartbeatTimerId = window.setInterval(
		runStaffSessionHeartbeat,
		STAFF_HEARTBEAT_INTERVAL_MS
	);
	window.addEventListener('focus', handleStaffVisibilityOrFocusHeartbeat);
	document.addEventListener('visibilitychange', handleStaffVisibilityOrFocusHeartbeat);
}

async function verifyStoredSessionWithServer(
	stored: ActiveSessionState
): Promise<{ session: ActiveSessionState | null; reason?: string }> {
	const [serverNowMs, tokenQuery] = await Promise.all([
		fetchAuthoritativeServerTimeMs(),
		queryAccessTokenById(stored.tokenId)
	]);

	syncClockAnchor(serverNowMs);

	const dbRow = tokenQuery.data;
	if (tokenQuery.error || !dbRow) {
		return { session: null, reason: 'Invalid token code.' };
	}

	if (dbRow.is_revoked) {
		return {
			session: null,
			reason: 'This token has been revoked by the administrator.'
		};
	}

	const authoritativeExpiresAtMs = Date.parse(dbRow.expires_at);
	if (
		!dbRow.is_used ||
		Number.isNaN(authoritativeExpiresAtMs) ||
		serverNowMs >= authoritativeExpiresAtMs
	) {
		return {
			session: null,
			reason: "This token's access session has expired."
		};
	}

	const verifiedSession: ActiveSessionState = {
		...stored,
		tokenCode: dbRow.token_code,
		expiresAtIso: dbRow.expires_at,
		expiresAtMs: authoritativeExpiresAtMs
	};

	persistSignedSession(verifiedSession);
	return { session: verifiedSession };
}

async function submitAccessToken(rawInput: string): Promise<void> {
	if (isSubmittingAuth) return;

	const rawTrimmed = rawInput.trim();
	const normalizedToken = rawTrimmed.toUpperCase();
	if (!normalizedToken) {
		portalErrorMessage = 'Invalid token code.';
		renderWorkbenchAccessPortalContent({ token: rawInput });
		return;
	}

	isSubmittingAuth = true;
	portalErrorMessage = null;
	renderWorkbenchAccessPortalContent({ token: normalizedToken });

	try {
		const [serverNowMs, primaryLookup] = await Promise.all([
			fetchAuthoritativeServerTimeMs(),
			queryAccessTokenByCode(normalizedToken)
		]);

		syncClockAnchor(serverNowMs);

		if (primaryLookup.error) {
			portalErrorMessage = 'Verification query failed. Please try again.';
			isSubmittingAuth = false;
			renderWorkbenchAccessPortalContent({ token: normalizedToken });
			return;
		}

		let tokenRow = primaryLookup.data;

		if (!tokenRow && rawTrimmed !== normalizedToken) {
			const fallbackLookup = await queryAccessTokenByCode(rawTrimmed);
			if (!fallbackLookup.error && fallbackLookup.data) {
				tokenRow = fallbackLookup.data;
			}
		}

		if (!tokenRow) {
			portalErrorMessage = 'Invalid token code.';
			isSubmittingAuth = false;
			renderWorkbenchAccessPortalContent({ token: normalizedToken });
			return;
		}

		if (tokenRow.is_revoked === true) {
			portalErrorMessage = 'This token has been revoked by the administrator.';
			isSubmittingAuth = false;
			renderWorkbenchAccessPortalContent({ token: normalizedToken });
			return;
		}

		const currentTimesUsed = tokenRow.times_used ?? 0;
		if (tokenRow.max_uses !== null && currentTimesUsed >= tokenRow.max_uses) {
			portalErrorMessage = 'This token has reached its maximum allowed uses.';
			isSubmittingAuth = false;
			renderWorkbenchAccessPortalContent({ token: normalizedToken });
			return;
		}

		if (tokenRow.is_used === true) {
			const existingExpiresMs = Date.parse(tokenRow.expires_at);
			if (Number.isNaN(existingExpiresMs) || existingExpiresMs <= serverNowMs) {
				portalErrorMessage = "This token's access session has expired.";
				isSubmittingAuth = false;
				renderWorkbenchAccessPortalContent({ token: normalizedToken });
				return;
			}
		}

		const nowForActivationMs = getAuthoritativeNowMs();
		let targetExpiresAtIso: string;
		if (!tokenRow.is_used) {
			const intendedDurationMs = calculateInitialTokenDurationMs(tokenRow);
			targetExpiresAtIso = new Date(nowForActivationMs + intendedDurationMs).toISOString();
		} else {
			targetExpiresAtIso = tokenRow.expires_at;
		}

		const nextUses = currentTimesUsed + 1;
		const consumeResult = await consumeAccessTokenRow(tokenRow, nextUses, targetExpiresAtIso);
		if (consumeResult.error || !consumeResult.data) {
			portalErrorMessage = 'This token has reached its maximum allowed uses.';
			isSubmittingAuth = false;
			renderWorkbenchAccessPortalContent({ token: normalizedToken });
			return;
		}

		const consumedToken = consumeResult.data;
		const finalExpiresAtMs = Date.parse(consumedToken.expires_at);
		const postConsumeNowMs = getAuthoritativeNowMs();
		const grantedMs = Math.max(0, finalExpiresAtMs - postConsumeNowMs);

		if (grantedMs <= 0) {
			portalErrorMessage = "This token's access session has expired.";
			isSubmittingAuth = false;
			renderWorkbenchAccessPortalContent({ token: normalizedToken });
			return;
		}

		await recordActiveSessionLog(consumedToken.id);

		const grantedDurationLabel = formatGrantedDuration(grantedMs);
		const newSession: ActiveSessionState = {
			tokenId: consumedToken.id,
			tokenCode: consumedToken.token_code,
			expiresAtIso: consumedToken.expires_at,
			expiresAtMs: finalExpiresAtMs,
			grantedDurationLabel,
			nonce: generateSessionNonce()
		};

		isSubmittingAuth = false;
		activateSession(newSession);
		closeWorkbenchAccessPortal();

		triggerAccessPopup(
			'granted',
			'Access granted! 3D to WorldEdit & Pixel Art Generator unlocked for',
			`${grantedDurationLabel}.`
		);
	} catch {
		portalErrorMessage = 'Network error while verifying token. Please try again.';
		isSubmittingAuth = false;
		renderWorkbenchAccessPortalContent({ token: normalizedToken });
	}
}

async function submitDirectLogin(rawEmail: string, rawPassword: string): Promise<void> {
	if (isSubmittingAuth) return;

	const email = rawEmail.trim();
	const password = rawPassword;

	if (!email || !password) {
		portalErrorMessage = 'Please enter your email and password.';
		renderWorkbenchAccessPortalContent({ email, password });
		return;
	}

	isSubmittingAuth = true;
	portalErrorMessage = null;
	renderWorkbenchAccessPortalContent({ email, password });

	try {
		const signIn = await supabaseSignInWithPassword(email, password);
		if (!signIn.data || !signIn.data.access_token || !signIn.data.user) {
			portalErrorMessage = signIn.errorMessage || 'Invalid email or password.';
			isSubmittingAuth = false;
			renderWorkbenchAccessPortalContent({ email, password });
			return;
		}

		const { access_token, refresh_token, expires_in, expires_at, user } = signIn.data;
		const role = await resolveStaffRoleWithFallback(user, access_token);

		if (!role) {
			await supabaseSignOutRemote(access_token);
			portalErrorMessage = 'Access denied. Only Admin or Moderator accounts are allowed.';
			isSubmittingAuth = false;
			renderWorkbenchAccessPortalContent({ email, password: '' });
			return;
		}

		const expiresAtMs =
			typeof expires_at === 'number'
				? expires_at * 1000
				: Date.now() + (expires_in || 3600) * 1000;

		const newStaffSession: ActiveStaffSession = {
			userId: user.id,
			email: user.email || email,
			role,
			accessToken: access_token,
			refreshToken: refresh_token || '',
			expiresAtMs,
			nonce: generateSessionNonce()
		};

		isSubmittingAuth = false;
		activateStaffSession(newStaffSession);
		closeWorkbenchAccessPortal();

		triggerAccessPopup(
			'granted',
			`Signed in as ${formatStaffRoleLabel(role)}!`,
			'3D to WorldEdit & Pixel Art Generator unlocked.'
		);
	} catch {
		portalErrorMessage = 'Network error while signing in. Please try again.';
		isSubmittingAuth = false;
		renderWorkbenchAccessPortalContent({ email, password });
	}
}

function handlePortalKeydown(event: KeyboardEvent): void {
	if (!portalOverlayEl) return;
	if (event.key === 'Escape' && !isSubmittingAuth) {
		event.preventDefault();
		event.stopPropagation();
		closeWorkbenchAccessPortal();
	}
}

export function closeWorkbenchAccessPortal(): void {
	if (!portalOverlayEl) return;
	portalOverlayEl.remove();
	portalOverlayEl = null;
	window.removeEventListener('keydown', handlePortalKeydown, true);
}

function appendUnlockedToolsList(parent: HTMLElement): void {
	const unlockedList = document.createElement('div');
	unlockedList.className = 'wb_access_unlocked_list';

	const unlockedTools = [
		{ icon: 'swap_horiz', name: '3D to WorldEdit' },
		{ icon: 'grid_on', name: 'Pixel Art Generator' }
	];
	unlockedTools.forEach(item => {
		const itemEl = document.createElement('div');
		itemEl.className = 'wb_access_unlocked_item';
		const itemIcon = document.createElement('i');
		itemIcon.className = 'material-icons';
		itemIcon.textContent = item.icon;
		const itemLabel = document.createElement('span');
		itemLabel.textContent = item.name;
		itemEl.append(itemIcon, itemLabel);
		unlockedList.appendChild(itemEl);
	});

	parent.appendChild(unlockedList);
}

function renderWorkbenchAccessPortalContent(preserved?: {
	token?: string;
	email?: string;
	password?: string;
}): void {
	if (!portalOverlayEl) return;
	const card = portalOverlayEl.querySelector('.wb_access_card') as HTMLDivElement | null;
	if (!card) return;

	card.innerHTML = '';

	const isUnlocked = isWorkbenchAccessUnlocked();
	const showBackButton =
		!isBootstrappingAccess && !isUnlocked && (portalView === 'token' || portalView === 'login');

	if (showBackButton) {
		const backBtn = document.createElement('button');
		backBtn.type = 'button';
		backBtn.className = 'wb_access_back_btn';
		backBtn.setAttribute('aria-label', 'Back to Access Options');
		const backIcon = document.createElement('i');
		backIcon.className = 'material-icons';
		backIcon.textContent = 'arrow_back';
		const backText = document.createElement('span');
		backText.textContent = 'Back';
		backBtn.append(backIcon, backText);
		backBtn.addEventListener('click', () => {
			if (isSubmittingAuth) return;
			portalErrorMessage = null;
			portalView = 'choose';
			renderWorkbenchAccessPortalContent();
		});
		card.appendChild(backBtn);
	}

	const closeBtn = document.createElement('button');
	closeBtn.type = 'button';
	closeBtn.className = 'wb_access_close_btn';
	closeBtn.setAttribute('aria-label', 'Close Access Window');
	const closeIcon = document.createElement('i');
	closeIcon.className = 'material-icons';
	closeIcon.textContent = 'close';
	closeBtn.appendChild(closeIcon);
	closeBtn.addEventListener('click', () => {
		if (!isSubmittingAuth) closeWorkbenchAccessPortal();
	});
	card.appendChild(closeBtn);

	const header = document.createElement('div');
	header.className = 'wb_access_header';

	const logoWrap = document.createElement('div');
	logoWrap.className = 'wb_access_logo_wrap';
	const logoImg = document.createElement('img');
	logoImg.src = 'workbench_assets/workbench.png';
	logoImg.alt = 'Workbench';
	logoImg.draggable = false;
	logoWrap.appendChild(logoImg);
	header.appendChild(logoWrap);

	if (activeStaffSession || activeSession) {
		const badge = document.createElement('div');
		badge.className = 'wb_access_status_badge';
		const badgeIcon = document.createElement('i');
		badgeIcon.className = 'material-icons';
		badgeIcon.textContent = activeStaffSession ? 'admin_panel_settings' : 'verified_user';
		const badgeText = document.createElement('span');
		badgeText.textContent = activeStaffSession
			? `${formatStaffRoleLabel(activeStaffSession.role)} Access`
			: 'Access Active';
		badge.append(badgeIcon, badgeText);
		header.appendChild(badge);
	}

	const title = document.createElement('h2');
	title.className = 'wb_access_title';
	if (!isBootstrappingAccess && !isUnlocked && portalView === 'login') {
		title.appendChild(document.createTextNode('Direct '));
		const titleAccent = document.createElement('span');
		titleAccent.textContent = 'Login';
		title.appendChild(titleAccent);
	} else if (
		(!isBootstrappingAccess && !isUnlocked && portalView === 'token') ||
		activeSession
	) {
		title.appendChild(document.createTextNode('Workbench Access '));
		const titleAccent = document.createElement('span');
		titleAccent.textContent = 'Portal';
		title.appendChild(titleAccent);
	} else {
		title.appendChild(document.createTextNode('Workbench '));
		const titleAccent = document.createElement('span');
		titleAccent.textContent = 'Access';
		title.appendChild(titleAccent);
	}
	header.appendChild(title);

	const subtitle = document.createElement('p');
	subtitle.className = 'wb_access_subtitle';
	if (isBootstrappingAccess) {
		subtitle.textContent = 'Verifying access session...';
	} else if (activeStaffSession || activeSession) {
		subtitle.textContent =
			'3D to WorldEdit and Pixel Art Generator are currently visible in Workbench Tools.';
	} else if (portalView === 'login') {
		subtitle.textContent =
			'Sign in with your Admin or Moderator email to unlock 3D to WorldEdit and Pixel Art Generator.';
	} else if (portalView === 'token') {
		subtitle.textContent =
			'Enter your access token to unlock 3D to WorldEdit and Pixel Art Generator.';
	} else {
		subtitle.textContent =
			'Choose how you want to unlock 3D to WorldEdit and Pixel Art Generator.';
	}
	header.appendChild(subtitle);
	card.appendChild(header);

	if (isBootstrappingAccess) {
		const loading = document.createElement('div');
		loading.className = 'wb_access_loading';
		const spinner = document.createElement('span');
		spinner.className = 'wb_access_spinner';
		loading.appendChild(spinner);
		card.appendChild(loading);
		return;
	}

	// Unlocked via Direct Login (Admin / Moderator)
	if (activeStaffSession) {
		const activeInfo = document.createElement('div');
		activeInfo.className = 'wb_access_active_info';

		const emailRow = document.createElement('div');
		emailRow.className = 'wb_access_info_row';
		const emailLabel = document.createElement('span');
		emailLabel.className = 'wb_access_info_label';
		emailLabel.textContent = 'Account';
		const emailVal = document.createElement('span');
		emailVal.className = 'wb_access_info_value wb_access_info_email';
		emailVal.id = 'wb_access_account_email';
		emailVal.textContent = activeStaffSession.email;
		emailVal.title = activeStaffSession.email;
		emailRow.append(emailLabel, emailVal);
		activeInfo.appendChild(emailRow);

		const roleRow = document.createElement('div');
		roleRow.className = 'wb_access_info_row';
		const roleLabel = document.createElement('span');
		roleLabel.className = 'wb_access_info_label';
		roleLabel.textContent = 'Role';
		const roleVal = document.createElement('span');
		roleVal.className = 'wb_access_info_value';
		roleVal.id = 'wb_access_account_role';
		roleVal.textContent = formatStaffRoleLabel(activeStaffSession.role);
		roleRow.append(roleLabel, roleVal);
		activeInfo.appendChild(roleRow);

		appendUnlockedToolsList(activeInfo);
		card.appendChild(activeInfo);

		const actions = document.createElement('div');
		actions.className = 'wb_access_active_actions';

		const doneBtn = document.createElement('button');
		doneBtn.type = 'button';
		doneBtn.className = 'wb_access_submit_btn';
		doneBtn.textContent = 'Done';
		doneBtn.addEventListener('click', () => closeWorkbenchAccessPortal());

		const signOutBtn = document.createElement('button');
		signOutBtn.type = 'button';
		signOutBtn.className = 'wb_access_secondary_btn';
		const signOutIcon = document.createElement('i');
		signOutIcon.className = 'material-icons';
		signOutIcon.textContent = 'logout';
		const signOutText = document.createElement('span');
		signOutText.textContent = 'Sign Out';
		signOutBtn.append(signOutIcon, signOutText);
		signOutBtn.addEventListener('click', () => {
			signOutStaffAccess(undefined, true);
		});

		actions.append(doneBtn, signOutBtn);
		card.appendChild(actions);
		return;
	}

	// Unlocked via Workbench Access Token
	if (activeSession) {
		const activeInfo = document.createElement('div');
		activeInfo.className = 'wb_access_active_info';

		const row = document.createElement('div');
		row.className = 'wb_access_info_row';
		const label = document.createElement('span');
		label.className = 'wb_access_info_label';
		label.textContent = 'Remaining Time';
		const val = document.createElement('span');
		val.className = 'wb_access_info_value';
		val.id = 'wb_access_remaining_value';
		const leftMs = Math.max(0, activeSession.expiresAtMs - getAuthoritativeNowMs());
		val.textContent = formatGrantedDuration(leftMs);
		row.append(label, val);
		activeInfo.appendChild(row);

		appendUnlockedToolsList(activeInfo);
		card.appendChild(activeInfo);

		const actions = document.createElement('div');
		actions.className = 'wb_access_active_actions';

		const doneBtn = document.createElement('button');
		doneBtn.type = 'button';
		doneBtn.className = 'wb_access_submit_btn';
		doneBtn.textContent = 'Done';
		doneBtn.addEventListener('click', () => closeWorkbenchAccessPortal());

		const hideBtn = document.createElement('button');
		hideBtn.type = 'button';
		hideBtn.className = 'wb_access_secondary_btn';
		const hideIcon = document.createElement('i');
		hideIcon.className = 'material-icons';
		hideIcon.textContent = 'visibility_off';
		const hideText = document.createElement('span');
		hideText.textContent = 'Hide Tools';
		hideBtn.append(hideIcon, hideText);
		hideBtn.addEventListener('click', () => {
			lockWorkbenchAccess(undefined, true);
		});

		actions.append(doneBtn, hideBtn);
		card.appendChild(actions);
		return;
	}

	// View 1: Access Method Chooser (Direct Login vs Workbench Access Portal)
	if (portalView === 'choose') {
		const choices = document.createElement('div');
		choices.className = 'wb_access_choices';

		const buildChoiceButton = (opts: {
			mode: 'login' | 'token';
			icon: string;
			titleText: string;
			descText: string;
		}) => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'wb_access_choice_btn';
			btn.dataset.accessMode = opts.mode;

			const iconWrap = document.createElement('div');
			iconWrap.className = 'wb_access_choice_icon';
			const iconEl = document.createElement('i');
			iconEl.className = 'material-icons';
			iconEl.textContent = opts.icon;
			iconWrap.appendChild(iconEl);

			const textWrap = document.createElement('div');
			textWrap.className = 'wb_access_choice_text';
			const titleEl = document.createElement('span');
			titleEl.className = 'wb_access_choice_title';
			titleEl.textContent = opts.titleText;
			const descEl = document.createElement('span');
			descEl.className = 'wb_access_choice_desc';
			descEl.textContent = opts.descText;
			textWrap.append(titleEl, descEl);

			const arrow = document.createElement('i');
			arrow.className = 'material-icons wb_access_choice_arrow';
			arrow.textContent = 'chevron_right';

			btn.append(iconWrap, textWrap, arrow);
			btn.addEventListener('click', () => {
				portalErrorMessage = null;
				portalView = opts.mode;
				renderWorkbenchAccessPortalContent();
			});
			return btn;
		};

		choices.append(
			buildChoiceButton({
				mode: 'login',
				icon: 'admin_panel_settings',
				titleText: 'Direct Login',
				descText: 'Sign in with Admin or Moderator email'
			}),
			buildChoiceButton({
				mode: 'token',
				icon: 'vpn_key',
				titleText: 'Workbench Access Portal',
				descText: 'Unlock using an access token'
			})
		);

		card.appendChild(choices);
		return;
	}

	// View 2: Direct Login (Admin / Moderator Email & Password)
	if (portalView === 'login') {
		const form = document.createElement('form');
		form.className = 'wb_access_form';
		form.id = 'wb_access_login_form';
		form.noValidate = true;

		const clearInlineError = () => {
			if (portalErrorMessage) {
				portalErrorMessage = null;
				const existingErr = form.querySelector('.wb_access_error');
				if (existingErr) existingErr.remove();
			}
		};

		const emailWrap = document.createElement('div');
		emailWrap.className = 'wb_access_input_wrap';
		const emailIcon = document.createElement('i');
		emailIcon.className = 'material-icons wb_access_input_icon';
		emailIcon.textContent = 'mail_outline';
		const emailInput = document.createElement('input');
		emailInput.id = 'wb_access_email_input';
		emailInput.className = 'wb_access_input';
		emailInput.type = 'email';
		emailInput.placeholder = 'Email address';
		emailInput.autocomplete = 'email';
		emailInput.spellcheck = false;
		emailInput.value = preserved?.email || '';
		emailInput.disabled = isSubmittingAuth;
		emailInput.addEventListener('input', clearInlineError);
		emailWrap.append(emailIcon, emailInput);
		form.appendChild(emailWrap);

		const pwWrap = document.createElement('div');
		pwWrap.className = 'wb_access_input_wrap';
		const pwIcon = document.createElement('i');
		pwIcon.className = 'material-icons wb_access_input_icon';
		pwIcon.textContent = 'lock_outline';
		const pwInput = document.createElement('input');
		pwInput.id = 'wb_access_password_input';
		pwInput.className = 'wb_access_input wb_access_input_pw';
		pwInput.type = 'password';
		pwInput.placeholder = 'Password';
		pwInput.autocomplete = 'current-password';
		pwInput.value = preserved?.password || '';
		pwInput.disabled = isSubmittingAuth;
		pwInput.addEventListener('input', clearInlineError);

		const togglePwBtn = document.createElement('button');
		togglePwBtn.type = 'button';
		togglePwBtn.className = 'wb_access_pw_toggle';
		togglePwBtn.setAttribute('aria-label', 'Show password');
		togglePwBtn.disabled = isSubmittingAuth;
		const togglePwIcon = document.createElement('i');
		togglePwIcon.className = 'material-icons';
		togglePwIcon.textContent = 'visibility';
		togglePwBtn.appendChild(togglePwIcon);
		togglePwBtn.addEventListener('click', () => {
			const showing = pwInput.type === 'text';
			pwInput.type = showing ? 'password' : 'text';
			togglePwIcon.textContent = showing ? 'visibility' : 'visibility_off';
			togglePwBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
		});

		pwWrap.append(pwIcon, pwInput, togglePwBtn);
		form.appendChild(pwWrap);

		if (portalErrorMessage) {
			const errBox = document.createElement('div');
			errBox.className = 'wb_access_error';
			errBox.setAttribute('role', 'alert');
			const errIcon = document.createElement('i');
			errIcon.className = 'material-icons';
			errIcon.textContent = 'error_outline';
			const errSpan = document.createElement('span');
			errSpan.textContent = portalErrorMessage;
			errBox.append(errIcon, errSpan);
			form.appendChild(errBox);
		}

		const submitBtn = document.createElement('button');
		submitBtn.type = 'submit';
		submitBtn.className = 'wb_access_submit_btn';
		submitBtn.disabled = isSubmittingAuth;

		if (isSubmittingAuth) {
			const btnSpinner = document.createElement('span');
			btnSpinner.className = 'wb_access_btn_spinner';
			const btnText = document.createElement('span');
			btnText.textContent = 'Signing In...';
			submitBtn.append(btnSpinner, btnText);
		} else {
			const btnText = document.createElement('span');
			btnText.textContent = 'Sign In';
			const btnIcon = document.createElement('i');
			btnIcon.className = 'material-icons';
			btnIcon.textContent = 'arrow_forward';
			submitBtn.append(btnText, btnIcon);
		}

		form.appendChild(submitBtn);
		form.addEventListener('submit', event => {
			event.preventDefault();
			submitDirectLogin(emailInput.value, pwInput.value);
		});

		card.appendChild(form);

		if (!isSubmittingAuth) {
			requestAnimationFrame(() => {
				if (emailInput.value && !pwInput.value) {
					pwInput.focus();
				} else {
					emailInput.focus();
				}
			});
		}
		return;
	}

	// View 3: Workbench Access Portal (Access Token Entry)
	const form = document.createElement('form');
	form.className = 'wb_access_form';
	form.id = 'wb_access_form';
	form.noValidate = true;

	const inputWrap = document.createElement('div');
	inputWrap.className = 'wb_access_input_wrap';

	const keyIcon = document.createElement('i');
	keyIcon.className = 'material-icons wb_access_input_icon';
	keyIcon.textContent = 'vpn_key';

	const input = document.createElement('input');
	input.id = 'wb_access_token_input';
	input.type = 'text';
	input.placeholder = 'WB-123456';
	input.autocomplete = 'off';
	input.spellcheck = false;
	input.value = preserved?.token || '';
	input.disabled = isSubmittingAuth;
	input.addEventListener('input', () => {
		const start = input.selectionStart;
		const end = input.selectionEnd;
		const upper = input.value.toUpperCase();
		if (input.value !== upper) {
			input.value = upper;
			if (start !== null && end !== null) {
				input.setSelectionRange(start, end);
			}
		}
		if (portalErrorMessage) {
			portalErrorMessage = null;
			const existingErr = form.querySelector('.wb_access_error');
			if (existingErr) existingErr.remove();
		}
	});

	inputWrap.append(keyIcon, input);
	form.appendChild(inputWrap);

	if (portalErrorMessage) {
		const errBox = document.createElement('div');
		errBox.className = 'wb_access_error';
		errBox.setAttribute('role', 'alert');
		const errIcon = document.createElement('i');
		errIcon.className = 'material-icons';
		errIcon.textContent = 'error_outline';
		const errSpan = document.createElement('span');
		errSpan.textContent = portalErrorMessage;
		errBox.append(errIcon, errSpan);
		form.appendChild(errBox);
	}

	const submitBtn = document.createElement('button');
	submitBtn.type = 'submit';
	submitBtn.className = 'wb_access_submit_btn';
	submitBtn.disabled = isSubmittingAuth;

	if (isSubmittingAuth) {
		const btnSpinner = document.createElement('span');
		btnSpinner.className = 'wb_access_btn_spinner';
		const btnText = document.createElement('span');
		btnText.textContent = 'Verifying Token...';
		submitBtn.append(btnSpinner, btnText);
	} else {
		const btnText = document.createElement('span');
		btnText.textContent = 'Get Access';
		const btnIcon = document.createElement('i');
		btnIcon.className = 'material-icons';
		btnIcon.textContent = 'arrow_forward';
		submitBtn.append(btnText, btnIcon);
	}

	form.appendChild(submitBtn);
	form.addEventListener('submit', event => {
		event.preventDefault();
		submitAccessToken(input.value);
	});

	card.appendChild(form);

	if (!isSubmittingAuth) {
		requestAnimationFrame(() => {
			input.focus();
		});
	}
}

export function openWorkbenchAccessPortal(): void {
	if (portalOverlayEl) {
		renderWorkbenchAccessPortalContent();
		return;
	}

	if (!isSubmittingAuth && !isWorkbenchAccessUnlocked()) {
		portalView = 'choose';
		portalErrorMessage = null;
	}

	const overlay = document.createElement('div');
	overlay.id = 'wb_access_portal_overlay';
	overlay.setAttribute('role', 'dialog');
	overlay.setAttribute('aria-modal', 'true');
	overlay.setAttribute('aria-label', 'Workbench Access');

	// Prevent Blockbench global hotkeys from firing while interacting with the portal
	const stopKeyPropagation = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') {
			event.stopPropagation();
		}
	};
	overlay.addEventListener('keydown', stopKeyPropagation);
	overlay.addEventListener('keyup', stopKeyPropagation);
	overlay.addEventListener('keypress', stopKeyPropagation);

	overlay.addEventListener('mousedown', event => {
		if (event.target === overlay && !isSubmittingAuth) {
			closeWorkbenchAccessPortal();
		}
	});

	const card = document.createElement('div');
	card.className = 'wb_access_card';
	overlay.appendChild(card);

	document.body.appendChild(overlay);
	portalOverlayEl = overlay;
	window.addEventListener('keydown', handlePortalKeydown, true);

	renderWorkbenchAccessPortalContent();
}

function bootstrapWorkbenchAccess(): void {
	try {
		sessionStorage.removeItem(LEGACY_SESSION_KEY);
	} catch {
		// Ignore
	}

	window.addEventListener('storage', async (e: StorageEvent) => {
		if (activeStaffSession) {
			if (e.key === STAFF_STORAGE_KEY || e.key === null) {
				verifyActiveStaffSessionTick();
			}
			return;
		}
		if (activeSession) {
			if (e.key === LOCAL_STORAGE_KEY || e.key === null) {
				verifyActiveSessionTick();
			}
			return;
		}
		if (e.key === STAFF_STORAGE_KEY && e.newValue) {
			const storedStaff = readVerifiedStaffSessionFromStorage();
			if (!storedStaff) return;
			try {
				const { session: verified } = await verifyStoredStaffSessionWithServer(storedStaff);
				if (verified) {
					activateStaffSession(verified);
					if (portalOverlayEl) renderWorkbenchAccessPortalContent();
				}
			} catch {
				// Ignore transient network errors
			}
			return;
		}
		if (e.key === LOCAL_STORAGE_KEY && e.newValue) {
			const stored = readVerifiedSessionFromStorage();
			if (!stored) return;
			try {
				const { session: verified } = await verifyStoredSessionWithServer(stored);
				if (verified) {
					activateSession(verified);
					if (portalOverlayEl) renderWorkbenchAccessPortalContent();
				}
			} catch {
				// Ignore transient network errors
			}
		}
	});

	const restore = async () => {
		const storedStaff = readVerifiedStaffSessionFromStorage();
		if (storedStaff) {
			try {
				const result = await verifyStoredStaffSessionWithServer(storedStaff);
				if (result.session) {
					isBootstrappingAccess = false;
					activateStaffSession(result.session);
					if (portalOverlayEl) renderWorkbenchAccessPortalContent();
					return;
				}
				if (!result.networkError) {
					clearStoredStaffSession();
				}
			} catch {
				// Fall through to token restore check
			}
		} else {
			clearStoredStaffSession();
		}

		const storedToken = readVerifiedSessionFromStorage();
		if (!storedToken) {
			clearStoredSession();
			isBootstrappingAccess = false;
			syncGatedToolVisibility();
			if (portalOverlayEl) renderWorkbenchAccessPortalContent();
			return;
		}

		try {
			const { session: verified } = await verifyStoredSessionWithServer(storedToken);
			isBootstrappingAccess = false;
			if (!verified) {
				clearStoredSession();
				syncGatedToolVisibility();
				if (portalOverlayEl) renderWorkbenchAccessPortalContent();
				return;
			}
			activateSession(verified);
			if (portalOverlayEl) renderWorkbenchAccessPortalContent();
		} catch {
			isBootstrappingAccess = false;
			clearStoredSession();
			syncGatedToolVisibility();
			if (portalOverlayEl) renderWorkbenchAccessPortalContent();
		}
	};

	restore();
}

(window as any).WorkbenchAccess = {
	openPortal: openWorkbenchAccessPortal,
	closePortal: closeWorkbenchAccessPortal,
	isUnlocked: isWorkbenchAccessUnlocked,
	lockAccess: () => lockWorkbenchAccess(undefined, true)
};

export function openWorkbenchTool(tool_id: string) {
	const def = WORKBENCH_TOOLS.find(t => t.id === tool_id || t.format_id === tool_id);
	if (!def) return;

	if (GATED_TOOL_IDS.has(def.id) && !isWorkbenchAccessUnlocked()) {
		openWorkbenchAccessPortal();
		return;
	}

	if (!Interface.tab_bar?.$data) return;
	if (!Interface.tab_bar.$data.tool_tabs) {
		Vue.set(Interface.tab_bar.$data, 'tool_tabs', []);
	}

	let existingTab = Interface.tab_bar.$data.tool_tabs.find((t: any) => t.id === def.id);
	if (!existingTab) {
		existingTab = new ToolTab(def);
		Interface.tab_bar.$data.tool_tabs.push(existingTab);
	}

	existingTab.select();
	updateTabBarVisibility();
}

// Register formats for each tool
export function initWorkbenchTools() {
	WORKBENCH_TOOLS.forEach(def => {
		const isGated = GATED_TOOL_IDS.has(def.id);
		const format = new ModelFormat(def.format_id, {
			name: def.name,
			icon: def.icon,
			category: 'workbench_tools',
			description: def.description,
			target: def.target,
			show_on_start_screen: !isGated,
			show_in_new_list: !isGated,
			format_page: {
				content: [
					{ type: 'h3', text: def.name },
					{ text: def.details }
				],
				button_text: 'Open ' + def.name
			}
		});

		format.new = function() {
			openWorkbenchTool(def.id);
			return true;
		};
	});
}

initWorkbenchTools();
bootstrapWorkbenchAccess();


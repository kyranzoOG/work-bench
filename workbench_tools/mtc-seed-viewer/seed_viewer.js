/**
 * MultiCraft Map Generator (MapgenV7P) & Seed Viewer
 * Exact mathematical recreation of MultiCraft's C++ noise & biome algorithms
 */

// -------------------------------------------------------------
// MultiCraft Noise Core (noise.cpp recreation)
// -------------------------------------------------------------

const NOISE_MAGIC_X = 1619;
const NOISE_MAGIC_Y = 31337;
const NOISE_MAGIC_Z = 52591;
const NOISE_MAGIC_SEED = 1013;

const NOISE_FLAG_DEFAULTS = 0x01;
const NOISE_FLAG_EASED = 0x02;
const NOISE_FLAG_ABSVALUE = 0x04;

function easeCurve(t) {
    return t * t * t * (t * (6.0 * t - 15.0) + 10.0);
}

function linearInterpolation(v0, v1, t) {
    return v0 + (v1 - v0) * t;
}

function biLinearInterpolation(v00, v10, v01, v11, x, y, eased) {
    if (eased) {
        x = easeCurve(x);
        y = easeCurve(y);
    }
    const u = linearInterpolation(v00, v10, x);
    const v = linearInterpolation(v01, v11, x);
    return linearInterpolation(u, v, y);
}

function triLinearInterpolation(v000, v100, v010, v110, v001, v101, v011, v111, x, y, z, eased) {
    if (eased) {
        x = easeCurve(x);
        y = easeCurve(y);
        z = easeCurve(z);
    }
    const u = biLinearInterpolation(v000, v100, v010, v110, x, y, false);
    const v = biLinearInterpolation(v001, v101, v011, v111, x, y, false);
    return linearInterpolation(u, v, z);
}

function noise2d(x, y, seed) {
    let n = ((Math.imul(NOISE_MAGIC_X, x) + Math.imul(NOISE_MAGIC_Y, y) + Math.imul(NOISE_MAGIC_SEED, seed)) & 0x7fffffff) >>> 0;
    n = ((n >>> 13) ^ n) >>> 0;
    const n2 = Math.imul(n, n) >>> 0;
    const term = (Math.imul(n2, 60493) + 19990303) >>> 0;
    n = ((Math.imul(n, term) + 1376312589) & 0x7fffffff) >>> 0;
    return 1.0 - (n / 0x40000000);
}

function noise3d(x, y, z, seed) {
    let n = ((Math.imul(NOISE_MAGIC_X, x) + Math.imul(NOISE_MAGIC_Y, y) + Math.imul(NOISE_MAGIC_Z, z) + Math.imul(NOISE_MAGIC_SEED, seed)) & 0x7fffffff) >>> 0;
    n = ((n >>> 13) ^ n) >>> 0;
    const n2 = Math.imul(n, n) >>> 0;
    const term = (Math.imul(n2, 60493) + 19990303) >>> 0;
    n = ((Math.imul(n, term) + 1376312589) & 0x7fffffff) >>> 0;
    return 1.0 - (n / 0x40000000);
}

function noise2d_gradient(x, y, seed, eased = true) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const xl = x - x0;
    const yl = y - y0;
    const v00 = noise2d(x0, y0, seed);
    const v10 = noise2d(x0 + 1, y0, seed);
    const v01 = noise2d(x0, y0 + 1, seed);
    const v11 = noise2d(x0 + 1, y0 + 1, seed);
    return biLinearInterpolation(v00, v10, v01, v11, xl, yl, eased);
}

function noise3d_gradient(x, y, z, seed, eased = false) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const xl = x - x0;
    const yl = y - y0;
    const zl = z - z0;
    const v000 = noise3d(x0, y0, z0, seed);
    const v100 = noise3d(x0 + 1, y0, z0, seed);
    const v010 = noise3d(x0, y0 + 1, z0, seed);
    const v110 = noise3d(x0 + 1, y0 + 1, z0, seed);
    const v001 = noise3d(x0, y0, z0 + 1, seed);
    const v101 = noise3d(x0 + 1, y0, z0 + 1, seed);
    const v011 = noise3d(x0, y0 + 1, z0 + 1, seed);
    const v111 = noise3d(x0 + 1, y0 + 1, z0 + 1, seed);
    return triLinearInterpolation(v000, v100, v010, v110, v001, v101, v011, v111, xl, yl, zl, eased);
}

function NoisePerlin2D(np, x, y, seed) {
    let a = 0;
    let f = 1.0;
    let g = 1.0;
    const nx = x / np.spread[0];
    const ny = y / np.spread[1];
    const s = (seed + np.seed) | 0;

    for (let i = 0; i < np.octaves; i++) {
        let noiseval = noise2d_gradient(nx * f, ny * f, (s + i) | 0, (np.flags & (NOISE_FLAG_DEFAULTS | NOISE_FLAG_EASED)) !== 0);
        if (np.flags & NOISE_FLAG_ABSVALUE) noiseval = Math.abs(noiseval);
        a += g * noiseval;
        f *= np.lacunarity;
        g *= np.persist;
    }
    return np.offset + a * np.scale;
}

function NoisePerlin3D(np, x, y, z, seed) {
    let a = 0;
    let f = 1.0;
    let g = 1.0;
    const nx = x / np.spread[0];
    const ny = y / np.spread[1];
    const nz = z / np.spread[2];
    const s = (seed + np.seed) | 0;

    for (let i = 0; i < np.octaves; i++) {
        let noiseval = noise3d_gradient(nx * f, ny * f, nz * f, (s + i) | 0, (np.flags & NOISE_FLAG_EASED) !== 0);
        if (np.flags & NOISE_FLAG_ABSVALUE) noiseval = Math.abs(noiseval);
        a += g * noiseval;
        f *= np.lacunarity;
        g *= np.persist;
    }
    return np.offset + a * np.scale;
}

// -------------------------------------------------------------
// MultiCraft MapgenV7P Parameters (mapgen_v7p.cpp)
// -------------------------------------------------------------

const MGV7P_PARAMS = {
    np_terrain_base:    { offset: 4,    scale: 35,  spread: [600, 600, 600],   seed: 82341, octaves: 5, persist: 0.6, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
    np_terrain_alt:     { offset: 4,    scale: 25,  spread: [600, 600, 600],   seed: 5934,  octaves: 5, persist: 0.6, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
    np_terrain_persist: { offset: 0.6,  scale: 0.1, spread: [2000, 2000, 2000], seed: 539,   octaves: 3, persist: 0.6, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
    np_height_select:   { offset: -8,   scale: 16,  spread: [500, 500, 500],   seed: 4213,  octaves: 6, persist: 0.7, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
    np_filler_depth:    { offset: 0,    scale: 1.2, spread: [150, 150, 150],   seed: 261,   octaves: 3, persist: 0.7, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
    np_mount_height:    { offset: 128,  scale: 56,  spread: [1000, 1000, 1000], seed: 72449, octaves: 3, persist: 0.6, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
    np_ridge_uwater:    { offset: 0,    scale: 1,   spread: [1000, 1000, 1000], seed: 85039, octaves: 5, persist: 0.6, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
    np_mountain:        { offset: -0.6, scale: 1,   spread: [250, 250, 250],   seed: 5333,  octaves: 5, persist: 0.63, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
    np_ridge:           { offset: 0,    scale: 1,   spread: [100, 100, 100],   seed: 6467,  octaves: 4, persist: 0.75, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
    water_level: 1,

    // 3D Noise for Caves and Dungeons
    np_cave1:           { offset: 0.0, scale: 12.0, spread: [61.0, 61.0, 61.0], seed: 52534, octaves: 3, persist: 0.5, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
    np_cave2:           { offset: 0.0, scale: 12.0, spread: [67.0, 67.0, 67.0], seed: 10325, octaves: 3, persist: 0.5, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
    np_dungeons:        { offset: 0.9, scale: 0.5,  spread: [500.0, 500.0, 500.0], seed: 0, octaves: 2, persist: 0.8, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },

    // Biome Noise (mg_biome.h)
    np_heat:            { offset: 50, scale: 50, spread: [1000.0, 1000.0, 1000.0], seed: 5349,  octaves: 3, persist: 0.5, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
    np_humidity:        { offset: 50, scale: 50, spread: [1000.0, 1000.0, 1000.0], seed: 842,   octaves: 3, persist: 0.5, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
    np_heat_blend:      { offset: 0,  scale: 1.5, spread: [8.0, 8.0, 8.0],        seed: 13,    octaves: 2, persist: 1.0, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
    np_humidity_blend:  { offset: 0,  scale: 1.5, spread: [8.0, 8.0, 8.0],        seed: 90003, octaves: 2, persist: 1.0, lacunarity: 2.0, flags: NOISE_FLAG_DEFAULTS },
};

// -------------------------------------------------------------
// Biomes Registry & Color Definitions
// -------------------------------------------------------------

const BIOME_DEFINITIONS = [
    // Ocean Biomes (y <= 3)
    { name: 'desert_ocean',           heat: 86, hum: 20, y_min: -255, y_max: 3, color: [43, 92, 143] },
    { name: 'sandstone_desert_ocean',  heat: 60, hum: 10, y_min: -255, y_max: 3, color: [63, 128, 163] },
    { name: 'savanna_ocean',          heat: 80, hum: 40, y_min: -255, y_max: 3, color: [47, 104, 158] },
    { name: 'grassland_ocean',        heat: 50, hum: 35, y_min: -255, y_max: 3, color: [53, 112, 175] },
    { name: 'taiga_ocean',            heat: 25, hum: 70, y_min: -255, y_max: 3, color: [38, 76, 117] },
    { name: 'tundra_ocean',           heat: 0,  hum: 25, y_min: -255, y_max: 3, color: [34, 67, 104] },
    { name: 'glacier_ocean',          heat: -10, hum: 50, y_min: -255, y_max: 3, color: [28, 58, 92] },
    { name: 'rainforest_ocean',       heat: 86, hum: 85, y_min: -255, y_max: 3, color: [40, 98, 152] },

    // Shore & Dunes Biomes (y around 1 to 5)
    { name: 'grassland_dunes',        heat: 54, hum: 32, y_min: 3, y_max: 6, color: [214, 191, 123] },
    { name: 'water_plants_bamboo_shore', heat: 68, hum: 55, y_min: 1, y_max: 4, color: [120, 183, 86] },

    // Land Biomes (y >= 4)
    { name: 'pink_biome',             heat: 66, hum: 30, y_min: 4, y_max: 31000, color: [232, 160, 197] },
    { name: 'grassland',              heat: 50, hum: 35, y_min: 6, y_max: 31000, color: [136, 181, 55] },
    { name: 'deciduous_forest',       heat: 60, hum: 65, y_min: 4, y_max: 31000, color: [90, 156, 61] },
    { name: 'autumn',                 heat: 46, hum: 60, y_min: 4, y_max: 31000, color: [215, 112, 51] },
    { name: 'sandstone_desert',       heat: 60, hum: 5,  y_min: 4, y_max: 31000, color: [197, 161, 91] },
    { name: 'savanna',                heat: 84, hum: 40, y_min: 4, y_max: 31000, color: [163, 160, 63] },
    { name: 'desert',                 heat: 92, hum: 16, y_min: 4, y_max: 31000, color: [224, 190, 117] },
    { name: 'rainforest',             heat: 86, hum: 85, y_min: 4, y_max: 31000, color: [31, 117, 53] },
    { name: 'taiga',                  heat: 25, hum: 70, y_min: 4, y_max: 31000, color: [59, 104, 88] },
    { name: 'tundra',                 heat: 0,  hum: 25, y_min: 4, y_max: 31000, color: [127, 152, 130] },
    { name: 'snowy_grassland',        heat: 15, hum: 40, y_min: 4, y_max: 31000, color: [229, 236, 242] },
    { name: 'glacier',                heat: -10, hum: 50, y_min: 4, y_max: 31000, color: [182, 219, 230] }
];

// -------------------------------------------------------------
// MultiCraft Generator Functions
// -------------------------------------------------------------

function calculateBaseTerrain(x, z, seed) {
    let hselect = NoisePerlin2D(MGV7P_PARAMS.np_height_select, x, z, seed);
    hselect = Math.max(0.0, Math.min(1.0, hselect));

    const persist = NoisePerlin2D(MGV7P_PARAMS.np_terrain_persist, x, z, seed);

    const base_np = { ...MGV7P_PARAMS.np_terrain_base, persist };
    const alt_np = { ...MGV7P_PARAMS.np_terrain_alt, persist };

    const height_base = NoisePerlin2D(base_np, x, z, seed);
    const height_alt = NoisePerlin2D(alt_np, x, z, seed);

    if (height_alt > height_base) return height_alt;
    return (height_base * hselect) + (height_alt * (1.0 - hselect));
}

function calculateMountain(x, z, seed) {
    const mnt_h = NoisePerlin2D(MGV7P_PARAMS.np_mount_height, x, z, seed);
    const mnt_n = NoisePerlin2D(MGV7P_PARAMS.np_mountain, x, z, seed);
    return mnt_h * mnt_n;
}

function calculateRidgeRiverCut(x, z, surface_y, seed) {
    const width = 0.2;
    const uwatern = NoisePerlin2D(MGV7P_PARAMS.np_ridge_uwater, x, z, seed) * 2;
    if (Math.abs(uwatern) > width) return surface_y;

    const width_mod = width - Math.abs(uwatern);
    const nridge_raw = NoisePerlin2D(MGV7P_PARAMS.np_ridge, x, z, seed);

    // Check downwards from surface_y
    let y = Math.floor(surface_y);
    const minY = MGV7P_PARAMS.water_level - 16;

    while (y >= minY) {
        const altitude = y - MGV7P_PARAMS.water_level;
        const height_mod = (altitude + 17) / 2.5;
        const nridge = nridge_raw * Math.max(altitude, 0) / 7.0;

        if (nridge + width_mod * height_mod >= 0.6) {
            y--;
        } else {
            break;
        }
    }

    return y + 1;
}

function calculateSurfaceHeight(x, z, seed, showRivers = true) {
    let y = calculateBaseTerrain(x, z, seed);
    const mnt = calculateMountain(x, z, seed);
    if (mnt > y) y = mnt;

    if (showRivers) {
        y = calculateRidgeRiverCut(x, z, y, seed);
    }
    return y;
}

function calculateHeatHumidity(x, z, seed) {
    const heat = NoisePerlin2D(MGV7P_PARAMS.np_heat, x, z, seed) + NoisePerlin2D(MGV7P_PARAMS.np_heat_blend, x, z, seed);
    const hum = NoisePerlin2D(MGV7P_PARAMS.np_humidity, x, z, seed) + NoisePerlin2D(MGV7P_PARAMS.np_humidity_blend, x, z, seed);
    return { heat, hum };
}

function getBiomeAt(x, z, y, seed, cachedHeatHum = null) {
    const { heat, hum } = cachedHeatHum || calculateHeatHumidity(x, z, seed);

    let bestBiome = BIOME_DEFINITIONS[0];
    let minDist = Infinity;

    for (let i = 0; i < BIOME_DEFINITIONS.length; i++) {
        const b = BIOME_DEFINITIONS[i];
        if (y < b.y_min || y > b.y_max) continue;

        const dh = heat - b.heat;
        const dm = hum - b.hum;
        const dist = dh * dh + dm * dm;

        if (dist < minDist) {
            minDist = dist;
            bestBiome = b;
        }
    }
    return bestBiome;
}

// -------------------------------------------------------------
// UI Controller & Interactive Viewer
// -------------------------------------------------------------

class MultiCraftSeedViewer {
    constructor() {
        this.canvas = document.getElementById('mapCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.loadingOverlay = document.getElementById('loadingOverlay');

        // Inputs
        this.seedInput = document.getElementById('seedInput');
        this.centerXInput = document.getElementById('centerXInput');
        this.centerZInput = document.getElementById('centerZInput');
        this.viewWidthInput = document.getElementById('viewWidthInput');
        this.resolutionInput = document.getElementById('resolutionInput');
        this.colorBySelect = document.getElementById('colorBySelect');
        this.showRiversCheck = document.getElementById('showRiversCheck');
        this.showCavesCheck = document.getElementById('showCavesCheck');
        this.showDungeonsCheck = document.getElementById('showDungeonsCheck');
        this.ySliceSlider = document.getElementById('ySliceSlider');
        this.ySliceValueText = document.getElementById('ySliceValueText');
        this.ySliceGroup = document.getElementById('ySliceGroup');
        this.btnRender = document.getElementById('btnRender');

        // Outputs
        this.paletteBar = document.getElementById('paletteBar');
        this.biomesListText = document.getElementById('biomesListText');
        this.inspectorCoords = document.getElementById('inspectorCoords');
        this.inspectorHeight = document.getElementById('inspectorHeight');
        this.inspectorBiome = document.getElementById('inspectorBiome');
        this.inspectorExtra = document.getElementById('inspectorExtra');
        this.mapTooltip = document.getElementById('mapTooltip');

        // State
        this.isRendering = false;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.dragCenterStart = { x: 0, z: 0 };
        this.lastRenderData = null;

        this.initEventListeners();
        this.render();
    }

    initEventListeners() {
        // Mobile Drawer Toggle
        const sidebar = document.getElementById('sidebar');
        const mobileBackdrop = document.getElementById('mobileBackdrop');
        const btnMobileToggle = document.getElementById('btnMobileToggle');
        const btnCloseSidebar = document.getElementById('btnCloseSidebar');

        const openSidebar = () => {
            if (sidebar) sidebar.classList.add('open');
            if (mobileBackdrop) mobileBackdrop.classList.add('active');
        };
        const closeSidebar = () => {
            if (sidebar) sidebar.classList.remove('open');
            if (mobileBackdrop) mobileBackdrop.classList.remove('active');
        };

        if (btnMobileToggle) btnMobileToggle.addEventListener('click', openSidebar);
        if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', closeSidebar);
        if (mobileBackdrop) mobileBackdrop.addEventListener('click', closeSidebar);

        // Render trigger
        this.btnRender.addEventListener('click', () => {
            if (window.innerWidth <= 860) closeSidebar();
            this.render();
        });

        // Enter key in inputs triggers render
        [this.seedInput, this.centerXInput, this.centerZInput, this.viewWidthInput, this.resolutionInput].forEach(inp => {
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (window.innerWidth <= 860) closeSidebar();
                    this.render();
                }
            });
        });

        // Quick dropdown / checkbox changes
        this.colorBySelect.addEventListener('change', () => this.render());
        this.showRiversCheck.addEventListener('change', () => this.render());

        const updateSliceVisibility = () => {
            if (this.showCavesCheck.checked || this.showDungeonsCheck.checked) {
                this.ySliceGroup.style.display = 'flex';
            } else {
                this.ySliceGroup.style.display = 'none';
            }
        };
        this.showCavesCheck.addEventListener('change', () => { updateSliceVisibility(); this.render(); });
        this.showDungeonsCheck.addEventListener('change', () => { updateSliceVisibility(); this.render(); });

        this.ySliceSlider.addEventListener('input', (e) => {
            this.ySliceValueText.textContent = e.target.value;
            if (this.showCavesCheck.checked || this.showDungeonsCheck.checked) {
                this.render();
            }
        });

        // Mouse hover inspector on canvas
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasHover(e));
        this.canvas.addEventListener('mouseleave', () => {
            this.mapTooltip.style.display = 'none';
        });

        // Drag to pan (Mouse)
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.dragStart = { x: e.clientX, y: e.clientY };
            this.dragCenterStart = {
                x: parseFloat(this.centerXInput.value) || 0,
                z: parseFloat(this.centerZInput.value) || 0
            };
            this.canvas.parentElement.classList.add('grabbing');
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            const dx = e.clientX - this.dragStart.x;
            const dy = e.clientY - this.dragStart.y;
            const viewWidth = parseFloat(this.viewWidthInput.value) || 500;
            const res = parseInt(this.resolutionInput.value, 10) || 500;
            const nodesPerPixel = viewWidth / res;

            const newCenterX = Math.round(this.dragCenterStart.x - dx * nodesPerPixel);
            const newCenterZ = Math.round(this.dragCenterStart.z - dy * nodesPerPixel);

            this.centerXInput.value = newCenterX;
            this.centerZInput.value = newCenterZ;
        });

        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.canvas.parentElement.classList.remove('grabbing');
                this.render();
            }
        });

        // Touch Gestures (Mobile Pan, Pinch-to-Zoom, and Tap Inspect)
        let initialPinchDist = null;
        let initialPinchWidth = null;
        let isTouching = false;

        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                isTouching = true;
                this.dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                this.dragCenterStart = {
                    x: parseFloat(this.centerXInput.value) || 0,
                    z: parseFloat(this.centerZInput.value) || 0
                };
                this.handleCanvasHover(e.touches[0]);
            } else if (e.touches.length === 2) {
                isTouching = false;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                initialPinchDist = Math.hypot(dx, dy);
                initialPinchWidth = parseFloat(this.viewWidthInput.value) || 500;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault(); // Prevent page scroll while interacting with map
            if (e.touches.length === 1 && isTouching) {
                const dx = e.touches[0].clientX - this.dragStart.x;
                const dy = e.touches[0].clientY - this.dragStart.y;
                const viewWidth = parseFloat(this.viewWidthInput.value) || 500;
                const res = parseInt(this.resolutionInput.value, 10) || 500;
                const nodesPerPixel = viewWidth / res;

                const newCenterX = Math.round(this.dragCenterStart.x - dx * nodesPerPixel);
                const newCenterZ = Math.round(this.dragCenterStart.z - dy * nodesPerPixel);

                this.centerXInput.value = newCenterX;
                this.centerZInput.value = newCenterZ;
                this.handleCanvasHover(e.touches[0]);
            } else if (e.touches.length === 2 && initialPinchDist) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const currentDist = Math.hypot(dx, dy);
                if (currentDist > 10) {
                    const scale = initialPinchDist / currentDist;
                    let newWidth = Math.round(initialPinchWidth * scale);
                    newWidth = Math.max(50, Math.min(20000, newWidth));
                    this.viewWidthInput.value = newWidth;
                }
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            if (e.touches.length === 0) {
                if (isTouching || initialPinchDist) {
                    isTouching = false;
                    initialPinchDist = null;
                    this.render();
                }
                setTimeout(() => {
                    this.mapTooltip.style.display = 'none';
                }, 3000);
            }
        });

        // Mouse wheel to zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            let currentWidth = parseFloat(this.viewWidthInput.value) || 500;
            const zoomFactor = e.deltaY > 0 ? 1.25 : 0.8;
            currentWidth = Math.max(50, Math.min(20000, Math.round(currentWidth * zoomFactor)));
            this.viewWidthInput.value = currentWidth;
            this.render();
        }, { passive: false });

        // Overlay Navigation Controls
        document.getElementById('zoomInBtn').addEventListener('click', () => {
            let w = Math.round((parseFloat(this.viewWidthInput.value) || 500) * 0.75);
            this.viewWidthInput.value = Math.max(50, w);
            this.render();
        });

        document.getElementById('zoomOutBtn').addEventListener('click', () => {
            let w = Math.round((parseFloat(this.viewWidthInput.value) || 500) * 1.33);
            this.viewWidthInput.value = Math.min(20000, w);
            this.render();
        });

        document.getElementById('resetNavBtn').addEventListener('click', () => {
            this.centerXInput.value = -7000;
            this.centerZInput.value = 3000;
            this.viewWidthInput.value = 500;
            this.render();
        });

        // Quick toolbar buttons
        document.getElementById('btnRandomSeed').addEventListener('click', () => {
            this.seedInput.value = Math.floor(Math.random() * 1000000000);
            this.render();
        });

        document.getElementById('btnPresetScreenshot').addEventListener('click', () => {
            this.seedInput.value = "592101399";
            this.centerXInput.value = "-7000";
            this.centerZInput.value = "3000";
            this.viewWidthInput.value = "500";
            this.resolutionInput.value = "500";
            this.colorBySelect.value = "combined";
            this.showRiversCheck.checked = true;
            this.showCavesCheck.checked = false;
            this.showDungeonsCheck.checked = false;
            this.render();
        });

        document.getElementById('btnPresetOrigin').addEventListener('click', () => {
            this.centerXInput.value = "0";
            this.centerZInput.value = "0";
            this.viewWidthInput.value = "500";
            this.render();
        });

        document.getElementById('btnExportPng').addEventListener('click', () => {
            const link = document.createElement('a');
            link.download = `multicraft_seed_${this.seedInput.value}_${this.centerXInput.value}_${this.centerZInput.value}.png`;
            link.href = this.canvas.toDataURL('image/png');
            link.click();
        });
    }

    parseSeed(seedStr) {
        if (!seedStr) return 0;
        const num = parseInt(seedStr, 10);
        if (!isNaN(num) && num.toString() === seedStr.trim()) {
            return num | 0;
        }
        // String hash
        let hash = 0;
        for (let i = 0; i < seedStr.length; i++) {
            hash = (Math.imul(31, hash) + seedStr.charCodeAt(i)) | 0;
        }
        return hash;
    }

    handleCanvasHover(e) {
        if (!this.lastRenderData) return;
        const rect = this.canvas.getBoundingClientRect();
        const px = Math.floor((e.clientX - rect.left) * (this.canvas.width / rect.width));
        const py = Math.floor((e.clientY - rect.top) * (this.canvas.height / rect.height));

        if (px < 0 || px >= this.canvas.width || py < 0 || py >= this.canvas.height) {
            this.mapTooltip.style.display = 'none';
            return;
        }

        const { minX, minZ, nodesPerPixel, seed, showRivers } = this.lastRenderData;
        const nodeX = Math.round(minX + px * nodesPerPixel);
        const nodeZ = Math.round(minZ + py * nodesPerPixel);

        const height = calculateSurfaceHeight(nodeX, nodeZ, seed, showRivers);
        const { heat, hum } = calculateHeatHumidity(nodeX, nodeZ, seed);
        const biome = getBiomeAt(nodeX, nodeZ, height, seed, { heat, hum });

        // Update Bottom Inspector Line (matching screenshot format exactly)
        this.inspectorCoords.textContent = `(${nodeX}, ${nodeZ})`;
        this.inspectorHeight.textContent = `- height ${height.toFixed(1)}`;
        this.inspectorBiome.textContent = `- ${biome.name}`;
        this.inspectorExtra.textContent = `[heat: ${heat.toFixed(1)}°C, hum: ${hum.toFixed(1)}%]`;

        // Update Tooltip
        this.mapTooltip.style.display = 'block';
        this.mapTooltip.style.left = `${e.clientX}px`;
        this.mapTooltip.style.top = `${e.clientY}px`;
        this.mapTooltip.innerHTML = `<strong>(${nodeX}, ${nodeZ})</strong><br>Height: ${height.toFixed(1)}<br>Biome: <span style="color:#f472b6">${biome.name}</span>`;
    }

    render() {
        if (this.isRendering) return;
        this.isRendering = true;
        this.loadingOverlay.classList.add('active');

        // Allow UI to show spinner
        setTimeout(() => {
            this.performRender();
            this.loadingOverlay.classList.remove('active');
            this.isRendering = false;
        }, 16);
    }

    performRender() {
        const seed = this.parseSeed(this.seedInput.value);
        const centerX = parseFloat(this.centerXInput.value) || 0;
        const centerZ = parseFloat(this.centerZInput.value) || 0;
        const viewWidth = Math.max(10, parseFloat(this.viewWidthInput.value) || 500);
        const res = Math.max(64, Math.min(1024, parseInt(this.resolutionInput.value, 10) || 500));
        const colorMode = this.colorBySelect.value;
        const showRivers = this.showRiversCheck.checked;
        const showCaves = this.showCavesCheck.checked;
        const showDungeons = this.showDungeonsCheck.checked;
        const sliceY = parseFloat(this.ySliceSlider.value) || 0;

        this.canvas.width = res;
        this.canvas.height = res;

        const nodesPerPixel = viewWidth / res;
        const halfWidth = viewWidth / 2;
        const minX = centerX - halfWidth;
        const minZ = centerZ - halfWidth;

        this.lastRenderData = { minX, minZ, nodesPerPixel, seed, showRivers };

        const imgData = this.ctx.createImageData(res, res);
        const data = imgData.data;

        // Heights grid for 3D hillshading
        const heights = new Float32Array((res + 2) * (res + 2));
        const getHIndex = (gx, gz) => (gz + 1) * (res + 2) + (gx + 1);

        // Precompute heights including 1-pixel border for normal calculations
        for (let py = -1; py <= res; py++) {
            const z = minZ + py * nodesPerPixel;
            for (let px = -1; px <= res; px++) {
                const x = minX + px * nodesPerPixel;
                heights[getHIndex(px, py)] = calculateSurfaceHeight(x, z, seed, showRivers);
            }
        }

        const biomesSeen = new Map();

        // Sun light direction for 3D Hillshading: Top-Left (North-West, 315 deg azimuth, 45 deg elevation)
        const lx = -0.577;
        const lz = -0.577;
        const ly = 0.577;

        for (let py = 0; py < res; py++) {
            const nodeZ = minZ + py * nodesPerPixel;
            const rowOffset = py * res;

            for (let px = 0; px < res; px++) {
                const nodeX = minX + px * nodesPerPixel;
                const idx = (rowOffset + px) * 4;

                const height = heights[getHIndex(px, py)];
                const { heat, hum } = calculateHeatHumidity(nodeX, nodeZ, seed);
                const biome = getBiomeAt(nodeX, nodeZ, height, seed, { heat, hum });

                if (!biomesSeen.has(biome.name)) {
                    biomesSeen.set(biome.name, biome);
                }

                // Check Caves & Dungeons if in Y-slice mode
                let isCave = false;
                let isDungeon = false;

                if (showCaves && height >= sliceY) {
                    const c1 = NoisePerlin3D(MGV7P_PARAMS.np_cave1, nodeX, sliceY, nodeZ, seed);
                    const c2 = NoisePerlin3D(MGV7P_PARAMS.np_cave2, nodeX, sliceY, nodeZ, seed);
                    if (Math.abs(c1 * c2) > 42.0) {
                        isCave = true;
                    }
                }

                if (showDungeons && height >= sliceY) {
                    const d = NoisePerlin3D(MGV7P_PARAMS.np_dungeons, nodeX, sliceY, nodeZ, seed);
                    if (d > 1.25) {
                        isDungeon = true;
                    }
                }

                let r = 0, g = 0, b = 0;

                if (isDungeon) {
                    r = 240; g = 80; b = 80; // Bright dungeon room red
                } else if (isCave) {
                    r = 20; g = 20; b = 25;   // Dark cave hollow
                } else if (colorMode === 'combined') {
                    // 3D Hillshaded Biomes
                    const [br, bg, bb] = biome.color;

                    if (height <= MGV7P_PARAMS.water_level) {
                        // Water surface with depth shading
                        const depth = Math.min(30, MGV7P_PARAMS.water_level - height);
                        const depthFactor = Math.max(0.4, 1.0 - depth * 0.02);
                        r = Math.round(br * depthFactor);
                        g = Math.round(bg * depthFactor);
                        b = Math.round(bb * depthFactor);
                    } else {
                        // Terrain relief normal vector
                        const dx = (heights[getHIndex(px + 1, py)] - heights[getHIndex(px - 1, py)]) * (1.5 / nodesPerPixel);
                        const dz = (heights[getHIndex(px, py + 1)] - heights[getHIndex(px, py - 1)]) * (1.5 / nodesPerPixel);
                        const len = Math.sqrt(dx * dx + dz * dz + 1.0);
                        const nx = -dx / len;
                        const nz = -dz / len;
                        const ny = 1.0 / len;

                        // Lambertian diffuse lighting + ambient
                        const dot = Math.max(0, nx * lx + ny * ly + nz * lz);
                        const light = 0.55 + 0.45 * dot;

                        r = Math.min(255, Math.round(br * light));
                        g = Math.min(255, Math.round(bg * light));
                        b = Math.min(255, Math.round(bb * light));
                    }
                } else if (colorMode === 'biome_only') {
                    [r, g, b] = biome.color;
                } else if (colorMode === 'elevation') {
                    // Elevation Hypsometric tint
                    if (height <= MGV7P_PARAMS.water_level) {
                        const depth = Math.max(0, Math.min(1, (MGV7P_PARAMS.water_level - height) / 30));
                        r = Math.round(20 * (1 - depth));
                        g = Math.round(70 * (1 - depth) + 30);
                        b = Math.round(180 * (1 - depth) + 75);
                    } else {
                        const hNorm = Math.min(1, Math.max(0, (height - MGV7P_PARAMS.water_level) / 120));
                        if (hNorm < 0.3) {
                            r = Math.round(80 + hNorm * 200);
                            g = Math.round(180 - hNorm * 100);
                            b = 70;
                        } else if (hNorm < 0.7) {
                            r = Math.round(160 + (hNorm - 0.3) * 150);
                            g = Math.round(140 - (hNorm - 0.3) * 100);
                            b = Math.round(60 + (hNorm - 0.3) * 50);
                        } else {
                            const snow = (hNorm - 0.7) / 0.3;
                            r = Math.round(210 + snow * 45);
                            g = Math.round(200 + snow * 55);
                            b = Math.round(190 + snow * 65);
                        }
                    }
                } else if (colorMode === 'heat') {
                    const normHeat = Math.max(0, Math.min(1, heat / 100));
                    r = Math.round(normHeat * 255);
                    g = Math.round((1 - Math.abs(normHeat - 0.5) * 2) * 255);
                    b = Math.round((1 - normHeat) * 255);
                } else if (colorMode === 'humidity') {
                    const normHum = Math.max(0, Math.min(1, hum / 100));
                    r = Math.round((1 - normHum) * 210);
                    g = Math.round(normHum * 160 + 60);
                    b = Math.round(normHum * 255);
                } else if (colorMode === 'rivers') {
                    const uwatern = NoisePerlin2D(MGV7P_PARAMS.np_ridge_uwater, nodeX, nodeZ, seed) * 2;
                    const inCorridor = Math.abs(uwatern) <= 0.2;
                    if (inCorridor) {
                        r = 45; g = 175; b = 255;
                    } else {
                        const val = Math.min(255, Math.max(0, Math.round(Math.abs(uwatern) * 100)));
                        r = val; g = val; b = val;
                    }
                }

                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 255;
            }
        }

        this.ctx.putImageData(imgData, 0, 0);

        // Update Palette Bar and Biomes list
        this.updatePaletteAndList(biomesSeen);
    }

    updatePaletteAndList(biomesSeen) {
        this.paletteBar.innerHTML = '';
        const sortedBiomes = Array.from(biomesSeen.values()).sort((a, b) => a.name.localeCompare(b.name));

        sortedBiomes.forEach(b => {
            const swatch = document.createElement('div');
            swatch.className = 'palette-swatch';
            swatch.style.backgroundColor = `rgb(${b.color[0]}, ${b.color[1]}, ${b.color[2]})`;
            swatch.title = b.name;
            swatch.addEventListener('click', () => {
                this.inspectorBiome.textContent = `- ${b.name}`;
            });
            this.paletteBar.appendChild(swatch);
        });

        const namesList = sortedBiomes.map(b => b.name).join(', ');
        this.biomesListText.textContent = `${sortedBiomes.length} biomes in view: ${namesList}`;
    }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
    window.app = new MultiCraftSeedViewer();
});

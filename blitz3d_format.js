/**
 * Blitz3D (.b3d) Format Support for Blockbench
 * 
 * Adds native import and export support for Blitz3D (.b3d) binary models.
 * Conforms strictly to the Blitz3D binary chunk specification:
 *   BB3D -> [TEXS] -> [BRUS] -> NODE -> [MESH (VRTS + TRIS)] -> [child NODEs]
 */

(function () {
    let b3dCodec;
    let exportAction;
    let importAction;
    let rescaleAction;
    let textureEventListener;

    // =========================================================================
    // 1. Little-Endian Binary Reader (DataView & ArrayBuffer)
    // =========================================================================
    class B3DReader {
        constructor(arrayBuffer) {
            this.buffer = arrayBuffer;
            this.view = new DataView(arrayBuffer);
            this.offset = 0;
            this.length = arrayBuffer.byteLength;
        }

        hasBytes(n = 1) {
            return this.offset + n <= this.length;
        }

        readUint8() {
            if (this.offset >= this.length) return 0;
            return this.view.getUint8(this.offset++);
        }

        readInt32() {
            if (this.offset + 4 > this.length) {
                this.offset = this.length;
                return 0;
            }
            const val = this.view.getInt32(this.offset, true);
            this.offset += 4;
            return val;
        }

        readUint32() {
            if (this.offset + 4 > this.length) {
                this.offset = this.length;
                return 0;
            }
            const val = this.view.getUint32(this.offset, true);
            this.offset += 4;
            return val;
        }

        readFloat32() {
            if (this.offset + 4 > this.length) {
                this.offset = this.length;
                return 0.0;
            }
            const val = this.view.getFloat32(this.offset, true);
            this.offset += 4;
            return val;
        }

        readTag() {
            if (this.offset + 4 > this.length) {
                this.offset = this.length;
                return '';
            }
            let tag = '';
            for (let i = 0; i < 4; i++) {
                tag += String.fromCharCode(this.view.getUint8(this.offset + i));
            }
            this.offset += 4;
            return tag;
        }

        readString() {
            const start = this.offset;
            while (this.offset < this.length && this.view.getUint8(this.offset) !== 0) {
                this.offset++;
            }
            const bytes = new Uint8Array(this.buffer, start, this.offset - start);
            if (this.offset < this.length) {
                this.offset++; // Skip null terminator
            }
            try {
                return new TextDecoder('utf-8').decode(bytes);
            } catch (e) {
                let s = '';
                for (let i = 0; i < bytes.length; i++) {
                    s += String.fromCharCode(bytes[i]);
                }
                return s;
            }
        }

        skip(bytes) {
            this.offset = Math.min(this.length, this.offset + bytes);
        }
    }

    // =========================================================================
    // 2. Hierarchical Binary Chunk Writer
    // =========================================================================
    class ChunkWriter {
        constructor(tag) {
            this.tag = tag;
            this.data = [];     // Raw byte payload
            this.children = []; // Child ChunkWriter nodes
        }

        writeInt32(val) {
            val = val | 0;
            this.data.push(val & 0xff);
            this.data.push((val >> 8) & 0xff);
            this.data.push((val >> 16) & 0xff);
            this.data.push((val >> 24) & 0xff);
        }

        writeUint32(val) {
            val = val >>> 0;
            this.data.push(val & 0xff);
            this.data.push((val >> 8) & 0xff);
            this.data.push((val >> 16) & 0xff);
            this.data.push((val >> 24) & 0xff);
        }

        writeFloat32(val) {
            const buf = new ArrayBuffer(4);
            new DataView(buf).setFloat32(0, Number(val) || 0.0, true);
            const u8 = new Uint8Array(buf);
            for (let i = 0; i < 4; i++) {
                this.data.push(u8[i]);
            }
        }

        writeString(str) {
            str = str || '';
            try {
                const encoded = new TextEncoder().encode(str);
                for (let i = 0; i < encoded.length; i++) {
                    this.data.push(encoded[i]);
                }
            } catch (e) {
                for (let i = 0; i < str.length; i++) {
                    this.data.push(str.charCodeAt(i) & 0xff);
                }
            }
            this.data.push(0); // Null terminator
        }

        createChild(tag) {
            const child = new ChunkWriter(tag);
            this.children.push(child);
            return child;
        }

        addChild(child) {
            this.children.push(child);
        }

        calculateContentSize() {
            let size = this.data.length;
            for (const child of this.children) {
                size += 8 + child.calculateContentSize(); // 8 bytes header (4 tag + 4 size) + child payload
            }
            return size;
        }

        serializeInto(u8Array, offset) {
            // 4-byte ASCII chunk tag
            for (let i = 0; i < 4; i++) {
                u8Array[offset + i] = this.tag.charCodeAt(i) & 0xff;
            }
            offset += 4;

            // 4-byte little-endian size offset
            const contentSize = this.calculateContentSize();
            u8Array[offset] = contentSize & 0xff;
            u8Array[offset + 1] = (contentSize >> 8) & 0xff;
            u8Array[offset + 2] = (contentSize >> 16) & 0xff;
            u8Array[offset + 3] = (contentSize >> 24) & 0xff;
            offset += 4;

            // Direct data payload
            for (let i = 0; i < this.data.length; i++) {
                u8Array[offset + i] = this.data[i];
            }
            offset += this.data.length;

            // Recurse into child chunks
            for (const child of this.children) {
                offset = child.serializeInto(u8Array, offset);
            }

            return offset;
        }

        toUint8Array() {
            const totalSize = 8 + this.calculateContentSize();
            const u8 = new Uint8Array(totalSize);
            this.serializeInto(u8, 0);
            return u8;
        }

        toArrayBuffer() {
            return this.toUint8Array().buffer;
        }
    }

    // =========================================================================
    // 3. Mathematical Helpers & Image Dimension Parsing
    // =========================================================================
    function quatToEulerDegrees(w, x, y, z) {
        if (typeof THREE !== 'undefined' && THREE.Quaternion && THREE.Euler) {
            const q = new THREE.Quaternion(x, y, z, w);
            const e = new THREE.Euler().setFromQuaternion(q, 'ZYX');
            return [
                THREE.MathUtils.radToDeg(e.x),
                THREE.MathUtils.radToDeg(e.y),
                THREE.MathUtils.radToDeg(e.z)
            ];
        }
        const sinr_cosp = 2 * (w * x + y * z);
        const cosr_cosp = 1 - 2 * (x * x + y * y);
        const roll = Math.atan2(sinr_cosp, cosr_cosp);

        const sinp = 2 * (w * y - z * x);
        let pitch;
        if (Math.abs(sinp) >= 1) {
            pitch = Math.sign(sinp) * (Math.PI / 2);
        } else {
            pitch = Math.asin(sinp);
        }

        const siny_cosp = 2 * (w * z + x * y);
        const cosy_cosp = 1 - 2 * (y * y + z * z);
        const yaw = Math.atan2(siny_cosp, cosy_cosp);

        return [roll * 180 / Math.PI, pitch * 180 / Math.PI, yaw * 180 / Math.PI];
    }

    function eulerDegreesToQuat(rx, ry, rz) {
        if (typeof THREE !== 'undefined' && THREE.Euler && THREE.Quaternion) {
            const e = new THREE.Euler(
                THREE.MathUtils.degToRad(rx || 0),
                THREE.MathUtils.degToRad(ry || 0),
                THREE.MathUtils.degToRad(rz || 0),
                'ZYX'
            );
            const q = new THREE.Quaternion().setFromEuler(e);
            return [q.w, q.x, q.y, q.z];
        }
        const cx = Math.cos((rx || 0) * Math.PI / 360);
        const sx = Math.sin((rx || 0) * Math.PI / 360);
        const cy = Math.cos((ry || 0) * Math.PI / 360);
        const sy = Math.sin((ry || 0) * Math.PI / 360);
        const cz = Math.cos((rz || 0) * Math.PI / 360);
        const sz = Math.sin((rz || 0) * Math.PI / 360);

        const w = cz * cy * cx + sz * sy * sx;
        const x = cz * cy * sx - sz * sy * cx;
        const y = cz * sy * cx + sz * cy * sx;
        const z = sz * cy * cx - cz * sy * sx;
        return [w, x, y, z];
    }

    function ensureArrayBuffer(data) {
        if (!data) return new ArrayBuffer(0);
        if (data instanceof ArrayBuffer) return data;
        if (ArrayBuffer.isView(data)) {
            return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        }
        if (typeof data === 'string') {
            const buf = new ArrayBuffer(data.length);
            const view = new Uint8Array(buf);
            for (let i = 0; i < data.length; i++) {
                view[i] = data.charCodeAt(i) & 0xff;
            }
            return buf;
        }
        return new ArrayBuffer(0);
    }

    /**
     * Inspects binary image headers (PNG, BMP, GIF, JPG, TGA) to read exact resolution.
     */
    function readImageDimensionsFromFile(filePath, fs) {
        if (!fs || !fs.existsSync || !fs.existsSync(filePath)) return null;
        try {
            const fd = fs.openSync(filePath, 'r');
            const buf = Buffer.alloc(2048);
            const bytesRead = fs.readSync(fd, buf, 0, 2048, 0);
            fs.closeSync(fd);
            if (bytesRead < 16) return null;

            // PNG: 89 50 4E 47 ... IHDR dimensions at 16 (width), 20 (height)
            if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 && bytesRead >= 24) {
                const width = buf.readUInt32BE(16);
                const height = buf.readUInt32BE(20);
                if (width > 0 && height > 0) return { width, height };
            }

            // BMP: 'BM', width at 18 (LE), height at 22 (LE)
            if (buf[0] === 0x42 && buf[1] === 0x4D && bytesRead >= 26) {
                const width = buf.readInt32LE(18);
                const height = Math.abs(buf.readInt32LE(22));
                if (width > 0 && height > 0) return { width, height };
            }

            // GIF: 'GIF87a' or 'GIF89a', width at 6 (LE), height at 8 (LE)
            if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && bytesRead >= 10) {
                const width = buf.readUInt16LE(6);
                const height = buf.readUInt16LE(8);
                if (width > 0 && height > 0) return { width, height };
            }

            // JPEG
            if (buf[0] === 0xFF && buf[1] === 0xD8) {
                let offset = 2;
                while (offset + 4 < bytesRead) {
                    if (buf[offset] !== 0xFF) break;
                    const marker = buf[offset + 1];
                    offset += 2;
                    if (marker === 0xD9 || marker === 0xDA) break; // EOI, SOS
                    if (marker >= 0xD0 && marker <= 0xD7) continue; // RST
                    if (marker === 0x01) continue;

                    const len = (buf[offset] << 8) | buf[offset + 1];
                    if (len < 2) break;

                    if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) ||
                        (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
                        if (offset + 7 <= bytesRead) {
                            const height = (buf[offset + 3] << 8) | buf[offset + 4];
                            const width = (buf[offset + 5] << 8) | buf[offset + 6];
                            if (width > 0 && height > 0) return { width, height };
                        }
                    }
                    offset += len;
                }
            }

            // TGA
            if (bytesRead >= 18) {
                const width = buf.readUInt16LE(12);
                const height = buf.readUInt16LE(14);
                const bpp = buf[16];
                if (width > 0 && width <= 8192 && height > 0 && height <= 8192 && (bpp === 8 || bpp === 16 || bpp === 24 || bpp === 32)) {
                    return { width, height };
                }
            }
        } catch (e) {}
        return null;
    }

    function hasB3DMeshes(targetTexUuid = null) {
        const meshes = (typeof Mesh !== 'undefined' && Mesh.all) ? Mesh.all : [];
        for (const mesh of meshes) {
            if (!mesh.faces) continue;
            for (const fKey in mesh.faces) {
                const face = mesh.faces[fKey];
                if (!face || !face.b3d_norm_uv) continue;
                if (targetTexUuid && face.texture && face.texture !== targetTexUuid) continue;
                return true;
            }
        }
        return false;
    }

    /**
     * Rescales all mesh face UVs to match a target texture resolution.
     */
    function rescaleModelUVs(texWidth, texHeight, targetTexUuid = null) {
        if (!texWidth || !texHeight || texWidth <= 0 || texHeight <= 0) return;

        Project.texture_width = texWidth;
        Project.texture_height = texHeight;

        const meshes = (typeof Mesh !== 'undefined' && Mesh.all) ? Mesh.all : [];
        let modified = false;

        for (const mesh of meshes) {
            if (!mesh.faces) continue;
            for (const fKey in mesh.faces) {
                const face = mesh.faces[fKey];
                if (!face) continue;
                if (targetTexUuid && face.texture && face.texture !== targetTexUuid) continue;

                if (face.b3d_norm_uv) {
                    face.uv = face.uv || {};
                    for (const vKey in face.b3d_norm_uv) {
                        const norm = face.b3d_norm_uv[vKey];
                        face.uv[vKey] = [norm[0] * texWidth, norm[1] * texHeight];
                    }
                    modified = true;
                }
            }
        }

        if (modified && typeof Canvas !== 'undefined' && Canvas.updateAll) {
            Canvas.updateAll();
        }
    }

    // =========================================================================
    // 4. Binary Parser (Import .b3d to Blockbench)
    // =========================================================================
    function parseB3D(arrayBuffer, filePath) {
        const reader = new B3DReader(arrayBuffer);
        if (reader.length < 8) {
            Blockbench.showMessageBox({
                title: 'Import Error',
                message: 'Invalid Blitz3D model: file size is too small.'
            });
            return;
        }

        const rootTag = reader.readTag();
        if (rootTag !== 'BB3D') {
            Blockbench.showMessageBox({
                title: 'Import Error',
                message: `Invalid Blitz3D header: expected 'BB3D', got '${rootTag}'.`
            });
            return;
        }

        const rootLength = reader.readUint32();
        const rootEnd = Math.min(reader.length, reader.offset + rootLength);
        const version = reader.readInt32(); // Format version (1 or 100)

        const parsedTextures = [];
        const parsedBrushes = [];
        const parsedNodes = [];

        // Parse root subchunks
        while (reader.offset < rootEnd) {
            const tag = reader.readTag();
            const len = reader.readUint32();
            const end = Math.min(reader.length, reader.offset + len);

            if (tag === 'TEXS') {
                while (reader.offset < end) {
                    const file = reader.readString();
                    const flags = reader.readInt32();
                    const blend = reader.readInt32();
                    const posX = reader.readFloat32();
                    const posY = reader.readFloat32();
                    const scaleX = reader.readFloat32();
                    const scaleY = reader.readFloat32();
                    const rot = reader.readFloat32();
                    parsedTextures.push({ file, flags, blend, posX, posY, scaleX, scaleY, rot });
                }
            } else if (tag === 'BRUS') {
                const nTexs = reader.readInt32();
                while (reader.offset < end) {
                    const name = reader.readString();
                    const red = reader.readFloat32();
                    const green = reader.readFloat32();
                    const blue = reader.readFloat32();
                    const alpha = reader.readFloat32();
                    const shininess = reader.readFloat32();
                    const blend = reader.readInt32();
                    const fx = reader.readInt32();
                    const texIds = [];
                    for (let i = 0; i < nTexs; i++) {
                        texIds.push(reader.readInt32());
                    }
                    parsedBrushes.push({ name, red, green, blue, alpha, shininess, blend, fx, texIds });
                }
            } else if (tag === 'NODE') {
                parsedNodes.push(readNodeChunk(reader, end));
            } else {
                reader.offset = end;
            }
        }

        function readNodeChunk(r, nodeEnd) {
            const name = r.readString();
            const px = r.readFloat32();
            const py = r.readFloat32();
            const pz = r.readFloat32();
            const sx = r.readFloat32();
            const sy = r.readFloat32();
            const sz = r.readFloat32();
            const rw = r.readFloat32();
            const rx = r.readFloat32();
            const ry = r.readFloat32();
            const rz = r.readFloat32();

            const node = {
                name,
                pos: [px, py, pz],
                scale: [sx, sy, sz],
                rot: [rw, rx, ry, rz],
                mesh: null,
                children: []
            };

            while (r.offset < nodeEnd) {
                const subTag = r.readTag();
                const subLen = r.readUint32();
                const subEnd = Math.min(r.length, r.offset + subLen);

                if (subTag === 'MESH') {
                    node.mesh = readMeshChunk(r, subEnd);
                } else if (subTag === 'NODE') {
                    node.children.push(readNodeChunk(r, subEnd));
                } else {
                    r.offset = subEnd;
                }
            }
            return node;
        }

        function readMeshChunk(r, meshEnd) {
            const brushId = r.readInt32();
            const meshData = {
                brushId,
                vertices: [],
                trisList: []
            };

            while (r.offset < meshEnd) {
                const mTag = r.readTag();
                const mLen = r.readUint32();
                const mEnd = Math.min(r.length, r.offset + mLen);

                if (mTag === 'VRTS') {
                    const flags = r.readInt32();
                    const texCoordSets = r.readInt32();
                    const texCoordSetSize = r.readInt32();

                    const hasNormals = (flags & 1) !== 0;
                    const hasColors = (flags & 2) !== 0;

                    while (r.offset < mEnd) {
                        const vx = r.readFloat32();
                        const vy = r.readFloat32();
                        const vz = r.readFloat32();

                        let nx = 0, ny = 1, nz = 0;
                        if (hasNormals) {
                            nx = r.readFloat32();
                            ny = r.readFloat32();
                            nz = r.readFloat32();
                        }

                        let cr = 1, cg = 1, cb = 1, ca = 1;
                        if (hasColors) {
                            cr = r.readFloat32();
                            cg = r.readFloat32();
                            cb = r.readFloat32();
                            ca = r.readFloat32();
                        }

                        let u = 0, v = 0;
                        for (let s = 0; s < texCoordSets; s++) {
                            const coords = [];
                            for (let c = 0; c < texCoordSetSize; c++) {
                                coords.push(r.readFloat32());
                            }
                            if (s === 0) {
                                u = coords[0] !== undefined ? coords[0] : 0;
                                v = coords[1] !== undefined ? coords[1] : 0;
                            }
                        }

                        meshData.vertices.push({
                            x: vx, y: vy, z: vz,
                            nx, ny, nz,
                            r: cr, g: cg, b: cb, a: ca,
                            u, v
                        });
                    }
                } else if (mTag === 'TRIS') {
                    const triBrushId = r.readInt32();
                    const triangles = [];
                    while (r.offset < mEnd) {
                        const i0 = r.readInt32();
                        const i1 = r.readInt32();
                        const i2 = r.readInt32();
                        triangles.push([i0, i1, i2]);
                    }
                    meshData.trisList.push({
                        brushId: triBrushId,
                        triangles
                    });
                } else {
                    r.offset = mEnd;
                }
            }
            return meshData;
        }

        // --- Build into Blockbench Outliner & Scene ---
        if (!Format || !Format.meshes) {
            if (typeof Formats !== 'undefined' && Formats.free) {
                Formats.free.select();
            }
        }

        if (filePath && typeof pathToName === 'function') {
            const base = pathToName(filePath, false);
            if (base && (!Project.name || Project.name === 'model')) {
                Project.name = base;
            }
        }

        // 1. Determine Texture Dimensions
        const isApp = typeof window !== 'undefined' && window.isApp;
        const fs = (isApp && typeof require === 'function') ? require('fs') : null;
        let fileDir = '';
        if (filePath) {
            fileDir = filePath.substring(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1);
        }

        let detectedWidth = null;
        let detectedHeight = null;

        // Check if any texture file exists on disk and read its exact dimensions
        if (fs && fileDir && parsedTextures.length > 0) {
            for (const tInfo of parsedTextures) {
                if (!tInfo.file) continue;
                const fullPath = fileDir + tInfo.file;
                const dims = readImageDimensionsFromFile(fullPath, fs);
                if (dims) {
                    detectedWidth = dims.width;
                    detectedHeight = dims.height;
                    break;
                }
            }
        }

        // If not found on disk, check if existing project textures or Project resolution has a high-res size
        if (!detectedWidth || !detectedHeight) {
            if (Project.texture_width && Project.texture_width > 16 && Project.texture_height && Project.texture_height > 16) {
                detectedWidth = Project.texture_width;
                detectedHeight = Project.texture_height;
            } else {
                // Default to 512 for standard 3D game models (instead of Minecraft's 16x16 default)
                detectedWidth = 512;
                detectedHeight = 512;
            }
        }

        // Apply detected resolution to Project
        Project.texture_width = detectedWidth;
        Project.texture_height = detectedHeight;

        // 2. Link & Load Textures
        const loadedTextures = [];

        for (let i = 0; i < parsedTextures.length; i++) {
            const tInfo = parsedTextures[i];
            const rawFileName = tInfo.file ? tInfo.file.split(/[/\\]/).pop() : `texture_${i}.png`;
            let existingTex = Project.textures ? Project.textures.find(t => t.name === rawFileName) : null;

            if (existingTex) {
                if (existingTex.width > 0 && existingTex.height > 0) {
                    detectedWidth = existingTex.width;
                    detectedHeight = existingTex.height;
                    Project.texture_width = detectedWidth;
                    Project.texture_height = detectedHeight;
                }
                loadedTextures.push(existingTex);
            } else {
                const newTex = new Texture({ name: rawFileName });
                if (fs && fileDir && tInfo.file) {
                    const fullTexPath = fileDir + tInfo.file;
                    try {
                        if (fs.existsSync(fullTexPath)) {
                            newTex.fromPath(fullTexPath);
                        }
                    } catch (e) {}
                }

                // If user uploads or replaces texture later, automatically adjust UVs to the new resolution
                if (newTex.img) {
                    newTex.img.addEventListener('load', () => {
                        const nw = newTex.img.naturalWidth || newTex.width;
                        const nh = newTex.img.naturalHeight || newTex.height;
                        if (nw > 0 && nh > 0) {
                            rescaleModelUVs(nw, nh, newTex.uuid);
                        }
                    });
                }

                newTex.add(false);
                loadedTextures.push(newTex);
            }
        }

        // 3. Map Nodes into Blockbench Groups & Meshes
        function buildNodeInBlockbench(node, parentGroup) {
            let currentGroup = parentGroup;
            const hasChildren = node.children && node.children.length > 0;
            const euler = quatToEulerDegrees(node.rot[0], node.rot[1], node.rot[2], node.rot[3]);

            if (hasChildren || !node.mesh) {
                const group = new Group({
                    name: node.name || 'node',
                    origin: [node.pos[0], node.pos[1], node.pos[2]],
                    rotation: euler
                });
                group.init();
                if (parentGroup) {
                    group.addTo(parentGroup);
                } else {
                    group.addTo();
                }
                currentGroup = group;
            }

            if (node.mesh && node.mesh.vertices.length > 0) {
                const verticesObj = {};
                for (let i = 0; i < node.mesh.vertices.length; i++) {
                    const v = node.mesh.vertices[i];
                    verticesObj[String(i)] = [v.x, v.y, v.z];
                }

                const facesObj = {};
                let faceCounter = 0;
                const texW = detectedWidth;
                const texH = detectedHeight;

                for (const trisBatch of node.mesh.trisList) {
                    const activeBrushId = trisBatch.brushId !== -1 ? trisBatch.brushId : node.mesh.brushId;
                    let targetTexUuid = false;

                    if (activeBrushId >= 0 && activeBrushId < parsedBrushes.length) {
                        const brush = parsedBrushes[activeBrushId];
                        if (brush.texIds && brush.texIds.length > 0) {
                            const tIdx = brush.texIds[0];
                            if (tIdx >= 0 && tIdx < loadedTextures.length) {
                                targetTexUuid = loadedTextures[tIdx].uuid;
                            }
                        }
                    } else if (loadedTextures.length > 0) {
                        targetTexUuid = loadedTextures[0].uuid;
                    }

                    for (const tri of trisBatch.triangles) {
                        const k0 = String(tri[0]);
                        const k1 = String(tri[1]);
                        const k2 = String(tri[2]);

                        const v0 = node.mesh.vertices[tri[0]];
                        const v1 = node.mesh.vertices[tri[1]];
                        const v2 = node.mesh.vertices[tri[2]];
                        if (!v0 || !v1 || !v2) continue;

                        const fKey = 'f_' + (faceCounter++);
                        facesObj[fKey] = {
                            vertices: [k0, k1, k2],
                            uv: {
                                [k0]: [v0.u * texW, v0.v * texH],
                                [k1]: [v1.u * texW, v1.v * texH],
                                [k2]: [v2.u * texW, v2.v * texH]
                            },
                            texture: targetTexUuid
                        };

                        // Store normalized UVs for dynamic rescaling whenever a texture is uploaded
                        facesObj[fKey].b3d_norm_uv = {
                            [k0]: [v0.u, v0.v],
                            [k1]: [v1.u, v1.v],
                            [k2]: [v2.u, v2.v]
                        };
                    }
                }

                const meshOrigin = currentGroup ? [0, 0, 0] : [node.pos[0], node.pos[1], node.pos[2]];
                const meshRotation = currentGroup ? [0, 0, 0] : euler;

                const mesh = new Mesh({
                    name: node.name || 'b3d_mesh',
                    origin: meshOrigin,
                    rotation: meshRotation,
                    vertices: verticesObj,
                    faces: facesObj
                });
                mesh.init();
                if (currentGroup) {
                    mesh.addTo(currentGroup);
                } else {
                    mesh.addTo();
                }
            }

            if (node.children) {
                for (const child of node.children) {
                    buildNodeInBlockbench(child, currentGroup);
                }
            }
        }

        for (const rootNode of parsedNodes) {
            buildNodeInBlockbench(rootNode, null);
        }

        if (typeof Canvas !== 'undefined' && Canvas.updateAll) {
            Canvas.updateAll();
        }
        if (typeof Blockbench !== 'undefined' && Blockbench.showQuickMessage) {
            Blockbench.showQuickMessage('Blitz3D model imported successfully', 2000);
        }
    }

    // =========================================================================
    // 5. Binary Serializer (Export Blockbench to .b3d)
    // =========================================================================
    function serializeB3D(options = {}) {
        const root = new ChunkWriter('BB3D');
        root.writeInt32(1); // Version 1

        // Palette mapping
        const textureMap = new Map();
        const texList = [];

        if (Project.textures && Project.textures.length > 0) {
            for (const tex of Project.textures) {
                let name = tex.name || 'texture';
                if (!name.includes('.')) name += '.png';
                const entry = {
                    index: texList.length,
                    name: name,
                    texture: tex
                };
                textureMap.set(tex.uuid, entry);
                texList.push(entry);
            }
        }

        // 1. Write TEXS Chunk
        if (texList.length > 0) {
            const texsChunk = root.createChild('TEXS');
            for (const t of texList) {
                texsChunk.writeString(t.name);
                texsChunk.writeInt32(1);     // Flags: 1 = Color map
                texsChunk.writeInt32(2);     // Blend: 2 = Multiply
                texsChunk.writeFloat32(0.0); // x_pos
                texsChunk.writeFloat32(0.0); // y_pos
                texsChunk.writeFloat32(1.0); // x_scale
                texsChunk.writeFloat32(1.0); // y_scale
                texsChunk.writeFloat32(0.0); // rotation
            }

            // 2. Write BRUS Chunk
            const brusChunk = root.createChild('BRUS');
            brusChunk.writeInt32(1); // n_texs = 1
            for (const t of texList) {
                brusChunk.writeString('brush_' + t.index);
                brusChunk.writeFloat32(1.0); // red
                brusChunk.writeFloat32(1.0); // green
                brusChunk.writeFloat32(1.0); // blue
                brusChunk.writeFloat32(1.0); // alpha
                brusChunk.writeFloat32(0.0); // shininess
                brusChunk.writeInt32(1);     // blend
                brusChunk.writeInt32(0);     // fx
                brusChunk.writeInt32(t.index); // texture_id
            }
        }

        function extractMeshTriangles(mesh) {
            const triangles = [];

            for (const fKey in mesh.faces) {
                const face = mesh.faces[fKey];
                if (!face || !face.vertices || face.vertices.length < 3) continue;

                let brushId = -1;
                let faceTex = null;

                if (face.texture && textureMap.has(face.texture)) {
                    const entry = textureMap.get(face.texture);
                    brushId = entry.index;
                    faceTex = entry.texture;
                } else if (texList.length > 0 && face.texture !== false) {
                    brushId = 0;
                    faceTex = texList[0].texture;
                }

                // Determine resolution for normalizing UVs
                const curW = (faceTex && faceTex.width > 0) ? faceTex.width : (Project.texture_width || 512);
                const curH = (faceTex && faceTex.height > 0) ? faceTex.height : (Project.texture_height || 512);

                const faceVerts = face.vertices;
                // Fan triangulation for polygons
                for (let i = 1; i < faceVerts.length - 1; i++) {
                    const k0 = faceVerts[0];
                    const k1 = faceVerts[i];
                    const k2 = faceVerts[i + 1];

                    const p0 = mesh.vertices[k0];
                    const p1 = mesh.vertices[k1];
                    const p2 = mesh.vertices[k2];
                    if (!p0 || !p1 || !p2) continue;

                    let u0, v0, u1, v1, u2, v2;

                    // If face has cached normalized UVs, use them directly to avoid any floating point drift
                    if (face.b3d_norm_uv && face.b3d_norm_uv[k0] && face.b3d_norm_uv[k1] && face.b3d_norm_uv[k2]) {
                        u0 = face.b3d_norm_uv[k0][0]; v0 = face.b3d_norm_uv[k0][1];
                        u1 = face.b3d_norm_uv[k1][0]; v1 = face.b3d_norm_uv[k1][1];
                        u2 = face.b3d_norm_uv[k2][0]; v2 = face.b3d_norm_uv[k2][1];
                    } else {
                        const uv0 = (face.uv && face.uv[k0]) ? face.uv[k0] : [0, 0];
                        const uv1 = (face.uv && face.uv[k1]) ? face.uv[k1] : [0, 0];
                        const uv2 = (face.uv && face.uv[k2]) ? face.uv[k2] : [0, 0];
                        u0 = uv0[0] / curW; v0 = uv0[1] / curH;
                        u1 = uv1[0] / curW; v1 = uv1[1] / curH;
                        u2 = uv2[0] / curW; v2 = uv2[1] / curH;
                    }

                    triangles.push({
                        brushId,
                        v0: { x: p0[0], y: p0[1], z: p0[2], u: u0, v: v0 },
                        v1: { x: p1[0], y: p1[1], z: p1[2], u: u1, v: v1 },
                        v2: { x: p2[0], y: p2[1], z: p2[2], u: u2, v: v2 }
                    });
                }
            }
            return triangles;
        }

        function extractCubeTriangles(cube) {
            const triangles = [];

            const x1 = cube.from[0], y1 = cube.from[1], z1 = cube.from[2];
            const x2 = cube.to[0], y2 = cube.to[1], z2 = cube.to[2];

            const faceDefs = {
                north: { corners: [[x2, y1, z1], [x1, y1, z1], [x1, y2, z1], [x2, y2, z1]] },
                south: { corners: [[x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2]] },
                east:  { corners: [[x2, y1, z2], [x2, y1, z1], [x2, y2, z1], [x2, y2, z2]] },
                west:  { corners: [[x1, y1, z1], [x1, y1, z2], [x1, y2, z2], [x1, y2, z1]] },
                up:    { corners: [[x1, y2, z1], [x1, y2, z2], [x2, y2, z2], [x2, y2, z1]] },
                down:  { corners: [[x1, y1, z2], [x1, y1, z1], [x2, y1, z1], [x2, y1, z2]] }
            };

            for (const side in faceDefs) {
                const cFace = cube.faces[side];
                if (!cFace) continue;

                let brushId = -1;
                let cubeTex = null;

                if (cFace.texture && textureMap.has(cFace.texture)) {
                    const entry = textureMap.get(cFace.texture);
                    brushId = entry.index;
                    cubeTex = entry.texture;
                } else if (texList.length > 0 && cFace.texture !== null && cFace.texture !== false) {
                    brushId = 0;
                    cubeTex = texList[0].texture;
                }

                const curW = (cubeTex && cubeTex.width > 0) ? cubeTex.width : (Project.texture_width || 512);
                const curH = (cubeTex && cubeTex.height > 0) ? cubeTex.height : (Project.texture_height || 512);

                const corners = faceDefs[side].corners;
                const cuv = cFace.uv || [0, 0, 16, 16];
                const u1 = cuv[0] / curW, v1 = cuv[1] / curH;
                const u2 = cuv[2] / curW, v2 = cuv[3] / curH;

                const uvs = [
                    [u1, v2],
                    [u2, v2],
                    [u2, v1],
                    [u1, v1]
                ];

                triangles.push({
                    brushId,
                    v0: { x: corners[0][0], y: corners[0][1], z: corners[0][2], u: uvs[0][0], v: uvs[0][1] },
                    v1: { x: corners[1][0], y: corners[1][1], z: corners[1][2], u: uvs[1][0], v: uvs[1][1] },
                    v2: { x: corners[2][0], y: corners[2][1], z: corners[2][2], u: uvs[2][0], v: uvs[2][1] }
                });
                triangles.push({
                    brushId,
                    v0: { x: corners[0][0], y: corners[0][1], z: corners[0][2], u: uvs[0][0], v: uvs[0][1] },
                    v1: { x: corners[2][0], y: corners[2][1], z: corners[2][2], u: uvs[2][0], v: uvs[2][1] },
                    v2: { x: corners[3][0], y: corners[3][1], z: corners[3][2], u: uvs[3][0], v: uvs[3][1] }
                });
            }
            return triangles;
        }

        function buildMeshChunk(nodeChunk, triangles) {
            if (!triangles || triangles.length === 0) return;

            // Compute triangle normals
            for (const tri of triangles) {
                const ax = tri.v1.x - tri.v0.x, ay = tri.v1.y - tri.v0.y, az = tri.v1.z - tri.v0.z;
                const bx = tri.v2.x - tri.v0.x, by = tri.v2.y - tri.v0.y, bz = tri.v2.z - tri.v0.z;
                let nx = ay * bz - az * by;
                let ny = az * bx - ax * bz;
                let nz = ax * by - ay * bx;
                const len = Math.hypot(nx, ny, nz);
                if (len > 0.00001) {
                    nx /= len; ny /= len; nz /= len;
                } else {
                    nx = 0; ny = 1; nz = 0;
                }
                tri.nx = nx; tri.ny = ny; tri.nz = nz;
            }

            // Deduplicate vertices into VRTS chunk
            const vertexList = [];
            const vertexMap = new Map();

            function getVertexIndex(v, nx, ny, nz) {
                const key = `${v.x.toFixed(4)}_${v.y.toFixed(4)}_${v.z.toFixed(4)}_${v.u.toFixed(5)}_${v.v.toFixed(5)}_${nx.toFixed(3)}_${ny.toFixed(3)}_${nz.toFixed(3)}`;
                if (vertexMap.has(key)) {
                    return vertexMap.get(key);
                }
                const idx = vertexList.length;
                vertexList.push({
                    x: v.x, y: v.y, z: v.z,
                    nx, ny, nz,
                    u: v.u, v: v.v
                });
                vertexMap.set(key, idx);
                return idx;
            }

            // Group triangles by brushId
            const brushTriangles = new Map();
            for (const tri of triangles) {
                const bId = tri.brushId !== undefined ? tri.brushId : -1;
                if (!brushTriangles.has(bId)) {
                    brushTriangles.set(bId, []);
                }
                const i0 = getVertexIndex(tri.v0, tri.nx, tri.ny, tri.nz);
                const i1 = getVertexIndex(tri.v1, tri.nx, tri.ny, tri.nz);
                const i2 = getVertexIndex(tri.v2, tri.nx, tri.ny, tri.nz);
                brushTriangles.get(bId).push([i0, i1, i2]);
            }

            // 3. Write MESH Chunk
            const meshChunk = nodeChunk.createChild('MESH');
            meshChunk.writeInt32(-1); // Default brush_id

            // 4. Write VRTS Chunk
            const vrtsChunk = meshChunk.createChild('VRTS');
            vrtsChunk.writeInt32(1); // Flags: 1 = Normals present
            vrtsChunk.writeInt32(1); // tex_coord_sets = 1
            vrtsChunk.writeInt32(2); // tex_coord_set_size = 2 (u, v)

            for (const vert of vertexList) {
                vrtsChunk.writeFloat32(vert.x);
                vrtsChunk.writeFloat32(vert.y);
                vrtsChunk.writeFloat32(vert.z);
                vrtsChunk.writeFloat32(vert.nx);
                vrtsChunk.writeFloat32(vert.ny);
                vrtsChunk.writeFloat32(vert.nz);
                vrtsChunk.writeFloat32(vert.u);
                vrtsChunk.writeFloat32(vert.v);
            }

            // 5. Write TRIS Chunks
            for (const [bId, tris] of brushTriangles) {
                const trisChunk = meshChunk.createChild('TRIS');
                trisChunk.writeInt32(bId);
                for (const [i0, i1, i2] of tris) {
                    trisChunk.writeInt32(i0);
                    trisChunk.writeInt32(i1);
                    trisChunk.writeInt32(i2);
                }
            }
        }

        function serializeOutlinerItem(item, parentNodeChunk) {
            if (typeof Group !== 'undefined' && item instanceof Group) {
                const quat = eulerDegreesToQuat(item.rotation[0], item.rotation[1], item.rotation[2]);
                const nodeChunk = parentNodeChunk.createChild('NODE');
                nodeChunk.writeString(item.name || 'group');
                nodeChunk.writeFloat32(item.origin[0] || 0);
                nodeChunk.writeFloat32(item.origin[1] || 0);
                nodeChunk.writeFloat32(item.origin[2] || 0);
                nodeChunk.writeFloat32(1.0); // scale x
                nodeChunk.writeFloat32(1.0); // scale y
                nodeChunk.writeFloat32(1.0); // scale z
                nodeChunk.writeFloat32(quat[0]); // quat w
                nodeChunk.writeFloat32(quat[1]); // quat x
                nodeChunk.writeFloat32(quat[2]); // quat y
                nodeChunk.writeFloat32(quat[3]); // quat z

                if (item.children && item.children.length > 0) {
                    for (const child of item.children) {
                        serializeOutlinerItem(child, nodeChunk);
                    }
                }
            } else if (typeof Mesh !== 'undefined' && item instanceof Mesh) {
                const rot = item.rotation || [0, 0, 0];
                const origin = item.origin || [0, 0, 0];
                const quat = eulerDegreesToQuat(rot[0], rot[1], rot[2]);

                const nodeChunk = parentNodeChunk.createChild('NODE');
                nodeChunk.writeString(item.name || 'mesh');
                nodeChunk.writeFloat32(origin[0] || 0);
                nodeChunk.writeFloat32(origin[1] || 0);
                nodeChunk.writeFloat32(origin[2] || 0);
                nodeChunk.writeFloat32(1.0);
                nodeChunk.writeFloat32(1.0);
                nodeChunk.writeFloat32(1.0);
                nodeChunk.writeFloat32(quat[0]);
                nodeChunk.writeFloat32(quat[1]);
                nodeChunk.writeFloat32(quat[2]);
                nodeChunk.writeFloat32(quat[3]);

                const tris = extractMeshTriangles(item);
                buildMeshChunk(nodeChunk, tris);
            } else if (typeof Cube !== 'undefined' && item instanceof Cube) {
                const rot = item.rotation || [0, 0, 0];
                const origin = item.origin || [0, 0, 0];
                const quat = eulerDegreesToQuat(rot[0], rot[1], rot[2]);

                const nodeChunk = parentNodeChunk.createChild('NODE');
                nodeChunk.writeString(item.name || 'cube');
                nodeChunk.writeFloat32(origin[0] || 0);
                nodeChunk.writeFloat32(origin[1] || 0);
                nodeChunk.writeFloat32(origin[2] || 0);
                nodeChunk.writeFloat32(1.0);
                nodeChunk.writeFloat32(1.0);
                nodeChunk.writeFloat32(1.0);
                nodeChunk.writeFloat32(quat[0]);
                nodeChunk.writeFloat32(quat[1]);
                nodeChunk.writeFloat32(quat[2]);
                nodeChunk.writeFloat32(quat[3]);

                const tris = extractCubeTriangles(item);
                buildMeshChunk(nodeChunk, tris);
            }
        }

        // Top-level scene node
        const rootNodeChunk = root.createChild('NODE');
        rootNodeChunk.writeString(Project.name || 'root');
        rootNodeChunk.writeFloat32(0.0);
        rootNodeChunk.writeFloat32(0.0);
        rootNodeChunk.writeFloat32(0.0);
        rootNodeChunk.writeFloat32(1.0);
        rootNodeChunk.writeFloat32(1.0);
        rootNodeChunk.writeFloat32(1.0);
        rootNodeChunk.writeFloat32(1.0); // quat w
        rootNodeChunk.writeFloat32(0.0); // quat x
        rootNodeChunk.writeFloat32(0.0); // quat y
        rootNodeChunk.writeFloat32(0.0); // quat z

        const rootItems = [];
        if (typeof Outliner !== 'undefined' && Outliner.root && Array.isArray(Outliner.root)) {
            rootItems.push(...Outliner.root);
        } else {
            if (typeof Group !== 'undefined' && Group.all) {
                for (const g of Group.all) {
                    if (!g.parent || g.parent === 'root') rootItems.push(g);
                }
            }
            if (typeof Mesh !== 'undefined' && Mesh.all) {
                for (const m of Mesh.all) {
                    if (!m.parent || m.parent === 'root') rootItems.push(m);
                }
            }
            if (typeof Cube !== 'undefined' && Cube.all) {
                for (const c of Cube.all) {
                    if (!c.parent || c.parent === 'root') rootItems.push(c);
                }
            }
        }

        for (const item of rootItems) {
            serializeOutlinerItem(item, rootNodeChunk);
        }

        return root.toArrayBuffer();
    }

    // =========================================================================
    // 6. Blockbench Plugin & Codec Registration
    // =========================================================================
    const pluginRegistration = typeof BBPlugin !== 'undefined' && BBPlugin.register
        ? BBPlugin.register
        : Plugin.register;

    pluginRegistration('blitz3d_format', {
        title: 'Blitz3D (.b3d) Format Support',
        author: 'Antigravity',
        icon: 'view_in_ar',
        description: 'Native import and export support for Blitz3D (.b3d) binary models.',
        version: '1.0.1',
        min_version: '4.0.0',
        variant: 'both',

        onload() {
            // Register Codec
            b3dCodec = new Codec('blitz3d_format', {
                name: 'Blitz3D Model',
                extension: 'b3d',
                remember: true,
                load_filter: {
                    type: 'binary',
                    extensions: ['b3d']
                },

                compile(options) {
                    return serializeB3D(options);
                },

                parse(data, path) {
                    const ab = ensureArrayBuffer(data);
                    parseB3D(ab, path);
                },

                write(content, path) {
                    return content instanceof ArrayBuffer ? content : serializeB3D();
                },

                export(options, callback) {
                    const arrayBuffer = serializeB3D(options);
                    const defaultName = (Project.name || 'model');
                    const isApp = typeof window !== 'undefined' && window.isApp;

                    // Desktop App (Electron)
                    if (isApp && typeof require === 'function') {
                        try {
                            const fs = require('fs');
                            Blockbench.export({
                                resource_id: 'blitz3d_format',
                                type: 'Blitz3D Model',
                                extensions: ['b3d'],
                                name: defaultName,
                                content: arrayBuffer,
                                savetype: 'binary',
                                custom_writer: (content, filePath) => {
                                    fs.writeFileSync(filePath, Buffer.from(content));
                                }
                            }, (realPath) => {
                                if (typeof callback === 'function') callback(realPath);
                                Blockbench.showQuickMessage('Exported Blitz3D model successfully', 2000);
                            });
                            return;
                        } catch (e) {
                            console.warn('Native export write error, falling back to standard dialog:', e);
                        }
                    }

                    // Standard Blockbench export dialog
                    if (typeof Blockbench !== 'undefined' && Blockbench.export) {
                        Blockbench.export({
                            resource_id: 'blitz3d_format',
                            type: 'Blitz3D Model',
                            extensions: ['b3d'],
                            name: defaultName,
                            content: arrayBuffer,
                            savetype: 'binary'
                        }, (realPath) => {
                            if (typeof callback === 'function') callback(realPath);
                            Blockbench.showQuickMessage('Exported Blitz3D model successfully', 2000);
                        });
                    } else {
                        // Web fallback using Blob download
                        const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = defaultName + '.b3d';
                        a.click();
                        URL.revokeObjectURL(url);
                        if (typeof callback === 'function') callback(defaultName + '.b3d');
                        Blockbench.showQuickMessage('Exported Blitz3D model successfully', 2000);
                    }
                }
            });

            // Register File > Export > Blitz3D (.b3d)
            exportAction = new Action('export_b3d', {
                name: 'Export Blitz3D (.b3d)',
                description: 'Export model to Blitz3D (.b3d) binary format',
                icon: 'view_in_ar',
                category: 'file',
                condition: () => (typeof Modes !== 'undefined' && Modes.edit) || (typeof Project !== 'undefined' && Project !== null),
                click() {
                    b3dCodec.export();
                }
            });
            MenuBar.addAction(exportAction, 'file.export');

            // Register File > Import > Blitz3D (.b3d)
            importAction = new Action('import_b3d', {
                name: 'Import Blitz3D (.b3d)',
                description: 'Import Blitz3D (.b3d) binary model file',
                icon: 'view_in_ar',
                category: 'file',
                condition: () => true,
                click() {
                    Blockbench.import({
                        extensions: ['b3d'],
                        type: 'Blitz3D Model',
                        readtype: 'buffer'
                    }, (files) => {
                        if (files && files.length > 0) {
                            const file = files[0];
                            b3dCodec.parse(file.content, file.path);
                        }
                    });
                }
            });
            MenuBar.addAction(importAction, 'file.import');

            // Register Utility: Tools > Match Blitz3D UVs to Texture
            rescaleAction = new Action('match_b3d_uv', {
                name: 'Match Blitz3D UVs to Texture',
                description: 'Rescale model UV coordinates to match the current texture resolution (e.g. 512x512)',
                icon: 'aspect_ratio',
                category: 'tools',
                condition: () => (typeof Project !== 'undefined' && Project !== null),
                click() {
                    let targetW = 512;
                    let targetH = 512;
                    let targetUuid = null;

                    if (typeof Texture !== 'undefined' && Texture.selected) {
                        targetW = Texture.selected.width || 512;
                        targetH = Texture.selected.height || 512;
                        targetUuid = Texture.selected.uuid;
                    } else if (Project.textures && Project.textures.length > 0) {
                        const tex = Project.textures[0];
                        targetW = tex.width || 512;
                        targetH = tex.height || 512;
                        targetUuid = tex.uuid;
                    }

                    rescaleModelUVs(targetW, targetH, targetUuid);
                    Blockbench.showQuickMessage(`UV coordinates scaled to ${targetW}x${targetH}`, 2000);
                }
            });
            MenuBar.addAction(rescaleAction, 'tools');

            // Automatic listener when a texture is uploaded, added, or changed in Blockbench (Blitz3D meshes only)
            if (typeof Blockbench !== 'undefined' && typeof Blockbench.on === 'function') {
                textureEventListener = (data) => {
                    const tex = data && data.texture ? data.texture : data;
                    if (!tex || !hasB3DMeshes(tex.uuid)) return;
                    const applyDims = () => {
                        if (!hasB3DMeshes(tex.uuid)) return;
                        const w = tex.width;
                        const h = tex.height;
                        if (w > 0 && h > 0) {
                            rescaleModelUVs(w, h, tex.uuid);
                        }
                    };
                    applyDims();
                    if (tex.img && typeof tex.img.addEventListener === 'function' && !tex.img._b3dLoadBound) {
                        tex.img._b3dLoadBound = true;
                        tex.img.addEventListener('load', applyDims);
                    }
                };
                Blockbench.on('add_texture', textureEventListener);
                Blockbench.on('update_texture', textureEventListener);
                Blockbench.on('change_texture', textureEventListener);
            }
        },

        onunload() {
            if (exportAction) exportAction.delete();
            if (importAction) importAction.delete();
            if (rescaleAction) rescaleAction.delete();
            if (b3dCodec) b3dCodec.delete();
            if (textureEventListener && typeof Blockbench !== 'undefined' && typeof Blockbench.removeListener === 'function') {
                Blockbench.removeListener('add_texture', textureEventListener);
                Blockbench.removeListener('update_texture', textureEventListener);
                Blockbench.removeListener('change_texture', textureEventListener);
            }
        }
    });
})();

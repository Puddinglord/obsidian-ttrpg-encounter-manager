// A tiny PNG reader/writer for tests: 8-bit, non-interlaced, grey / RGB / grey+alpha / RGBA / palette.
// Enough to load the sample maps and to write debug images; not a general decoder.
import { unzlibSync, zlibSync } from 'fflate';
import type { GrayImage } from '../src/grid-detect';

export interface Png { width: number; height: number; channels: number; data: Uint8Array }

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function decodePng(buf: Uint8Array): Png {
	const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	let p = 8;
	let width = 0, height = 0, colorType = 0, palette: Uint8Array | null = null;
	const idat: Uint8Array[] = [];
	while (p < buf.length) {
		const len = dv.getUint32(p);
		const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
		const body = buf.subarray(p + 8, p + 8 + len);
		if (type === 'IHDR') {
			width = dv.getUint32(p + 8);
			height = dv.getUint32(p + 12);
			if (body[8] !== 8) throw new Error(`PNG bit depth ${body[8]} not supported`);
			colorType = body[9];
			if (body[12] !== 0) throw new Error('Interlaced PNG not supported');
		} else if (type === 'PLTE') palette = body;
		else if (type === 'IDAT') idat.push(body);
		else if (type === 'IEND') break;
		p += 12 + len;
	}
	const total = idat.reduce((n, c) => n + c.length, 0);
	const z = new Uint8Array(total);
	let o = 0;
	for (const c of idat) { z.set(c, o); o += c.length; }
	const raw = unzlibSync(z);
	const bpp = CHANNELS[colorType];
	if (!bpp) throw new Error(`PNG colour type ${colorType} not supported`);
	const stride = width * bpp;
	const out = new Uint8Array(stride * height);
	for (let y = 0; y < height; y++) {
		const f = raw[y * (stride + 1)];
		const src = y * (stride + 1) + 1;
		const row = y * stride;
		const prev = row - stride;
		for (let i = 0; i < stride; i++) {
			const x = raw[src + i];
			const a = i >= bpp ? out[row + i - bpp] : 0;
			const b = y > 0 ? out[prev + i] : 0;
			const c = i >= bpp && y > 0 ? out[prev + i - bpp] : 0;
			let v: number;
			switch (f) {
				case 0: v = x; break;
				case 1: v = x + a; break;
				case 2: v = x + b; break;
				case 3: v = x + ((a + b) >> 1); break;
				case 4: {
					const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
					v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
					break;
				}
				default: throw new Error(`PNG filter ${f} not supported`);
			}
			out[row + i] = v & 255;
		}
	}
	if (colorType === 3 && palette) {
		const rgb = new Uint8Array(width * height * 3);
		for (let i = 0; i < width * height; i++) rgb.set(palette.subarray(out[i] * 3, out[i] * 3 + 3), i * 3);
		return { width, height, channels: 3, data: rgb };
	}
	return { width, height, channels: bpp, data: out };
}

/** Luminance 0..1 (Rec. 601 weights; alpha ignored). */
export function toGray(png: Png): GrayImage {
	const { width, height, channels, data: d } = png;
	const g = new Float32Array(width * height);
	for (let i = 0; i < width * height; i++) {
		const k = i * channels;
		g[i] = channels >= 3 ? (0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]) / 255 : d[k] / 255;
	}
	return { data: g, width, height };
}

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** Grey image (0..1) to an 8-bit greyscale PNG, for eyeballing test images. */
export function encodeGrayPng(img: GrayImage): Uint8Array {
	const { width, height, data } = img;
	const raw = new Uint8Array((width + 1) * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(data[y * width + x] * 255)));
	}
	const chunk = (type: string, body: Uint8Array) => {
		const out = new Uint8Array(12 + body.length);
		const dv = new DataView(out.buffer);
		dv.setUint32(0, body.length);
		for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
		out.set(body, 8);
		dv.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
		return out;
	};
	const ihdr = new Uint8Array(13);
	const hv = new DataView(ihdr.buffer);
	hv.setUint32(0, width);
	hv.setUint32(4, height);
	ihdr[8] = 8; ihdr[9] = 0;
	const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array(0))];
	const total = parts.reduce((n, c) => n + c.length, 0);
	const png = new Uint8Array(total);
	let o = 0;
	for (const c of parts) { png.set(c, o); o += c.length; }
	return png;
}

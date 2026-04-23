import sharp from "sharp";

export const HASH_SIZE = 16; // 256-bit dhash
export const CANONICAL_W = 600;
export const CANONICAL_H = 840;

// Matches project-o's roi_config.json `art_crop` — the dominant-artwork
// region of a flat-framed card. Defined as relative offsets so it survives
// any canonical resize.
export const ART_ROI = {
  y1: 0.1,
  y2: 0.72,
  x1: 0.05,
  x2: 0.95,
};

/**
 * Compute a perceptual dhash from an image buffer.
 *
 * Pipeline:
 *   1. Resize to canonical 600×840 (fill — user is expected to frame the
 *      card tightly; we don't attempt quadrilateral detection in v1).
 *   2. Crop the relative art ROI so two cards with the same frame but
 *      different artwork are distinguishable.
 *   3. Resize the art to (HASH_SIZE+1 × HASH_SIZE), greyscale.
 *   4. dhash: 1 bit per pixel-pair comparing left vs. right neighbour.
 *
 * The hash is the concatenation of those bits rendered as a hex string.
 * Both catalog-time hashing and scan-time hashing go through this same
 * function — cross-process consistency is what matters, not matching
 * project-o's Python output byte-for-byte.
 */
export async function dhash(input: Buffer): Promise<string> {
  const canonical = await sharp(input)
    .resize(CANONICAL_W, CANONICAL_H, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .toBuffer();

  const artLeft = Math.round(CANONICAL_W * ART_ROI.x1);
  const artTop = Math.round(CANONICAL_H * ART_ROI.y1);
  const artWidth = Math.round(CANONICAL_W * (ART_ROI.x2 - ART_ROI.x1));
  const artHeight = Math.round(CANONICAL_H * (ART_ROI.y2 - ART_ROI.y1));

  const raw = await sharp(canonical)
    .extract({ left: artLeft, top: artTop, width: artWidth, height: artHeight })
    .resize(HASH_SIZE + 1, HASH_SIZE, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .greyscale()
    .raw()
    .toBuffer();

  const bits: number[] = [];
  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      const i = y * (HASH_SIZE + 1) + x;
      bits.push(raw[i] > raw[i + 1] ? 1 : 0);
    }
  }

  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j++) nibble = (nibble << 1) | bits[i + j];
    hex += nibble.toString(16);
  }
  return hex;
}

const POPCOUNT_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let c = 0;
  let n = i;
  while (n) {
    c += n & 1;
    n >>= 1;
  }
  POPCOUNT_TABLE[i] = c;
}

/** Hamming distance between two equal-length lowercase-hex hashes. */
export function hamming(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error(`hamming: length mismatch ${a.length} vs ${b.length}`);
  }
  let d = 0;
  for (let i = 0; i < a.length; i += 2) {
    const ai = parseInt(a.slice(i, i + 2), 16);
    const bi = parseInt(b.slice(i, i + 2), 16);
    d += POPCOUNT_TABLE[ai ^ bi];
  }
  return d;
}

export const MAX_HAMMING = HASH_SIZE * HASH_SIZE; // 256 for hash_size=16

export function confidence(hammingDist: number): number {
  return 1 - hammingDist / MAX_HAMMING;
}

/** Fetch an image URL and return the raw bytes. Honest UA for upstream. */
export async function fetchImageBuffer(url: string, userAgent: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      Accept: "image/png,image/jpeg,image/*",
    },
  });
  if (!res.ok) {
    throw new Error(`image fetch failed: ${res.status} ${res.statusText} ${url}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

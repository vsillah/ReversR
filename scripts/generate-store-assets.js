const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join('docs', 'store-assets');
const FEATURE_GRAPHIC_PATH = path.join(OUT_DIR, 'google-play-feature-graphic.png');
const WIDTH = 1024;
const HEIGHT = 500;

const color = (hex) => {
  const normalized = hex.replace('#', '');
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
};

const setPixel = (pixels, x, y, rgb) => {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const index = (y * WIDTH + x) * 3;
  pixels[index] = rgb[0];
  pixels[index + 1] = rgb[1];
  pixels[index + 2] = rgb[2];
};

const fillRect = (pixels, x, y, width, height, rgb) => {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      setPixel(pixels, col, row, rgb);
    }
  }
};

const strokeRect = (pixels, x, y, width, height, rgb, thickness = 3) => {
  fillRect(pixels, x, y, width, thickness, rgb);
  fillRect(pixels, x, y + height - thickness, width, thickness, rgb);
  fillRect(pixels, x, y, thickness, height, rgb);
  fillRect(pixels, x + width - thickness, y, thickness, height, rgb);
};

const fillCircle = (pixels, centerX, centerY, radius, rgb) => {
  const radiusSquared = radius * radius;
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if ((dx * dx) + (dy * dy) <= radiusSquared) setPixel(pixels, x, y, rgb);
    }
  }
};

const drawLine = (pixels, startX, startY, endX, endY, rgb, thickness = 2) => {
  const dx = Math.abs(endX - startX);
  const sx = startX < endX ? 1 : -1;
  const dy = -Math.abs(endY - startY);
  const sy = startY < endY ? 1 : -1;
  let error = dx + dy;
  let x = startX;
  let y = startY;

  while (true) {
    fillCircle(pixels, x, y, Math.max(1, Math.floor(thickness / 2)), rgb);
    if (x === endX && y === endY) break;
    const e2 = 2 * error;
    if (e2 >= dy) {
      error += dy;
      x += sx;
    }
    if (e2 <= dx) {
      error += dx;
      y += sy;
    }
  }
};

const pngChunk = (type, data) => {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  const checksum = crc32(Buffer.concat([typeBuffer, data]));
  crc.writeUInt32BE(checksum >>> 0, 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
};

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const writePng = (filePath, pixels) => {
  const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    const rowStart = y * (WIDTH * 3 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * WIDTH * 3, (y + 1) * WIDTH * 3);
  }

  const header = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor, no alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    header,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, png);
};

const drawFeatureGraphic = () => {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  const navy = color('#111827');
  const deep = color('#162033');
  const panel = color('#f8fafc');
  const grid = color('#263247');
  const steel = color('#94a3b8');
  const green = color('#22c55e');
  const blue = color('#38bdf8');
  const amber = color('#f59e0b');
  const white = color('#ffffff');
  const darkLine = color('#334155');

  fillRect(pixels, 0, 0, WIDTH, HEIGHT, navy);

  for (let y = 0; y < HEIGHT; y += 1) {
    const shade = Math.floor((y / HEIGHT) * 24);
    for (let x = 0; x < WIDTH; x += 1) {
      const index = (y * WIDTH + x) * 3;
      pixels[index] = Math.min(255, pixels[index] + shade);
      pixels[index + 1] = Math.min(255, pixels[index + 1] + shade);
      pixels[index + 2] = Math.min(255, pixels[index + 2] + shade);
    }
  }

  for (let x = 0; x < WIDTH; x += 40) drawLine(pixels, x, 0, x + 190, HEIGHT, grid, 1);
  for (let y = 20; y < HEIGHT; y += 44) drawLine(pixels, 0, y, WIDTH, y - 80, grid, 1);

  // Left scan card.
  fillRect(pixels, 74, 86, 226, 328, panel);
  strokeRect(pixels, 74, 86, 226, 328, blue, 5);
  fillRect(pixels, 96, 118, 182, 32, deep);
  fillRect(pixels, 96, 174, 182, 132, color('#e2e8f0'));
  strokeRect(pixels, 121, 198, 132, 82, darkLine, 5);
  fillCircle(pixels, 166, 239, 22, amber);
  fillCircle(pixels, 210, 239, 22, green);
  fillRect(pixels, 110, 330, 72, 12, steel);
  fillRect(pixels, 110, 354, 142, 12, steel);
  fillRect(pixels, 110, 378, 112, 12, steel);

  // Center machine outline.
  strokeRect(pixels, 398, 112, 246, 234, green, 6);
  strokeRect(pixels, 432, 152, 178, 128, steel, 5);
  fillRect(pixels, 470, 292, 102, 18, amber);
  fillCircle(pixels, 446, 376, 24, blue);
  fillCircle(pixels, 606, 376, 24, blue);
  drawLine(pixels, 446, 376, 606, 376, steel, 8);
  fillRect(pixels, 504, 186, 54, 42, green);
  fillRect(pixels, 517, 228, 28, 50, darkLine);
  fillCircle(pixels, 532, 254, 12, amber);
  drawLine(pixels, 398, 112, 644, 346, blue, 3);
  drawLine(pixels, 644, 112, 398, 346, blue, 3);

  // Right BOM and vendor handoff card.
  fillRect(pixels, 728, 86, 230, 328, panel);
  strokeRect(pixels, 728, 86, 230, 328, amber, 5);
  fillRect(pixels, 756, 124, 174, 18, deep);
  for (let row = 0; row < 6; row += 1) {
    const y = 172 + row * 36;
    fillCircle(pixels, 766, y + 8, 8, row % 2 ? blue : green);
    fillRect(pixels, 790, y, 116 + (row % 3) * 20, 12, steel);
    fillRect(pixels, 790, y + 18, 74 + (row % 2) * 30, 8, color('#cbd5e1'));
  }
  fillRect(pixels, 760, 366, 166, 24, green);

  // Connecting flow arrows.
  drawLine(pixels, 318, 250, 378, 250, white, 5);
  drawLine(pixels, 378, 250, 362, 236, white, 5);
  drawLine(pixels, 378, 250, 362, 264, white, 5);
  drawLine(pixels, 664, 250, 708, 250, white, 5);
  drawLine(pixels, 708, 250, 692, 236, white, 5);
  drawLine(pixels, 708, 250, 692, 264, white, 5);

  writePng(FEATURE_GRAPHIC_PATH, pixels);
};

drawFeatureGraphic();
console.log(`Generated ${FEATURE_GRAPHIC_PATH} (${WIDTH}x${HEIGHT}, RGB PNG).`);

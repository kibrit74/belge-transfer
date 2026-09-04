/**
 * Renkli QR (Color Matrix) Deneysel Kodlama ve Çözme Motoru
 * 4-Renk Paleti: 00 -> Siyah, 01 -> Kırmızı, 10 -> Yeşil, 11 -> Mavi
 * Her hücre 2 bit veri taşır (Standart QR'a göre 2 kat yoğunluk).
 */

export const COLOR_PALETTE = [
  { bits: 0, hex: "#000000", rgb: [0, 0, 0], label: "Siyah (00)" },
  { bits: 1, hex: "#FF0000", rgb: [255, 0, 0], label: "Kırmızı (01)" },
  { bits: 2, hex: "#00FF00", rgb: [0, 255, 0], label: "Yeşil (10)" },
  { bits: 3, hex: "#0000FF", rgb: [0, 0, 255], label: "Mavi (11)" },
];

/**
 * Bayt dizisini 2-bit parçalara ve renk indekslerine dönüştürür.
 * @param {Uint8Array} bytes 
 * @returns {number[]} Renk indeksleri dizisi (0-3)
 */
export function bytesToColorIndices(bytes) {
  const indices = [];
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    indices.push((b >> 6) & 0x03);
    indices.push((b >> 4) & 0x03);
    indices.push((b >> 2) & 0x03);
    indices.push(b & 0x03);
  }
  return indices;
}

/**
 * 2-bit renk indekslerini tekrar orijinal bayt dizisine dönüştürür.
 * @param {number[]} indices 
 * @returns {Uint8Array}
 */
export function colorIndicesToBytes(indices) {
  const byteCount = Math.floor(indices.length / 4);
  const bytes = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i += 1) {
    const b0 = indices[i * 4] & 0x03;
    const b1 = indices[i * 4 + 1] & 0x03;
    const b2 = indices[i * 4 + 2] & 0x03;
    const b3 = indices[i * 4 + 3] & 0x03;
    bytes[i] = (b0 << 6) | (b1 << 4) | (b2 << 2) | b3;
  }
  return bytes;
}

/**
 * Veri boyutuna uygun kare matris boyutunu hesaplar.
 * @param {number} dataSymbolCount 
 * @returns {number} Grid kenar boyutu (n x n)
 */
export function calculateGridDimension(dataSymbolCount) {
  const minCells = dataSymbolCount + 16; // 16 hücre aralık/köşe hizalama için
  const dim = Math.ceil(Math.sqrt(minCells));
  return Math.max(8, dim % 2 === 0 ? dim + 1 : dim); // Tek sayı gridler simetri için idealdir
}

/**
 * Dosya veya metin verisini üstbilgi (metadata header: name, type) ile paketler.
 * CQF1 başlığı: [4 bayt CQF1] [2 bayt JSON boyutu] [JSON meta] [ham veri]
 */
export function encodeColorQrPackage(payloadBytes, filename = "", mimeType = "") {
  const metadata = {
    v: "CQF1",
    name: filename || "",
    type: mimeType || "",
    size: payloadBytes.length,
  };

  const metadataJson = JSON.stringify(metadata);
  const metadataBytes = new TextEncoder().encode(metadataJson);

  const totalLength = 6 + metadataBytes.length + payloadBytes.length;
  const container = new Uint8Array(totalLength);

  container[0] = 67; // 'C'
  container[1] = 81; // 'Q'
  container[2] = 70; // 'F'
  container[3] = 49; // '1'

  container[4] = (metadataBytes.length >> 8) & 0xff;
  container[5] = metadataBytes.length & 0xff;

  container.set(metadataBytes, 6);
  container.set(payloadBytes, 6 + metadataBytes.length);

  return container;
}

/**
 * Üstbilgi içerikli CQF1 paketini okuyarak orijinal dosya adı, mimeType ve ham veriyi çıkarır.
 */
export function decodeColorQrPackage(containerBytes) {
  if (!containerBytes || containerBytes.length < 6) {
    return { v: "", name: "", type: "", payload: containerBytes || new Uint8Array(0) };
  }

  if (
    containerBytes[0] === 67 &&
    containerBytes[1] === 81 &&
    containerBytes[2] === 70 &&
    containerBytes[3] === 49
  ) {
    try {
      const metaLen = (containerBytes[4] << 8) | containerBytes[5];
      if (6 + metaLen <= containerBytes.length) {
        const metaBytes = containerBytes.subarray(6, 6 + metaLen);
        const metaJson = new TextDecoder().decode(metaBytes);
        const meta = JSON.parse(metaJson);
        let payload = containerBytes.subarray(6 + metaLen);
        if (typeof meta.size === "number" && meta.size >= 0 && 6 + metaLen + meta.size <= containerBytes.length) {
          payload = containerBytes.subarray(6 + metaLen, 6 + metaLen + meta.size);
        }

        return {
          v: meta.v || "CQF1",
          name: meta.name || "",
          type: meta.type || "",
          size: meta.size,
          frame: meta.frame,
          totalFrames: meta.totalFrames,
          isParity: meta.isParity || false,
          paritySrc: meta.paritySrc,
          origLens: meta.origLens,
          payload: payload,
        };
      }
    } catch {
      // Düz ham veri olarak okumaya devam et
    }
  }

  return { v: "", name: "", type: "", payload: containerBytes };
}

/**
 * CQF1 sihirli başlık kontrolü.
 */
function hasCQF1Header(bytes) {
  return (
    bytes &&
    bytes.length >= 6 &&
    bytes[0] === 67 &&  // 'C'
    bytes[1] === 81 &&  // 'Q'
    bytes[2] === 70 &&  // 'F'
    bytes[3] === 49     // '1'
  );
}

/**
 * CQF1 başlığı tespit edildikten sonra tam paketi çıkarır.
 */
function extractCQF1FullPackage(canvas, dim, headBytes, rotation = 0) {
  const metaLen = (headBytes[4] << 8) | headBytes[5];
  let payloadSize = 500;

  if (6 + metaLen <= headBytes.length) {
    try {
      const metaJson = new TextDecoder().decode(headBytes.subarray(6, 6 + metaLen));
      const meta = JSON.parse(metaJson);
      if (meta && typeof meta.size === "number") {
        payloadSize = meta.size;
      }
    } catch {
      // ignore
    }
  }

  const totalBytes = 6 + metaLen + payloadSize;
  const fullBytes = decodeColorQrFromCanvas(canvas, dim, totalBytes, rotation);
  return {
    dimension: dim,
    totalBytes,
    bytes: fullBytes,
  };
}

function getCQF1HeaderMatchScore(bytes) {
  if (!bytes || bytes.length < 4) return 0;
  let matches = 0;
  if (bytes[0] === 67) matches += 1; // 'C'
  if (bytes[1] === 81) matches += 1; // 'Q'
  if (bytes[2] === 70) matches += 1; // 'F'
  if (bytes[3] === 49) matches += 1; // '1'
  return matches / 4;
}

function tryDecodeDimension(canvas, dim, bestHeaderMatch) {
  const rotations = [0, 90, 180, 270];
  for (const rot of rotations) {
    try {
      const headBytes = decodeColorQrFromCanvas(canvas, dim, 64, rot);
      const score = getCQF1HeaderMatchScore(headBytes);
      if (score > bestHeaderMatch.ratio) {
        bestHeaderMatch.ratio = score;
        bestHeaderMatch.dim = dim;
      }
      if (hasCQF1Header(headBytes)) {
        const extracted = extractCQF1FullPackage(canvas, dim, headBytes, rot);
        return {
          ...extracted,
          status: "SUCCESS",
          candidateDim: dim,
          headerMatchRatio: 1.0,
        };
      }
    } catch {
      // sonraki aci
    }
  }
  return null;
}

/**
 * Taranan tuval üzerindeki renkli QR matrisinin kenar boyutunu (N) ve paket başlığını ("CQF1") otomatik tespit eder.
 * Ek olarak 4 açıda (0°, 90°, 180°, 270°) dönüklük kontrolü yapar.
 */
export function autoScanColorQrFromCanvas(canvas) {
  if (!canvas || !canvas.width || !canvas.height || canvas.width <= 0 || canvas.height <= 0) {
    return { status: "INVALID_CANVAS", bytes: null };
  }

  const w = canvas.width;
  const h = canvas.height;
  const bestHeaderMatch = { ratio: 0, dim: null };

  // Strateji 1: Kare veya kareye yakın tuval (yüklenen QR PNG/JPEG görselleri)
  if (Math.abs(w - h) < 10) {
    for (let cs = 1; cs <= 30; cs += 1) {
      const dim = Math.round(w / cs);
      if (dim < 8 || dim > 2000) continue;

      const res = tryDecodeDimension(canvas, dim, bestHeaderMatch);
      if (res) return res;
    }
  }

  // Strateji 2: Kamera akışı ve kırpılmış görseller için öncelikli (sık kullanılan) grid boyutları
  const priorityDims = [
    9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 45, 49,
    53, 57, 61, 65, 73, 81, 97, 113, 129, 145, 161, 193, 225, 257,
  ];

  for (const dim of priorityDims) {
    const res = tryDecodeDimension(canvas, dim, bestHeaderMatch);
    if (res) return res;
  }

  // Strateji 3: Kalan tüm tek sayı grid boyutları (9-257)
  const testedDims = new Set(priorityDims);
  for (let dim = 9; dim <= 257; dim += 2) {
    if (testedDims.has(dim)) continue;
    const res = tryDecodeDimension(canvas, dim, bestHeaderMatch);
    if (res) return res;
  }

  if (bestHeaderMatch.ratio >= 0.5) {
    return {
      status: "HEADER_MISMATCH",
      bytes: null,
      candidateDim: bestHeaderMatch.dim,
      headerMatchRatio: bestHeaderMatch.ratio,
    };
  }

  if (bestHeaderMatch.dim) {
    return {
      status: "MATRIX_DETECTED",
      bytes: null,
      candidateDim: bestHeaderMatch.dim,
      headerMatchRatio: bestHeaderMatch.ratio,
    };
  }

  return { status: "NO_MATRIX", bytes: null };
}

/**
 * En yakın palet rengini tespit eder.
 * Kameradan ekran taramasında ışık, parlaklık ve beyaz dengesi değişimlerine karşı
 * kanal baskınlığı (channel dominance) ve uyarlanabilir siyah eşiği kullanır.
 * @param {number} r 
 * @param {number} g 
 * @param {number} b 
 * @returns {number} Renk indeksi (0: Siyah, 1: Kırmızı, 2: Yeşil, 3: Mavi)
 */
export function classifyRgbToColorIndex(r, g, b) {
  const maxVal = Math.max(r, g, b);
  const minVal = Math.min(r, g, b);
  const sumVal = r + g + b;
  const chroma = maxVal - minVal;

  // Siyah Tespiti (Karanlık/gri pikseller):
  // Ekran veya kameradaki parlaklık/maruz kalma kaymalarına dayanıklı siyah eşiği
  if (sumVal < 165 || (chroma < 40 && maxVal < 140)) {
    return 0; // Siyah (00)
  }

  // Baskın Renk Tespiti (Kırmızı, Yeşil, Mavi):
  if (r > g && r > b) {
    return 1; // Kırmızı (01)
  }
  if (g > r && g > b) {
    return 2; // Yeşil (10)
  }
  if (b > r && b > g) {
    return 3; // Mavi (11)
  }

  // Eşitlik durumlarında Euclidean mesafe yedeği
  let minDistanceSq = Infinity;
  let bestIndex = 0;
  for (let i = 0; i < COLOR_PALETTE.length; i += 1) {
    const paletteRgb = COLOR_PALETTE[i].rgb;
    const dr = r - paletteRgb[0];
    const dg = g - paletteRgb[1];
    const db = b - paletteRgb[2];
    const distSq = dr * dr + dg * dg + db * db;
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * Verilen Uint8Array verisini Canvas üzerine Renkli QR matrisi olarak çizer.
 * @param {HTMLCanvasElement} canvas 
 * @param {Uint8Array} bytes 
 * @param {object} options 
 */
export function renderColorQrToCanvas(canvas, bytes, options = {}) {
  const indices = bytesToColorIndices(bytes);
  const dimension = calculateGridDimension(indices.length);
  const requestedCellSize = options.cellSize || Math.max(1, Math.floor((options.size || 400) / dimension));
  const maxCanvasDimension = options.maxCanvasSize || 4096;

  // Tuval boyutlarının tarayıcı bellek sınırlarını aşmasını önler
  let cellSize = requestedCellSize;
  if (dimension * cellSize > maxCanvasDimension) {
    cellSize = Math.max(1, Math.floor(maxCanvasDimension / dimension));
  }

  const size = Math.max(1, dimension * cellSize);

  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, size, size);

  let dataIdx = 0;
  for (let row = 0; row < dimension; row += 1) {
    for (let col = 0; col < dimension; col += 1) {
      let colorObj = COLOR_PALETTE[0];
      if (dataIdx < indices.length) {
        colorObj = COLOR_PALETTE[indices[dataIdx]];
        dataIdx += 1;
      }

      ctx.fillStyle = colorObj.hex;
      ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  }

  return { dimension, cellSize, totalCells: dimension * dimension };
}

/**
 * Canvas üzerindeki renkli QR matrisinin aktif sınırlarını (bounding box) otomatik tespit eder.
 * Ekran arka planı, duvar ve masa gibi ortam gürültülerini filtreler; sadece canlı RGB ve siyah matris alanını yakalar.
 */
export function findQrBoundingBox(imageData, width, height) {
  if (!imageData || !imageData.data) {
    return { x: 0, y: 0, w: width, h: height };
  }

  const data = imageData.data;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let found = false;

  const step = Math.max(1, Math.floor(Math.min(width, height) / 180));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a < 50) continue;

      const maxVal = Math.max(r, g, b);
      const minVal = Math.min(r, g, b);
      const sumVal = r + g + b;
      const chroma = maxVal - minVal;

      // QR Matrisi hücre pikselleri:
      // Koyu siyah pikseller (sumVal < 165) VEYA canlı Kırmızı/Yeşil/Mavi hücre pikselleri (chroma > 35 && maxVal > 50)
      const isQrCellPixel = sumVal < 165 || (chroma > 35 && maxVal > 50);

      if (isQrCellPixel) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }

  if (!found || maxX <= minX || maxY <= minY) {
    return { x: 0, y: 0, w: width, h: height };
  }

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const aspect = boxW / boxH;

  if (aspect < 0.5 || aspect > 1.9 || boxW < width * 0.05 || boxH < height * 0.05) {
    return { x: 0, y: 0, w: width, h: height };
  }

  return { x: minX, y: minY, w: boxW, h: boxH };
}

function sampleCellColorIndex(fullImgData, ctx, width, height, centerX, centerY, cellWidth, cellHeight) {
  const offsetX = Math.max(1, Math.floor(cellWidth * 0.22));
  const offsetY = Math.max(1, Math.floor(cellHeight * 0.22));

  const points = [
    [centerX, centerY],
    [Math.max(0, Math.min(width - 1, centerX - offsetX)), centerY],
    [Math.max(0, Math.min(width - 1, centerX + offsetX)), centerY],
    [centerX, Math.max(0, Math.min(height - 1, centerY - offsetY))],
    [centerX, Math.max(0, Math.min(height - 1, centerY + offsetY))],
  ];

  const votes = [0, 0, 0, 0];

  for (const [px, py] of points) {
    let r = 0;
    let g = 0;
    let b = 0;
    if (fullImgData) {
      const idx = (py * width + px) * 4;
      r = fullImgData.data[idx];
      g = fullImgData.data[idx + 1];
      b = fullImgData.data[idx + 2];
    } else {
      try {
        const pointData = ctx.getImageData(px, py, 1, 1);
        r = pointData.data[0];
        g = pointData.data[1];
        b = pointData.data[2];
      } catch {
        r = 0;
        g = 0;
        b = 0;
      }
    }
    const colorIdx = classifyRgbToColorIndex(r, g, b);
    votes[colorIdx] += 1;
  }

  let maxVotes = -1;
  let winningIdx = 0;
  for (let c = 0; c < 4; c += 1) {
    if (votes[c] > maxVotes) {
      maxVotes = votes[c];
      winningIdx = c;
    }
  }
  return winningIdx;
}

/**
 * Canvas üzerindeki renkli QR matrisini okuyarak ham veriyi çıkarır.
 * 5 noktalı çoğunluk oylamasıyla piksel kayması ve kenar bulanıklığı hatalarını önler.
 * @param {HTMLCanvasElement} canvas 
 * @param {number} dimension 
 * @param {number} totalBytes 
 * @returns {Uint8Array}
 */
export function decodeColorQrFromCanvas(canvas, dimension, totalBytes, rotation = 0) {
  if (
    !canvas ||
    !canvas.width ||
    !canvas.height ||
    canvas.width <= 0 ||
    canvas.height <= 0 ||
    !dimension ||
    dimension <= 0 ||
    !totalBytes ||
    totalBytes <= 0
  ) {
    return new Uint8Array(0);
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return new Uint8Array(0);

  const totalSymbols = totalBytes * 4;
  const indices = [];

  const isLargeCanvas = canvas.width * canvas.height > 2048 * 2048;

  let fullImgData = null;
  if (!isLargeCanvas) {
    try {
      fullImgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      fullImgData = null;
    }
  }

  const bbox = fullImgData
    ? findQrBoundingBox(fullImgData, canvas.width, canvas.height)
    : { x: 0, y: 0, w: canvas.width, h: canvas.height };

  const cellWidth = bbox.w / dimension;
  const cellHeight = bbox.h / dimension;

  for (let row = 0; row < dimension; row += 1) {
    if (indices.length >= totalSymbols) break;

    for (let col = 0; col < dimension; col += 1) {
      if (indices.length >= totalSymbols) break;

      let r = row;
      let c = col;
      if (rotation === 90) {
        r = col;
        c = dimension - 1 - row;
      } else if (rotation === 180) {
        r = dimension - 1 - row;
        c = dimension - 1 - col;
      } else if (rotation === 270) {
        r = dimension - 1 - col;
        c = row;
      }

      const centerY = Math.min(
        canvas.height - 1,
        Math.max(0, Math.floor(bbox.y + (r + 0.5) * cellHeight)),
      );

      const centerX = Math.min(
        canvas.width - 1,
        Math.max(0, Math.floor(bbox.x + (c + 0.5) * cellWidth)),
      );

      const winnerColorIdx = sampleCellColorIndex(
        fullImgData,
        ctx,
        canvas.width,
        canvas.height,
        centerX,
        centerY,
        cellWidth,
        cellHeight,
      );

      indices.push(winnerColorIdx);
    }
  }

  return colorIndicesToBytes(indices);
}

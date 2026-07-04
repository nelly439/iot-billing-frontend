/**
 * canvasWorker.ts
 *
 * Receives an OffscreenCanvas once via transfer, then accepts telemetry data as
 * chunked Float64Array messages (interleaved x,y pairs). Maintains an internal
 * ring buffer of MAX_POINTS capacity; when all chunks of a batch are received
 * it renders the full ring to the canvas.
 *
 * Message protocol (main → worker):
 *   { type: 'init', canvas: OffscreenCanvas }            – transferrable, sent once
 *   { type: 'chunk', data: Float64Array, chunkIndex: number, totalChunks: number }
 *   { type: 'resize', width: number, height: number }
 *   { type: 'clear' }
 *
 * Message protocol (worker → main):
 *   { type: 'ready' }
 *   { type: 'rendered', pointCount: number }
 *   { type: 'error', message: string }
 */

const MAX_POINTS = 100_000;

// Ring buffer: stores interleaved [x0, y0, x1, y1, ...]
const ring = new Float64Array(MAX_POINTS * 2);
let ringHead = 0; // write pointer (in point units, not float units)
let ringCount = 0; // number of valid points currently in buffer

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

// Chunk reassembly state
let pendingChunks: Float64Array[] = [];
let expectedTotalChunks = 0;

function appendPoints(data: Float64Array): void {
  const incomingPoints = data.length >> 1; // each point = 2 floats
  for (let i = 0; i < incomingPoints; i++) {
    const writeAt = ((ringHead + ringCount) % MAX_POINTS) * 2;
    ring[writeAt] = data[i * 2]!;
    ring[writeAt + 1] = data[i * 2 + 1]!;
    if (ringCount < MAX_POINTS) {
      ringCount++;
    } else {
      // Buffer full: advance head (oldest point evicted)
      ringHead = (ringHead + 1) % MAX_POINTS;
    }
  }
}

function render(): void {
  if (!canvas || !ctx || ringCount < 2) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#5ec962';
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  // Compute x/y ranges for normalisation
  let xMin = Infinity,
    xMax = -Infinity,
    yMin = Infinity,
    yMax = -Infinity;
  for (let i = 0; i < ringCount; i++) {
    const base = ((ringHead + i) % MAX_POINTS) * 2;
    const x = ring[base]!;
    const y = ring[base + 1]!;
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }

  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const pad = 10;

  for (let i = 0; i < ringCount; i++) {
    const base = ((ringHead + i) % MAX_POINTS) * 2;
    const cx = pad + ((ring[base]! - xMin) / xRange) * (w - 2 * pad);
    const cy = h - pad - ((ring[base + 1]! - yMin) / yRange) * (h - 2 * pad);
    i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
  }

  ctx.stroke();
  self.postMessage({ type: 'rendered', pointCount: ringCount });
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as {
    type: string;
    canvas?: OffscreenCanvas;
    data?: Float64Array;
    chunkIndex?: number;
    totalChunks?: number;
    width?: number;
    height?: number;
  };

  switch (msg.type) {
    case 'init': {
      if (!msg.canvas) {
        self.postMessage({ type: 'error', message: 'init: missing canvas' });
        return;
      }
      canvas = msg.canvas;
      ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
      if (!ctx) {
        self.postMessage({ type: 'error', message: 'init: failed to get 2d context' });
        return;
      }
      self.postMessage({ type: 'ready' });
      break;
    }

    case 'chunk': {
      if (!msg.data) return;

      const chunkIndex = msg.chunkIndex ?? 0;
      const totalChunks = msg.totalChunks ?? 1;

      // First chunk of a new batch – reset assembly state
      if (chunkIndex === 0) {
        pendingChunks = [];
        expectedTotalChunks = totalChunks;
      }

      pendingChunks[chunkIndex] = msg.data;

      // All chunks received – append to ring and render
      if (pendingChunks.filter(Boolean).length === expectedTotalChunks) {
        for (const chunk of pendingChunks) {
          if (chunk) appendPoints(chunk);
        }
        pendingChunks = [];
        expectedTotalChunks = 0;
        render();
      }
      break;
    }

    case 'resize': {
      if (canvas && msg.width && msg.height) {
        canvas.width = msg.width;
        canvas.height = msg.height;
        render();
      }
      break;
    }

    case 'clear': {
      ringHead = 0;
      ringCount = 0;
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      break;
    }
  }
};

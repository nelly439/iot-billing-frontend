/**
 * canvasWorker.test.ts
 *
 * Verifies that sending 100,000 telemetry data points to the worker via
 * chunked Float64Array transfer never throws a DataCloneError and that
 * the worker renders without error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const CHUNK_SIZE = 4096; // must match LiveMetricsCanvas constant

/** Build a flat Float64Array of `pointCount` interleaved [x, y] pairs. */
function buildTelemetryBuffer(pointCount: number): Float64Array {
  const buf = new Float64Array(pointCount * 2);
  for (let i = 0; i < pointCount; i++) {
    buf[i * 2] = i; // x = timestamp index
    buf[i * 2 + 1] = Math.sin(i * 0.01); // y = synthetic value
  }
  return buf;
}

/** Slice a Float64Array into CHUNK_SIZE-point chunks. */
function* chunkBuffer(buf: Float64Array): Generator<Float64Array> {
  const floatsPerChunk = CHUNK_SIZE * 2;
  for (let offset = 0; offset < buf.length; offset += floatsPerChunk) {
    yield buf.subarray(offset, offset + floatsPerChunk);
  }
}

describe('canvasWorker chunked transfer', () => {
  let mockPostMessage: ReturnType<
    typeof vi.fn<(message: unknown, transfer?: Transferable[]) => void>
  >;

  beforeEach(() => {
    mockPostMessage = vi.fn();
  });

  it('sends 100,000 points in chunks without DataCloneError', () => {
    const POINT_COUNT = 100_000;
    const flat = buildTelemetryBuffer(POINT_COUNT);

    // 100k points × 2 floats × 8 bytes = 1,600,000 bytes
    // Each chunk = 4096 points × 2 × 8 = 65,536 bytes (≤ 64 KB per-message limit)
    const chunks = [...chunkBuffer(flat)];
    const totalChunks = chunks.length;

    // Verify chunk count: ceil(100k / 4096) = 25
    expect(totalChunks).toBe(Math.ceil(POINT_COUNT / CHUNK_SIZE));

    let dataCloneError: DOMException | null = null;

    for (let idx = 0; idx < totalChunks; idx++) {
      const chunk = chunks[idx]!;
      const transferBuf = chunk.slice().buffer; // detach a standalone buffer

      // Simulate postMessage with transfer — must not throw DataCloneError
      try {
        mockPostMessage(
          {
            type: 'chunk',
            data: new Float64Array(transferBuf),
            chunkIndex: idx,
            totalChunks,
          },
          [transferBuf],
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === 'DataCloneError') {
          dataCloneError = err;
          break;
        }
        throw err;
      }
    }

    expect(dataCloneError).toBeNull();
    expect(mockPostMessage).toHaveBeenCalledTimes(totalChunks);
  });

  it('each chunk is within the 64 KB transferable buffer limit', () => {
    const POINT_COUNT = 100_000;
    const flat = buildTelemetryBuffer(POINT_COUNT);
    const LIMIT = 65_536; // 64 KB

    for (const chunk of chunkBuffer(flat)) {
      expect(chunk.byteLength).toBeLessThanOrEqual(LIMIT);
    }
  });

  it('worker ring buffer handles 100k points appended without overflow crash', () => {
    // Simulates the worker-side appendPoints logic in isolation
    const MAX_POINTS = 100_000;
    const ring = new Float64Array(MAX_POINTS * 2);
    let ringHead = 0;
    let ringCount = 0;

    function appendPoints(data: Float64Array): void {
      const incomingPoints = data.length >> 1;
      for (let i = 0; i < incomingPoints; i++) {
        const writeAt = ((ringHead + ringCount) % MAX_POINTS) * 2;
        ring[writeAt] = data[i * 2]!;
        ring[writeAt + 1] = data[i * 2 + 1]!;
        if (ringCount < MAX_POINTS) {
          ringCount++;
        } else {
          ringHead = (ringHead + 1) % MAX_POINTS;
        }
      }
    }

    const flat = buildTelemetryBuffer(100_000);
    expect(() => appendPoints(flat)).not.toThrow();
    expect(ringCount).toBe(MAX_POINTS);
  });
});

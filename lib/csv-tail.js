import fs from 'node:fs';

/**
 * Read a CSV header and only the last N complete rows.
 *
 * IDX OHLCV files contain plain numeric comma-separated fields (no quoted
 * multiline payloads). This deliberately avoids loading years of history
 * every time the streaming poller checks the latest candle.
 */
export function readCsvTail(filePath, count = 2) {
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new RangeError('count must be in 1..10');
  }
  const fd = fs.openSync(filePath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    if (size === 0) return { headers: [], rows: [] };

    const headerBuffer = Buffer.alloc(Math.min(size, 4096));
    const headerRead = fs.readSync(fd, headerBuffer, 0, headerBuffer.length, 0);
    const headerEnd = headerBuffer.subarray(0, headerRead).indexOf(10);
    if (headerEnd < 0) throw new Error('OHLCV CSV header exceeds 4 KiB or file has no rows');
    const headers = headerBuffer.subarray(0, headerEnd).toString('utf8')
      .replace(/^\uFEFF/, '').split(',').map(value => value.trim());

    let bytes = Math.min(size, 4096);
    while (true) {
      const start = size - bytes;
      const buffer = Buffer.alloc(bytes);
      const read = fs.readSync(fd, buffer, 0, bytes, start);
      const lines = buffer.subarray(0, read).toString('utf8').split(/\r?\n/);
      // The first fragment is the header (start=0) or a possibly partial row.
      lines.shift();
      const valid = lines.filter(line => line.trim().length > 0);
      if (valid.length >= count || start === 0) {
        return { headers, rows: valid.slice(-count).map(line => line.split(',')) };
      }
      bytes = Math.min(size, bytes * 2);
    }
  } finally {
    fs.closeSync(fd);
  }
}

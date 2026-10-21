import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCsvTail } from '../lib/csv-tail.js';

function fixture(body, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'idx-tail-'));
  try {
    const path = join(dir, 'BBCA.csv');
    writeFileSync(path, body);
    return fn(path);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('reads only last two records from a large CSV', () => {
  const rows = Array.from({length: 10000}, (_, i) => `${i},BBCA,${i * 2}`);
  fixture('Date,Ticker,Close\n' + rows.join('\n') + '\n', path => {
    const result = readCsvTail(path);
    assert.deepEqual(result.headers, ['Date', 'Ticker', 'Close']);
    assert.deepEqual(result.rows, [
      ['9998', 'BBCA', '19996'], ['9999', 'BBCA', '19998'],
    ]);
  });
});

test('handles short files, CRLF endings and a trailing newline', () => {
  fixture('Date,Ticker,Close\r\n2026-10-21,BBCA,8000\r\n', path => {
    assert.deepEqual(readCsvTail(path).rows, [['2026-10-21','BBCA','8000']]);
  });
});

test('handles header-only data without inventing a price', () => {
  fixture('Date,Ticker,Close\n', path => {
    assert.deepEqual(readCsvTail(path).rows, []);
  });
});

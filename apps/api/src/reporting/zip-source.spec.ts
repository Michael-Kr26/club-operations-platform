import { describe, expect, it } from 'vitest';
import { readImportZip } from './zip-source.js';
import { zipFixture } from './zip-fixtures.js';
describe('ZIP-grenzen', () => {
  it('leest mappen zonder bestanden naar schijf te schrijven', () => {
    const bytes = Buffer.from('test');
    expect(
      readImportZip(
        zipFixture([
          { filename: 'club/', bytes: Buffer.alloc(0) },
          { filename: 'club/test.xlsx', bytes },
        ]),
      ),
    ).toEqual([{ filename: 'club/test.xlsx', bytes }]);
  });
  it.each([
    '../test.xlsx',
    '/test.xlsx',
    'C:/test.xlsx',
    'club\\test.xlsx',
    'nested.zip',
    'script.exe',
  ])('weigert onveilige of ongeschikte invoer %s', (filename) => {
    expect(() =>
      readImportZip(zipFixture([{ filename, bytes: Buffer.from('test') }])),
    ).toThrow();
  });
  it('weigert dubbelzinnige namen, beschadigde data en te veel bestanden', () => {
    const f = { filename: 'test.xlsx', bytes: Buffer.from('test') };
    expect(() => readImportZip(zipFixture([f, f]))).toThrow();
    const bad = zipFixture([f]);
    bad[30 + f.filename.length] = 88;
    expect(() => readImportZip(bad)).toThrow();
    expect(() =>
      readImportZip(
        zipFixture(
          Array.from({ length: 51 }, (_, i) => ({
            ...f,
            filename: `${i}.xlsx`,
          })),
        ),
      ),
    ).toThrow();
    expect(() => readImportZip(Buffer.alloc(30))).toThrow();
  });
  it('weigert versleuteling en opgegeven uitpakgroottes vóór decompressie', () => {
    const f = { filename: 'test.xlsx', bytes: Buffer.from('test') };
    const zip = zipFixture([f]);
    const cd = zip.readUInt32LE(zip.length - 6);
    zip.writeUInt32LE(50_000_001, cd + 24);
    expect(() => readImportZip(zip)).toThrow();
    const encrypted = zipFixture([f]);
    encrypted.writeUInt16LE(1, cd + 8);
    expect(() => readImportZip(encrypted)).toThrow();
  });
});

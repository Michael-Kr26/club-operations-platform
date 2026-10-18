import { crc32, inflateRawSync } from 'node:zlib';

// Read entries into bounded memory; archive paths are never written to disk.
export function readImportZip(bytes: Buffer) {
  const fail = () => {
    throw new Error(
      'Ongeldige of onveilige ZIP. Gebruik maximaal 50 XLSX/EML-bestanden, 20 MB ZIP en 50 MB uitgepakt.',
    );
  };
  if (bytes.length > 20_000_000 || bytes.length < 22) fail();
  let end = bytes.length - 22;
  while (
    end >= Math.max(0, bytes.length - 65557) &&
    bytes.readUInt32LE(end) !== 0x06054b50
  )
    end--;
  if (
    end < 0 ||
    bytes.readUInt32LE(end) !== 0x06054b50 ||
    end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length
  )
    fail();
  const entries = bytes.readUInt16LE(end + 10),
    start = bytes.readUInt32LE(end + 16),
    size = bytes.readUInt32LE(end + 12);
  if (
    bytes.readUInt16LE(end + 4) ||
    bytes.readUInt16LE(end + 6) ||
    bytes.readUInt16LE(end + 8) !== entries ||
    entries > 100 ||
    start + size !== end
  )
    fail();
  const files: { filename: string; bytes: Buffer }[] = [];
  const seen = new Set<string>();
  let offset = start,
    total = 0;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) fail();
    const flags = bytes.readUInt16LE(offset + 8),
      method = bytes.readUInt16LE(offset + 10),
      crc = bytes.readUInt32LE(offset + 16),
      packed = bytes.readUInt32LE(offset + 20),
      unpacked = bytes.readUInt32LE(offset + 24),
      nameLength = bytes.readUInt16LE(offset + 28),
      extra = bytes.readUInt16LE(offset + 30),
      comment = bytes.readUInt16LE(offset + 32),
      local = bytes.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extra + comment;
    if (
      next > end ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      packed === 0xffffffff ||
      unpacked === 0xffffffff ||
      local === 0xffffffff ||
      bytes.readUInt16LE(offset + 34)
    )
      fail();
    const filename = bytes
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf8');
    if (
      !filename ||
      /[\\:]/.test(filename) ||
      [...filename].some((c) => c.charCodeAt(0) < 32) ||
      filename.startsWith('/') ||
      filename.split('/').some((p) => p === '..' || p === '.') ||
      ((bytes.readUInt32LE(offset + 38) >>> 16) & 0xf000) === 0xa000
    )
      fail();
    const key = filename.toLowerCase();
    if (seen.has(key)) fail();
    seen.add(key);
    total += unpacked;
    if (
      total > 50_000_000 ||
      unpacked > 5_000_000 ||
      local + 30 > start ||
      bytes.readUInt32LE(local) !== 0x04034b50
    )
      fail();
    const localName = bytes.readUInt16LE(local + 26),
      dataStart = local + 30 + localName + bytes.readUInt16LE(local + 28);
    if (
      bytes.readUInt16LE(local + 6) !== flags ||
      bytes.readUInt16LE(local + 8) !== method ||
      bytes.subarray(local + 30, local + 30 + localName).toString('utf8') !==
        filename ||
      dataStart + packed > start
    )
      fail();
    if (
      !filename.endsWith('/') &&
      !filename.startsWith('__MACOSX/') &&
      !filename.endsWith('.DS_Store')
    ) {
      if (!/\.(xlsx|eml)$/i.test(filename) || files.length >= 50)
        throw new Error(
          `Niet ondersteund in ZIP: ${filename.slice(0, 120)}. Gebruik alleen XLSX en EML; geen geneste ZIP-bestanden.`,
        );
      const compressed = bytes.subarray(dataStart, dataStart + packed);
      const content =
        method === 0
          ? compressed
          : inflateRawSync(compressed, {
              maxOutputLength: Math.min(5_000_000, unpacked + 1),
            });
      if (content.length !== unpacked || crc32(content) !== crc) fail();
      files.push({ filename, bytes: content });
    }
    offset = next;
  }
  if (offset !== end || !files.length) fail();
  return files;
}

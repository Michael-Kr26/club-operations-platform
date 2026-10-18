import { crc32 } from 'node:zlib';
// Synthetic uncompressed ZIPs for validation tests (no private source data).
export function zipFixture(files: { filename: string; bytes: Buffer }[]) {
  let offset = 0;
  const locals: Buffer[] = [],
    centers: Buffer[] = [];
  for (const file of files) {
    const name = Buffer.from(file.filename),
      crc = crc32(file.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.bytes.length, 18);
    local.writeUInt32LE(file.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    const center = Buffer.alloc(46);
    center.writeUInt32LE(0x02014b50);
    center.writeUInt16LE(20, 4);
    center.writeUInt16LE(20, 6);
    center.writeUInt32LE(crc, 16);
    center.writeUInt32LE(file.bytes.length, 20);
    center.writeUInt32LE(file.bytes.length, 24);
    center.writeUInt16LE(name.length, 28);
    center.writeUInt32LE(offset, 42);
    locals.push(local, name, file.bytes);
    centers.push(center, name);
    offset += local.length + name.length + file.bytes.length;
  }
  const central = Buffer.concat(centers),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

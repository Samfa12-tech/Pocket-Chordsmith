export interface ZipArchiveEntry {
  path: string;
  data: Blob | ArrayBuffer | Uint8Array | string;
  modifiedAt?: Date;
}

interface PreparedZipEntry {
  path: string;
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  localHeaderOffset: number;
  modifiedAt: Date;
}

const textEncoder = new TextEncoder();
const crcTable = createCrcTable();

export async function createZipBlob(entries: ZipArchiveEntry[]): Promise<Blob> {
  if (!entries.length) throw new Error("Cannot create an empty ZIP archive.");
  const seen = new Set<string>();
  const prepared: PreparedZipEntry[] = [];

  for (const entry of entries) {
    const path = normalizeZipPath(entry.path);
    if (seen.has(path)) throw new Error(`Duplicate ZIP path: ${path}`);
    seen.add(path);
    const data = await toBytes(entry.data);
    assertZip32(data.byteLength, path);
    prepared.push({
      path,
      nameBytes: textEncoder.encode(path),
      data,
      crc: crc32(data),
      localHeaderOffset: 0,
      modifiedAt: entry.modifiedAt || new Date()
    });
  }

  let offset = 0;
  const localParts: Uint8Array[] = [];
  for (const entry of prepared) {
    entry.localHeaderOffset = offset;
    const local = localHeader(entry);
    localParts.push(local, entry.nameBytes, entry.data);
    offset += local.byteLength + entry.nameBytes.byteLength + entry.data.byteLength;
  }

  const centralDirectoryOffset = offset;
  const centralParts: Uint8Array[] = [];
  for (const entry of prepared) {
    const central = centralDirectoryHeader(entry);
    centralParts.push(central, entry.nameBytes);
    offset += central.byteLength + entry.nameBytes.byteLength;
  }
  const centralDirectorySize = offset - centralDirectoryOffset;
  const end = endOfCentralDirectory(prepared.length, centralDirectorySize, centralDirectoryOffset);
  const bytes = concatBytes([...localParts, ...centralParts, end]);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/zip" });
}

async function toBytes(data: ZipArchiveEntry["data"]): Promise<Uint8Array> {
  if (typeof data === "string") return textEncoder.encode(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(await data.arrayBuffer());
}

function localHeader(entry: PreparedZipEntry): Uint8Array {
  const out = new Uint8Array(30);
  const view = new DataView(out.buffer);
  const { time, date } = dosDateTime(entry.modifiedAt);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, time, true);
  view.setUint16(12, date, true);
  view.setUint32(14, entry.crc, true);
  view.setUint32(18, entry.data.byteLength, true);
  view.setUint32(22, entry.data.byteLength, true);
  view.setUint16(26, entry.nameBytes.byteLength, true);
  view.setUint16(28, 0, true);
  return out;
}

function centralDirectoryHeader(entry: PreparedZipEntry): Uint8Array {
  const out = new Uint8Array(46);
  const view = new DataView(out.buffer);
  const { time, date } = dosDateTime(entry.modifiedAt);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, time, true);
  view.setUint16(14, date, true);
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.data.byteLength, true);
  view.setUint32(24, entry.data.byteLength, true);
  view.setUint16(28, entry.nameBytes.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, entry.localHeaderOffset, true);
  return out;
}

function endOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Uint8Array {
  const out = new Uint8Array(22);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return out;
}

function normalizeZipPath(path: string): string {
  const normalized = String(path || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  if (!normalized) throw new Error("ZIP entry path is empty.");
  return normalized;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const month = Math.max(1, Math.min(12, date.getMonth() + 1));
  const day = Math.max(1, Math.min(31, date.getDate()));
  const hours = Math.max(0, Math.min(23, date.getHours()));
  const minutes = Math.max(0, Math.min(59, date.getMinutes()));
  const seconds = Math.max(0, Math.min(29, Math.floor(date.getSeconds() / 2)));
  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day
  };
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[index]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

function assertZip32(size: number, path: string): void {
  if (size > 0xffffffff) throw new Error(`ZIP entry is too large for the current pack writer: ${path}`);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

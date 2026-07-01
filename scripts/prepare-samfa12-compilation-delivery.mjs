#!/usr/bin/env node
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePcmWavBytes, encodePcmWavBytes } from "../packages/pocket-audio-core/src/export/wav.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const albumRoot = join(repoRoot, "releases", "samfa12-compilation-album-1");
const masters24Dir = join(albumRoot, "masters-core", "masters_wav24");
const deliveryRoot = join(albumRoot, "delivery");
const cdbabyDir = join(deliveryRoot, "cdbaby_wav16");
const spotifyDir = join(deliveryRoot, "spotify_wav24");
const metadataDir = join(deliveryRoot, "metadata");

await rm(deliveryRoot, { recursive: true, force: true });
await mkdir(cdbabyDir, { recursive: true });
await mkdir(spotifyDir, { recursive: true });
await mkdir(metadataDir, { recursive: true });

const tracklist = parseCsv(await readFile(join(albumRoot, "metadata", "album-tracklist.csv"), "utf8"));
const wavFiles = (await readdir(masters24Dir)).filter((name) => name.endsWith(".wav")).sort();
const wavByNumber = new Map(wavFiles.map((name) => [Number(name.slice(0, 2)), name]));
const deliveryRows = [];

for (const row of tracklist) {
  const trackNumber = Number(row.trackNumber);
  const sourceName = wavByNumber.get(trackNumber);
  if (!sourceName) throw new Error(`Missing mastered WAV for track ${trackNumber}`);
  const sourcePath = join(masters24Dir, sourceName);
  const spotifyPath = join(spotifyDir, sourceName);
  await copyFile(sourcePath, spotifyPath);

  const decoded = decodePcmWavBytes(await readFile(sourcePath));
  const wav16 = encodePcmWavBytes({
    channels: decoded.channels,
    sampleRate: decoded.sampleRate,
    bitDepth: 16,
    dither: "tpdf"
  });
  const cdbabyPath = join(cdbabyDir, sourceName);
  await writeFile(cdbabyPath, wav16);

  deliveryRows.push({
    trackNumber: row.trackNumber,
    trackTitle: row.title,
    artist: "Samfa12",
    album: "Samfa12's Compilation Album #1",
    version: "",
    explicit: "No",
    genre: "",
    language: "Instrumental",
    songwriter: "",
    composer: "Samfa12",
    producer: "Samfa12",
    isrc: "",
    sourceGame: row.game,
    durationSeconds: row.durationSeconds,
    cdbabyFile: `cdbaby_wav16/${sourceName}`,
    spotifyArchiveFile: `spotify_wav24/${sourceName}`
  });
}

await copyFile(join(albumRoot, "metadata", "album-tracklist.csv"), join(metadataDir, "album-tracklist.csv"));
await copyFile(join(albumRoot, "masters-core", "release-summary.csv"), join(metadataDir, "mastering-release-summary.csv"));
await writeFile(join(metadataDir, "cdbaby-metadata-template.csv"), csv(deliveryRows));
await writeFile(join(deliveryRoot, "README.md"), readme(deliveryRows));

console.log(JSON.stringify({
  ok: true,
  tracks: deliveryRows.length,
  cdbabyDir,
  spotifyDir,
  metadataDir
}, null, 2));

function readme(rows) {
  return `# Samfa12's Compilation Album #1 Delivery

Artist: Samfa12
Track count: ${rows.length}

Folders:
- cdbaby_wav16: 16-bit / 44.1 kHz stereo WAV copies for CD Baby upload.
- spotify_wav24: 24-bit / 44.1 kHz stereo WAV masters from Pocket Audio Core.
- metadata: tracklist, mastering summary, and CD Baby metadata template.

Notes:
- All album source tracks were expanded to at least 2:00 before rendering.
- Mastering used Pocket Audio Core profile spotify_lofi_chill with album consistency enabled.
- Blank metadata fields still need final legal/store values before submission, especially songwriter, genre, and ISRC if you already have one.
`;
}

function csv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\n") + "\n";
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsv(text) {
  const rows = [];
  const records = [];
  let cell = "";
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    records.push(row);
  }
  const headers = records.shift() || [];
  for (const record of records) {
    if (!record.length || record.every((item) => !item)) continue;
    rows.push(Object.fromEntries(headers.map((header, index) => [header, record[index] || ""])));
  }
  return rows;
}

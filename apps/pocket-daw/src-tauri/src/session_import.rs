use flate2::read::GzDecoder;
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::fs::File;
use std::io::{Read, Seek, Write};
use std::path::{Component, Path, PathBuf};
use zip::ZipArchive;

const MAX_SOURCE_FILE_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_BYTES: u64 = 600 * 1024 * 1024;
const MAX_ARCHIVE_TOTAL_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_XML_BYTES: u64 = 64 * 1024 * 1024;
const MAX_MIDI_BYTES: u64 = 25 * 1024 * 1024;
const MAX_SOURCE_FILES: usize = 256;
const MAX_SCAN_DEPTH: usize = 5;
const MAX_COMPRESSION_RATIO: u64 = 200;
const SESSION_IMPORT_STACK_BYTES: usize = 32 * 1024 * 1024;
const AAF_MUREKA_ROLES: [&str; 6] = ["bass", "drums", "guitar", "other", "synth", "vocal"];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionImportPayload {
    title: String,
    source_paths: Vec<String>,
    formats: Vec<String>,
    audio_assets: Vec<SessionAudioAsset>,
    midi_assets: Vec<SessionMidiAsset>,
    note_tracks: Vec<SessionNoteTrack>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fixed_tempo_bpm: Option<f64>,
    warnings: Vec<String>,
    checksum: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionAudioAsset {
    name: String,
    role: String,
    uri: String,
    mime_type: String,
    duration_seconds: f64,
    sample_rate: u32,
    channels: u16,
    size_bytes: u64,
    checksum: String,
    pcm_checksum: String,
    source_format: String,
    source_path: String,
    source_entry: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionMidiAsset {
    name: String,
    role: String,
    bytes: Vec<u8>,
    size_bytes: u64,
    checksum: String,
    source_format: String,
    source_path: String,
    source_entry: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionNoteTrack {
    name: String,
    role: String,
    notes: Vec<SessionBeatNote>,
    source_format: String,
    source_path: String,
    source_entry: String,
    ppq: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionBeatNote {
    pitch: u8,
    start_beat: f64,
    duration_beats: f64,
    velocity: u8,
    channel: u8,
}

#[derive(Clone, Debug)]
struct ZipEntryInfo {
    index: usize,
    name: String,
}

#[derive(Clone, Debug)]
struct WavInfo {
    sample_rate: u32,
    channels: u16,
    duration_seconds: f64,
    pcm_start: usize,
    pcm_end: usize,
}

#[derive(Clone, Debug)]
struct AudioRef {
    role: String,
    entry: String,
}

#[derive(Clone, Debug, Default)]
struct ParsedSessionXml {
    fixed_tempo_bpm: Option<f64>,
    audio_refs: Vec<AudioRef>,
    note_tracks: Vec<SessionNoteTrack>,
}

#[derive(Clone, Debug)]
struct TrackDef {
    name: String,
    content_type: String,
}

struct SessionImporter {
    cache_root: PathBuf,
    payload: SessionImportPayload,
    cached_pcm: HashMap<String, PathBuf>,
}

#[tauri::command]
pub async fn open_daw_session_folder() -> Result<Option<SessionImportPayload>, String> {
    let Some(path) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
    };
    import_session_paths_async(vec![path]).await.map(Some)
}

#[tauri::command]
pub async fn open_daw_session_files() -> Result<Option<SessionImportPayload>, String> {
    let Some(paths) = rfd::FileDialog::new()
        .add_filter(
            "DAW sessions, stems and MIDI",
            &["zip", "dawproject", "als", "aaf", "wav", "mid", "midi"],
        )
        .pick_files()
    else {
        return Ok(None);
    };
    import_session_paths_async(paths).await.map(Some)
}

#[tauri::command]
pub async fn read_daw_session_path(path: String) -> Result<SessionImportPayload, String> {
    import_session_paths_async(vec![PathBuf::from(path)]).await
}

async fn import_session_paths_async(paths: Vec<PathBuf>) -> Result<SessionImportPayload, String> {
    tauri::async_runtime::spawn_blocking(move || import_session_paths_on_worker(paths))
        .await
        .map_err(|error| format!("DAW session import task failed: {error}"))?
}

fn import_session_paths_on_worker(paths: Vec<PathBuf>) -> Result<SessionImportPayload, String> {
    std::thread::Builder::new()
        .name("pocket-daw-session-import".to_string())
        .stack_size(SESSION_IMPORT_STACK_BYTES)
        .spawn(move || import_session_paths(paths))
        .map_err(|error| format!("Could not start the DAW session import worker: {error}"))?
        .join()
        .map_err(|_| "The DAW session import worker stopped unexpectedly.".to_string())?
}

fn import_session_paths(paths: Vec<PathBuf>) -> Result<SessionImportPayload, String> {
    if paths.is_empty() {
        return Err("Choose a DAW session file or folder to import.".to_string());
    }
    let original_paths = paths
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>();
    let title = title_from_paths(&paths);
    let mut files = Vec::new();
    for path in &paths {
        collect_supported_files(path, 0, &mut files)?;
    }
    files.sort();
    files.dedup();
    if files.is_empty() {
        return Err("No supported DAW session, WAV or MIDI files were found.".to_string());
    }
    if files.len() > MAX_SOURCE_FILES {
        return Err(format!(
            "The selected session contains more than {MAX_SOURCE_FILES} supported files. Choose a smaller session folder."
        ));
    }

    let mut unique_files = Vec::new();
    let mut seen_file_hashes = HashMap::<String, PathBuf>::new();
    let mut warnings = Vec::new();
    for path in files {
        let metadata = std::fs::metadata(&path)
            .map_err(|err| format!("Could not inspect {}: {err}", path.display()))?;
        if metadata.len() > MAX_SOURCE_FILE_BYTES {
            return Err(format!(
                "{} is too large for DAW session import.",
                path.display()
            ));
        }
        let hash = sha256_file(&path)?;
        if let Some(original) = seen_file_hashes.get(&hash) {
            warnings.push(format!(
                "Skipped byte-identical duplicate {} (same as {}).",
                path.display(),
                original.display()
            ));
            continue;
        }
        seen_file_hashes.insert(hash.clone(), path.clone());
        unique_files.push((path, hash));
    }
    let bundle_checksum = sha256_bytes(
        unique_files
            .iter()
            .flat_map(|(_, hash)| hash.as_bytes().iter().copied())
            .collect::<Vec<_>>()
            .as_slice(),
    );
    let cache_root = session_cache_root().join(&bundle_checksum[..16]);
    std::fs::create_dir_all(cache_root.join("audio"))
        .map_err(|err| format!("Could not create the DAW session audio cache: {err}"))?;
    std::fs::create_dir_all(cache_root.join("temp"))
        .map_err(|err| format!("Could not create the DAW session temporary cache: {err}"))?;
    let mut importer = SessionImporter {
        cache_root,
        payload: SessionImportPayload {
            title,
            source_paths: original_paths,
            formats: Vec::new(),
            audio_assets: Vec::new(),
            midi_assets: Vec::new(),
            note_tracks: Vec::new(),
            fixed_tempo_bpm: None,
            warnings,
            checksum: bundle_checksum,
        },
        cached_pcm: HashMap::new(),
    };
    for (path, source_hash) in unique_files {
        importer.process_source_file(&path, &source_hash)?;
    }
    importer
        .payload
        .formats
        .sort_by_key(|format| format_rank(format));
    importer.payload.formats.dedup();
    importer.payload.warnings.sort();
    importer.payload.warnings.dedup();
    if importer.payload.audio_assets.is_empty()
        && importer.payload.midi_assets.is_empty()
        && importer.payload.note_tracks.is_empty()
    {
        return Err("The selected sources were readable, but no importable audio or MIDI content was found.".to_string());
    }
    Ok(importer.payload)
}

impl SessionImporter {
    fn process_source_file(&mut self, path: &Path, source_hash: &str) -> Result<(), String> {
        let extension = lower_extension(path);
        match extension.as_str() {
            "zip" | "dawproject" => self.process_archive(path, source_hash),
            "als" => self.process_standalone_ableton(path),
            "aaf" => self.process_aaf(path, &path.to_string_lossy(), ""),
            "mid" | "midi" => {
                let bytes = read_file_limited(path, MAX_MIDI_BYTES)?;
                self.add_midi_bytes(bytes, file_name(path), "midi", &path.to_string_lossy(), "")
            }
            "wav" => {
                let bytes = read_file_limited(path, MAX_ARCHIVE_ENTRY_BYTES)?;
                self.add_wav_bytes(bytes, file_name(path), "stems", &path.to_string_lossy(), "")
            }
            _ => Ok(()),
        }
    }

    fn process_archive(&mut self, path: &Path, source_hash: &str) -> Result<(), String> {
        let file = File::open(path)
            .map_err(|err| format!("Could not open archive {}: {err}", path.display()))?;
        let mut archive = ZipArchive::new(file)
            .map_err(|err| format!("Could not read archive {}: {err}", path.display()))?;
        let entries = validated_zip_entries(&mut archive)?;
        let is_dawproject = lower_extension(path) == "dawproject"
            || (entry_index_by_name(&entries, "project.xml").is_some()
                && entry_index_by_name(&entries, "metadata.xml").is_some());
        if is_dawproject {
            return self.process_dawproject_archive(path, &mut archive, &entries);
        }
        if let Some(als_entry) = entries
            .iter()
            .find(|entry| entry.name.to_ascii_lowercase().ends_with(".als"))
        {
            return self.process_ableton_archive(path, &mut archive, &entries, als_entry.index);
        }
        if let Some(aaf_entry) = entries
            .iter()
            .find(|entry| entry.name.to_ascii_lowercase().ends_with(".aaf"))
        {
            self.push_format("aaf");
            let temp_path = self
                .cache_root
                .join("temp")
                .join(format!("{source_hash}.aaf"));
            extract_zip_entry_to_file(&mut archive, aaf_entry.index, &temp_path)?;
            let aaf_result = self.process_aaf(&temp_path, &path.to_string_lossy(), &aaf_entry.name);
            let _ = std::fs::remove_file(&temp_path);
            aaf_result?;
            for entry in entries.iter().filter(|entry| is_midi_name(&entry.name)) {
                let bytes = read_zip_entry(&mut archive, entry.index, MAX_MIDI_BYTES)?;
                self.add_midi_bytes(
                    bytes,
                    base_name(&entry.name),
                    "aaf",
                    &path.to_string_lossy(),
                    &entry.name,
                )?;
            }
            return Ok(());
        }

        let has_wav = entries.iter().any(|entry| is_wav_name(&entry.name));
        let has_midi = entries.iter().any(|entry| is_midi_name(&entry.name));
        if has_wav {
            self.push_format("stems");
            for entry in entries.iter().filter(|entry| is_wav_name(&entry.name)) {
                let bytes = read_zip_entry(&mut archive, entry.index, MAX_ARCHIVE_ENTRY_BYTES)?;
                self.add_wav_bytes(
                    bytes,
                    base_name(&entry.name),
                    "stems",
                    &path.to_string_lossy(),
                    &entry.name,
                )?;
            }
        }
        if has_midi {
            self.push_format("midi");
            for entry in entries.iter().filter(|entry| is_midi_name(&entry.name)) {
                let bytes = read_zip_entry(&mut archive, entry.index, MAX_MIDI_BYTES)?;
                self.add_midi_bytes(
                    bytes,
                    base_name(&entry.name),
                    "midi",
                    &path.to_string_lossy(),
                    &entry.name,
                )?;
            }
        }
        Ok(())
    }

    fn process_dawproject_archive<R: Read + Seek>(
        &mut self,
        path: &Path,
        archive: &mut ZipArchive<R>,
        entries: &[ZipEntryInfo],
    ) -> Result<(), String> {
        self.push_format("dawproject");
        let project_index = entry_index_by_name(entries, "project.xml")
            .ok_or_else(|| "DAWproject archive is missing project.xml.".to_string())?;
        let xml = read_zip_entry(archive, project_index, MAX_XML_BYTES)?;
        let parsed = parse_dawproject_xml(&xml, &path.to_string_lossy())?;
        self.adopt_parsed_xml_metadata(parsed.clone());
        for audio in parsed.audio_refs {
            let index = entry_index_by_name(entries, &audio.entry)
                .or_else(|| entry_index_by_base_name(entries, &audio.entry))
                .ok_or_else(|| format!("DAWproject audio entry {} is missing.", audio.entry))?;
            let entry = &entries[index_position(entries, index)?];
            let bytes = read_zip_entry(archive, index, MAX_ARCHIVE_ENTRY_BYTES)?;
            self.add_wav_bytes(
                bytes,
                format!("{}.wav", audio.role),
                "dawproject",
                &path.to_string_lossy(),
                &entry.name,
            )?;
        }
        Ok(())
    }

    fn process_ableton_archive<R: Read + Seek>(
        &mut self,
        path: &Path,
        archive: &mut ZipArchive<R>,
        entries: &[ZipEntryInfo],
        als_index: usize,
    ) -> Result<(), String> {
        self.push_format("ableton-live");
        let compressed = read_zip_entry(archive, als_index, MAX_XML_BYTES)?;
        let xml = decode_ableton_xml(&compressed)?;
        let parsed = parse_ableton_xml(&xml, &path.to_string_lossy())?;
        self.adopt_parsed_xml_metadata(parsed.clone());
        for audio in parsed.audio_refs {
            let index = entry_index_by_base_name(entries, &audio.entry).ok_or_else(|| {
                format!(
                    "Ableton audio file {} is missing from the collected project.",
                    audio.entry
                )
            })?;
            let entry = &entries[index_position(entries, index)?];
            let bytes = read_zip_entry(archive, index, MAX_ARCHIVE_ENTRY_BYTES)?;
            self.add_wav_bytes(
                bytes,
                format!("{}.wav", audio.role),
                "ableton-live",
                &path.to_string_lossy(),
                &entry.name,
            )?;
        }
        Ok(())
    }

    fn process_standalone_ableton(&mut self, path: &Path) -> Result<(), String> {
        self.push_format("ableton-live");
        let compressed = read_file_limited(path, MAX_XML_BYTES)?;
        let xml = decode_ableton_xml(&compressed)?;
        let parsed = parse_ableton_xml(&xml, &path.to_string_lossy())?;
        self.adopt_parsed_xml_metadata(parsed.clone());
        for audio in parsed.audio_refs {
            let resolved = find_nearby_file(
                path.parent().unwrap_or_else(|| Path::new(".")),
                &audio.entry,
                0,
            )
            .ok_or_else(|| {
                format!(
                    "Ableton audio file {} is missing beside the project.",
                    audio.entry
                )
            })?;
            let bytes = read_file_limited(&resolved, MAX_ARCHIVE_ENTRY_BYTES)?;
            self.add_wav_bytes(
                bytes,
                format!("{}.wav", audio.role),
                "ableton-live",
                &path.to_string_lossy(),
                &resolved.to_string_lossy(),
            )?;
        }
        Ok(())
    }

    fn process_aaf(
        &mut self,
        path: &Path,
        source_path: &str,
        source_entry: &str,
    ) -> Result<(), String> {
        self.push_format("aaf");
        let mut compound = cfb::open(path)
            .map_err(|err| format!("Could not open AAF {}: {err}", path.display()))?;
        let mut essence_paths = compound
            .walk()
            .filter(|entry| {
                entry.is_stream() && entry.name() == "Data-2702" && entry.len() > 1024 * 1024
            })
            .map(|entry| entry.path().to_path_buf())
            .collect::<Vec<_>>();
        essence_paths.sort();
        if essence_paths.len() != AAF_MUREKA_ROLES.len() {
            return Err(format!(
                "AAF import found {} embedded essence streams. This release supports the six-stem Mureka AAF layout.",
                essence_paths.len()
            ));
        }
        self.payload.warnings.push(
            "AAF essence was imported using the validated Mureka six-stem layout (44.1 kHz, stereo, 16-bit PCM). The bundled AAF MIDI is tempo metadata only, so editable notes come from companion MIDI when available."
                .to_string(),
        );
        for (index, essence_path) in essence_paths.iter().enumerate() {
            let mut stream = compound.open_stream(essence_path).map_err(|err| {
                format!(
                    "Could not open AAF essence {}: {err}",
                    essence_path.display()
                )
            })?;
            let mut pcm = Vec::new();
            stream.read_to_end(&mut pcm).map_err(|err| {
                format!(
                    "Could not read AAF essence {}: {err}",
                    essence_path.display()
                )
            })?;
            if pcm.len() as u64 > MAX_ARCHIVE_ENTRY_BYTES || pcm.len() % 4 != 0 {
                return Err(format!(
                    "AAF essence {} has an unsupported PCM size.",
                    essence_path.display()
                ));
            }
            let wav = build_pcm_wav(&pcm, 44_100, 2, 16)?;
            let role = AAF_MUREKA_ROLES[index];
            let essence_entry = if source_entry.is_empty() {
                essence_path.to_string_lossy().to_string()
            } else {
                source_entry.to_string()
            };
            self.add_wav_bytes(
                wav,
                format!("{role}.wav"),
                "aaf",
                source_path,
                &essence_entry,
            )?;
        }
        Ok(())
    }

    fn adopt_parsed_xml_metadata(&mut self, parsed: ParsedSessionXml) {
        if self.payload.fixed_tempo_bpm.is_none() {
            self.payload.fixed_tempo_bpm = parsed.fixed_tempo_bpm;
        }
        self.payload.note_tracks.extend(parsed.note_tracks);
    }

    fn add_wav_bytes(
        &mut self,
        bytes: Vec<u8>,
        name: String,
        source_format: &str,
        source_path: &str,
        source_entry: &str,
    ) -> Result<(), String> {
        let info = parse_wav_info(&bytes)?;
        let checksum = sha256_bytes(&bytes);
        let pcm_checksum = sha256_bytes(&bytes[info.pcm_start..info.pcm_end]);
        let cached_path = if let Some(existing) = self.cached_pcm.get(&pcm_checksum) {
            existing.clone()
        } else {
            let path = self
                .cache_root
                .join("audio")
                .join(format!("{pcm_checksum}.wav"));
            if !path.exists() {
                write_file_atomic(&path, &bytes)?;
            }
            self.cached_pcm.insert(pcm_checksum.clone(), path.clone());
            path
        };
        let role = role_from_name(&name);
        self.push_format(source_format);
        self.payload.audio_assets.push(SessionAudioAsset {
            name: format!("{role}.wav"),
            role,
            uri: cached_path.to_string_lossy().to_string(),
            mime_type: "audio/wav".to_string(),
            duration_seconds: round_six(info.duration_seconds),
            sample_rate: info.sample_rate,
            channels: info.channels,
            size_bytes: bytes.len() as u64,
            checksum,
            pcm_checksum,
            source_format: source_format.to_string(),
            source_path: source_path.to_string(),
            source_entry: source_entry.to_string(),
        });
        Ok(())
    }

    fn add_midi_bytes(
        &mut self,
        bytes: Vec<u8>,
        name: String,
        source_format: &str,
        source_path: &str,
        source_entry: &str,
    ) -> Result<(), String> {
        if bytes.len() as u64 > MAX_MIDI_BYTES {
            return Err(format!("MIDI file {name} is too large for session import."));
        }
        if bytes.len() < 4 || &bytes[..4] != b"MThd" {
            return Err(format!("MIDI file {name} is missing its MThd header."));
        }
        let role = role_from_name(&name);
        let checksum = sha256_bytes(&bytes);
        self.push_format(source_format);
        self.payload.midi_assets.push(SessionMidiAsset {
            name,
            role,
            size_bytes: bytes.len() as u64,
            checksum,
            bytes,
            source_format: source_format.to_string(),
            source_path: source_path.to_string(),
            source_entry: source_entry.to_string(),
        });
        Ok(())
    }

    fn push_format(&mut self, format: &str) {
        if !self.payload.formats.iter().any(|value| value == format) {
            self.payload.formats.push(format.to_string());
        }
    }
}

fn parse_dawproject_xml(xml: &[u8], source_path: &str) -> Result<ParsedSessionXml, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut tracks = HashMap::<String, TrackDef>::new();
    let mut lane_stack = Vec::<Option<String>>::new();
    let mut clip_stack = Vec::<f64>::new();
    let mut fixed_tempo_bpm = None;
    let mut audio_refs = Vec::new();
    let mut notes = BTreeMap::<String, Vec<SessionBeatNote>>::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) => {
                handle_dawproject_start(
                    &event,
                    &mut tracks,
                    &mut lane_stack,
                    &mut clip_stack,
                    &mut fixed_tempo_bpm,
                    &mut audio_refs,
                    &mut notes,
                );
            }
            Ok(Event::Empty(event)) => {
                handle_dawproject_start(
                    &event,
                    &mut tracks,
                    &mut lane_stack,
                    &mut clip_stack,
                    &mut fixed_tempo_bpm,
                    &mut audio_refs,
                    &mut notes,
                );
                handle_dawproject_end(event.name().as_ref(), &mut lane_stack, &mut clip_stack);
            }
            Ok(Event::End(event)) => {
                handle_dawproject_end(event.name().as_ref(), &mut lane_stack, &mut clip_stack);
            }
            Ok(Event::Eof) => break,
            Err(err) => return Err(format!("Could not parse DAWproject XML: {err}")),
            _ => {}
        }
        buffer.clear();
    }
    let note_tracks = notes
        .into_iter()
        .map(|(role, mut notes)| {
            notes.sort_by(|a, b| {
                a.start_beat
                    .total_cmp(&b.start_beat)
                    .then(a.pitch.cmp(&b.pitch))
            });
            SessionNoteTrack {
                name: role.clone(),
                role,
                notes,
                source_format: "dawproject".to_string(),
                source_path: source_path.to_string(),
                source_entry: "project.xml".to_string(),
                ppq: 960,
            }
        })
        .collect();
    Ok(ParsedSessionXml {
        fixed_tempo_bpm,
        audio_refs,
        note_tracks,
    })
}

#[allow(clippy::too_many_arguments)]
fn handle_dawproject_start(
    event: &BytesStart<'_>,
    tracks: &mut HashMap<String, TrackDef>,
    lane_stack: &mut Vec<Option<String>>,
    clip_stack: &mut Vec<f64>,
    fixed_tempo_bpm: &mut Option<f64>,
    audio_refs: &mut Vec<AudioRef>,
    notes: &mut BTreeMap<String, Vec<SessionBeatNote>>,
) {
    match event.name().as_ref() {
        b"Tempo" => {
            if let Some(value) = xml_attr_f64(event, b"value") {
                if value > 0.0 {
                    *fixed_tempo_bpm = Some(value);
                }
            }
        }
        b"Track" => {
            if let Some(id) = xml_attr(event, b"id") {
                tracks.insert(
                    id,
                    TrackDef {
                        name: xml_attr(event, b"name").unwrap_or_else(|| "media".to_string()),
                        content_type: xml_attr(event, b"contentType").unwrap_or_default(),
                    },
                );
            }
        }
        b"Lanes" => {
            let inherited = lane_stack.last().cloned().flatten();
            lane_stack.push(xml_attr(event, b"track").or(inherited));
        }
        b"Clip" => {
            let inherited = clip_stack.last().copied().unwrap_or(0.0);
            clip_stack.push(inherited + xml_attr_f64(event, b"time").unwrap_or(0.0));
        }
        b"File" => {
            let Some(track_id) = lane_stack.last().cloned().flatten() else {
                return;
            };
            let Some(track) = tracks.get(&track_id) else {
                return;
            };
            if track.content_type == "audio" {
                if let Some(entry) = xml_attr(event, b"path") {
                    audio_refs.push(AudioRef {
                        role: role_from_name(&track.name),
                        entry,
                    });
                }
            }
        }
        b"Note" => {
            let Some(track_id) = lane_stack.last().cloned().flatten() else {
                return;
            };
            let Some(track) = tracks.get(&track_id) else {
                return;
            };
            if track.content_type != "notes" {
                return;
            }
            let start = clip_stack.last().copied().unwrap_or(0.0)
                + xml_attr_f64(event, b"time").unwrap_or(0.0);
            let duration = xml_attr_f64(event, b"duration").unwrap_or(0.0);
            let key = xml_attr_f64(event, b"key")
                .unwrap_or(60.0)
                .round()
                .clamp(0.0, 127.0) as u8;
            let raw_velocity = xml_attr_f64(event, b"vel").unwrap_or(0.75);
            let velocity = if raw_velocity <= 1.0 {
                (raw_velocity * 127.0).round()
            } else {
                raw_velocity.round()
            }
            .clamp(1.0, 127.0) as u8;
            let channel = xml_attr_f64(event, b"channel")
                .unwrap_or(0.0)
                .round()
                .clamp(0.0, 15.0) as u8;
            notes
                .entry(role_from_name(&track.name))
                .or_default()
                .push(SessionBeatNote {
                    pitch: key,
                    start_beat: round_six(start.max(0.0)),
                    duration_beats: round_six(duration.max(1.0 / 960.0)),
                    velocity,
                    channel,
                });
        }
        _ => {}
    }
}

fn handle_dawproject_end(
    name: &[u8],
    lane_stack: &mut Vec<Option<String>>,
    clip_stack: &mut Vec<f64>,
) {
    if name == b"Lanes" {
        lane_stack.pop();
    } else if name == b"Clip" {
        clip_stack.pop();
    }
}

#[derive(Default)]
struct AlsTrackState {
    kind: String,
    name: String,
    audio_file: String,
    notes: Vec<SessionBeatNote>,
}

#[derive(Default)]
struct AlsKeyState {
    pitch: Option<u8>,
    events: Vec<(f64, f64, u8)>,
}

fn parse_ableton_xml(xml: &[u8], source_path: &str) -> Result<ParsedSessionXml, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut current_track: Option<AlsTrackState> = None;
    let mut current_key: Option<AlsKeyState> = None;
    let mut midi_clip_stack = Vec::<f64>::new();
    let mut in_file_ref = 0usize;
    let mut in_tempo = 0usize;
    let mut fixed_tempo_bpm = None;
    let mut audio_refs = Vec::new();
    let mut note_tracks = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) => match event.name().as_ref() {
                b"AudioTrack" => {
                    current_track = Some(AlsTrackState {
                        kind: "audio".to_string(),
                        ..Default::default()
                    })
                }
                b"MidiTrack" => {
                    current_track = Some(AlsTrackState {
                        kind: "midi".to_string(),
                        ..Default::default()
                    })
                }
                b"EffectiveName" => {
                    if let Some(track) = current_track.as_mut() {
                        if track.name.is_empty() {
                            track.name = xml_attr(&event, b"Value").unwrap_or_default();
                        }
                    }
                }
                b"FileRef" => in_file_ref += 1,
                b"Name" if in_file_ref > 0 => {
                    if let Some(track) = current_track.as_mut() {
                        track.audio_file = xml_attr(&event, b"Value").unwrap_or_default();
                    }
                }
                b"MidiClip" => midi_clip_stack.push(xml_attr_f64(&event, b"Time").unwrap_or(0.0)),
                b"KeyTrack" => current_key = Some(AlsKeyState::default()),
                b"MidiNoteEvent" => {
                    if let Some(key) = current_key.as_mut() {
                        let start = midi_clip_stack.last().copied().unwrap_or(0.0)
                            + xml_attr_f64(&event, b"Time").unwrap_or(0.0);
                        let duration = xml_attr_f64(&event, b"Duration").unwrap_or(0.0);
                        let velocity = xml_attr_f64(&event, b"Velocity")
                            .unwrap_or(96.0)
                            .round()
                            .clamp(1.0, 127.0) as u8;
                        key.events.push((start, duration, velocity));
                    }
                }
                b"MidiKey" => {
                    if let Some(key) = current_key.as_mut() {
                        key.pitch = Some(
                            xml_attr_f64(&event, b"Value")
                                .unwrap_or(60.0)
                                .round()
                                .clamp(0.0, 127.0) as u8,
                        );
                    }
                }
                b"Tempo" => in_tempo += 1,
                b"Manual" if in_tempo > 0 => {
                    let value = xml_attr_f64(&event, b"Value").unwrap_or(0.0);
                    if value > 0.0 {
                        fixed_tempo_bpm = Some(value);
                    }
                }
                _ => {}
            },
            Ok(Event::Empty(event)) => match event.name().as_ref() {
                b"EffectiveName" => {
                    if let Some(track) = current_track.as_mut() {
                        if track.name.is_empty() {
                            track.name = xml_attr(&event, b"Value").unwrap_or_default();
                        }
                    }
                }
                b"Name" if in_file_ref > 0 => {
                    if let Some(track) = current_track.as_mut() {
                        track.audio_file = xml_attr(&event, b"Value").unwrap_or_default();
                    }
                }
                b"MidiNoteEvent" => {
                    if let Some(key) = current_key.as_mut() {
                        let start = midi_clip_stack.last().copied().unwrap_or(0.0)
                            + xml_attr_f64(&event, b"Time").unwrap_or(0.0);
                        let duration = xml_attr_f64(&event, b"Duration").unwrap_or(0.0);
                        let velocity = xml_attr_f64(&event, b"Velocity")
                            .unwrap_or(96.0)
                            .round()
                            .clamp(1.0, 127.0) as u8;
                        key.events.push((start, duration, velocity));
                    }
                }
                b"MidiKey" => {
                    if let Some(key) = current_key.as_mut() {
                        key.pitch = Some(
                            xml_attr_f64(&event, b"Value")
                                .unwrap_or(60.0)
                                .round()
                                .clamp(0.0, 127.0) as u8,
                        );
                    }
                }
                b"Manual" if in_tempo > 0 => {
                    let value = xml_attr_f64(&event, b"Value").unwrap_or(0.0);
                    if value > 0.0 {
                        fixed_tempo_bpm = Some(value);
                    }
                }
                _ => {}
            },
            Ok(Event::End(event)) => match event.name().as_ref() {
                b"FileRef" => in_file_ref = in_file_ref.saturating_sub(1),
                b"MidiClip" => {
                    midi_clip_stack.pop();
                }
                b"KeyTrack" => {
                    if let (Some(track), Some(key)) = (current_track.as_mut(), current_key.take()) {
                        let pitch = key.pitch.unwrap_or(60);
                        track.notes.extend(key.events.into_iter().map(
                            |(start, duration, velocity)| SessionBeatNote {
                                pitch,
                                start_beat: round_six(start.max(0.0)),
                                duration_beats: round_six(duration.max(1.0 / 960.0)),
                                velocity,
                                channel: 0,
                            },
                        ));
                    }
                }
                b"Tempo" => in_tempo = in_tempo.saturating_sub(1),
                b"AudioTrack" | b"MidiTrack" => {
                    if let Some(mut track) = current_track.take() {
                        let role = role_from_name(if track.name.is_empty() {
                            &track.audio_file
                        } else {
                            &track.name
                        });
                        if track.kind == "audio" && !track.audio_file.is_empty() {
                            audio_refs.push(AudioRef {
                                role,
                                entry: track.audio_file,
                            });
                        } else if track.kind == "midi" && !track.notes.is_empty() {
                            track.notes.sort_by(|a, b| {
                                a.start_beat
                                    .total_cmp(&b.start_beat)
                                    .then(a.pitch.cmp(&b.pitch))
                            });
                            note_tracks.push(SessionNoteTrack {
                                name: role.clone(),
                                role,
                                notes: track.notes,
                                source_format: "ableton-live".to_string(),
                                source_path: source_path.to_string(),
                                source_entry: "Ableton Live set XML".to_string(),
                                ppq: 960,
                            });
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(err) => return Err(format!("Could not parse Ableton Live XML: {err}")),
            _ => {}
        }
        buffer.clear();
    }
    Ok(ParsedSessionXml {
        fixed_tempo_bpm,
        audio_refs,
        note_tracks,
    })
}

fn decode_ableton_xml(compressed: &[u8]) -> Result<Vec<u8>, String> {
    if compressed.starts_with(b"<?xml") || compressed.starts_with(b"<Ableton") {
        if compressed.len() as u64 > MAX_XML_BYTES {
            return Err("Ableton Live XML is too large for this release.".to_string());
        }
        return Ok(compressed.to_vec());
    }
    let mut decoder = GzDecoder::new(compressed);
    let mut xml = Vec::new();
    decoder
        .by_ref()
        .take(MAX_XML_BYTES + 1)
        .read_to_end(&mut xml)
        .map_err(|err| format!("Could not decompress Ableton Live set: {err}"))?;
    if xml.len() as u64 > MAX_XML_BYTES {
        return Err("Ableton Live XML expands beyond the session-import limit.".to_string());
    }
    Ok(xml)
}

fn parse_wav_info(bytes: &[u8]) -> Result<WavInfo, String> {
    if bytes.len() < 44 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("Session audio is not a supported RIFF/WAVE file.".to_string());
    }
    let mut offset = 12usize;
    let mut sample_rate = 0u32;
    let mut channels = 0u16;
    let mut block_align = 0u16;
    let mut pcm_range = None;
    while offset + 8 <= bytes.len() {
        let chunk_id = &bytes[offset..offset + 4];
        let chunk_size =
            u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().unwrap()) as usize;
        let start = offset + 8;
        let end = start
            .checked_add(chunk_size)
            .ok_or_else(|| "WAV chunk size overflowed.".to_string())?;
        if end > bytes.len() {
            return Err("WAV chunk extends past the end of the file.".to_string());
        }
        if chunk_id == b"fmt " && chunk_size >= 16 {
            channels = u16::from_le_bytes(bytes[start + 2..start + 4].try_into().unwrap());
            sample_rate = u32::from_le_bytes(bytes[start + 4..start + 8].try_into().unwrap());
            block_align = u16::from_le_bytes(bytes[start + 12..start + 14].try_into().unwrap());
        } else if chunk_id == b"data" {
            pcm_range = Some((start, end));
        }
        offset = end + (chunk_size & 1);
    }
    let (pcm_start, pcm_end) =
        pcm_range.ok_or_else(|| "WAV file has no data chunk.".to_string())?;
    if sample_rate == 0 || channels == 0 || block_align == 0 {
        return Err("WAV format metadata is incomplete.".to_string());
    }
    let frames = (pcm_end - pcm_start) as f64 / block_align as f64;
    Ok(WavInfo {
        sample_rate,
        channels,
        duration_seconds: frames / sample_rate as f64,
        pcm_start,
        pcm_end,
    })
}

fn build_pcm_wav(
    pcm: &[u8],
    sample_rate: u32,
    channels: u16,
    bits_per_sample: u16,
) -> Result<Vec<u8>, String> {
    let data_len = u32::try_from(pcm.len())
        .map_err(|_| "PCM essence is too large for a RIFF/WAVE file.".to_string())?;
    let block_align = channels
        .checked_mul(bits_per_sample / 8)
        .ok_or_else(|| "PCM block alignment overflowed.".to_string())?;
    let byte_rate = sample_rate
        .checked_mul(block_align as u32)
        .ok_or_else(|| "PCM byte rate overflowed.".to_string())?;
    let riff_len = 36u32
        .checked_add(data_len)
        .ok_or_else(|| "PCM RIFF size overflowed.".to_string())?;
    let mut wav = Vec::with_capacity(44 + pcm.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&riff_len.to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(pcm);
    Ok(wav)
}

fn validated_zip_entries<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
) -> Result<Vec<ZipEntryInfo>, String> {
    let mut entries = Vec::new();
    let mut total = 0u64;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|err| format!("Could not inspect ZIP entry {index}: {err}"))?;
        let name = entry.name().to_string();
        if !safe_zip_entry_name(&name) {
            return Err(format!("Archive contains an unsafe entry path: {name}"));
        }
        if entry.is_dir() {
            continue;
        }
        if entry.size() > MAX_ARCHIVE_ENTRY_BYTES {
            return Err(format!(
                "Archive entry {name} is too large for session import."
            ));
        }
        if entry.size() > 10 * 1024 * 1024
            && entry.compressed_size() > 0
            && entry.size() / entry.compressed_size().max(1) > MAX_COMPRESSION_RATIO
        {
            return Err(format!(
                "Archive entry {name} has an unsafe compression ratio."
            ));
        }
        total = total
            .checked_add(entry.size())
            .ok_or_else(|| "Archive size overflowed.".to_string())?;
        if total > MAX_ARCHIVE_TOTAL_BYTES {
            return Err("Archive expands beyond the DAW session import limit.".to_string());
        }
        entries.push(ZipEntryInfo { index, name });
    }
    Ok(entries)
}

fn read_zip_entry<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    index: usize,
    limit: u64,
) -> Result<Vec<u8>, String> {
    let mut entry = archive
        .by_index(index)
        .map_err(|err| format!("Could not open ZIP entry {index}: {err}"))?;
    if entry.size() > limit {
        return Err(format!(
            "ZIP entry {} is too large for this import path.",
            entry.name()
        ));
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .by_ref()
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|err| format!("Could not read ZIP entry {}: {err}", entry.name()))?;
    if bytes.len() as u64 > limit {
        return Err(format!(
            "ZIP entry {} exceeded its import limit.",
            entry.name()
        ));
    }
    Ok(bytes)
}

fn extract_zip_entry_to_file<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    index: usize,
    target: &Path,
) -> Result<(), String> {
    let mut entry = archive
        .by_index(index)
        .map_err(|err| format!("Could not open AAF ZIP entry: {err}"))?;
    if entry.size() > MAX_ARCHIVE_ENTRY_BYTES {
        return Err("AAF entry is too large for session import.".to_string());
    }
    let parent = target
        .parent()
        .ok_or_else(|| "AAF temporary path has no parent folder.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|err| format!("Could not create AAF temporary folder: {err}"))?;
    let mut output = File::create(target)
        .map_err(|err| format!("Could not create AAF temporary file: {err}"))?;
    std::io::copy(&mut entry, &mut output)
        .map_err(|err| format!("Could not extract AAF entry: {err}"))?;
    output
        .flush()
        .map_err(|err| format!("Could not flush AAF temporary file: {err}"))
}

fn entry_index_by_name(entries: &[ZipEntryInfo], name: &str) -> Option<usize> {
    let normalized = normalize_archive_name(name);
    entries
        .iter()
        .find(|entry| normalize_archive_name(&entry.name) == normalized)
        .map(|entry| entry.index)
}

fn entry_index_by_base_name(entries: &[ZipEntryInfo], name: &str) -> Option<usize> {
    let wanted = base_name(name).to_ascii_lowercase();
    entries
        .iter()
        .find(|entry| base_name(&entry.name).eq_ignore_ascii_case(&wanted))
        .map(|entry| entry.index)
}

fn index_position(entries: &[ZipEntryInfo], index: usize) -> Result<usize, String> {
    entries
        .iter()
        .position(|entry| entry.index == index)
        .ok_or_else(|| "ZIP entry index disappeared during import.".to_string())
}

fn normalize_archive_name(name: &str) -> String {
    name.replace('\\', "/")
        .trim_start_matches("./")
        .to_ascii_lowercase()
}

fn safe_zip_entry_name(name: &str) -> bool {
    if name.is_empty()
        || name.starts_with('/')
        || name.starts_with('\\')
        || name.contains('\\')
        || name.contains(':')
    {
        return false;
    }
    !Path::new(name).components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    })
}

fn collect_supported_files(
    path: &Path,
    depth: usize,
    output: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if depth > MAX_SCAN_DEPTH {
        return Ok(());
    }
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|err| format!("Could not inspect {}: {err}", path.display()))?;
    if metadata.file_type().is_symlink() {
        return Ok(());
    }
    if metadata.is_file() {
        if is_supported_extension(&lower_extension(path)) {
            output.push(path.to_path_buf());
        }
        return Ok(());
    }
    if !metadata.is_dir() {
        return Ok(());
    }
    let mut children = std::fs::read_dir(path)
        .map_err(|err| format!("Could not read folder {}: {err}", path.display()))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    children.sort();
    for child in children {
        collect_supported_files(&child, depth + 1, output)?;
        if output.len() > MAX_SOURCE_FILES {
            break;
        }
    }
    Ok(())
}

fn find_nearby_file(folder: &Path, name: &str, depth: usize) -> Option<PathBuf> {
    if depth > MAX_SCAN_DEPTH {
        return None;
    }
    let direct = folder.join(name);
    if direct.is_file() {
        return Some(direct);
    }
    let mut entries = std::fs::read_dir(folder)
        .ok()?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.path());
    for entry in entries {
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path).ok()?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_file() && file_name(&path).eq_ignore_ascii_case(&base_name(name)) {
            return Some(path);
        }
        if metadata.is_dir() {
            if let Some(found) = find_nearby_file(&path, name, depth + 1) {
                return Some(found);
            }
        }
    }
    None
}

fn xml_attr(event: &BytesStart<'_>, key: &[u8]) -> Option<String> {
    event
        .attributes()
        .with_checks(false)
        .filter_map(Result::ok)
        .find(|attribute| attribute.key.as_ref() == key)
        .map(|attribute| String::from_utf8_lossy(attribute.value.as_ref()).into_owned())
}

fn xml_attr_f64(event: &BytesStart<'_>, key: &[u8]) -> Option<f64> {
    xml_attr(event, key)?.parse::<f64>().ok()
}

fn read_file_limited(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|err| format!("Could not inspect {}: {err}", path.display()))?;
    if metadata.len() > limit {
        return Err(format!(
            "{} is too large for this import path.",
            path.display()
        ));
    }
    std::fs::read(path).map_err(|err| format!("Could not read {}: {err}", path.display()))
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path)
        .map_err(|err| format!("Could not open {} for hashing: {err}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|err| format!("Could not hash {}: {err}", path.display()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex_digest(hasher.finalize().as_slice()))
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex_digest(hasher.finalize().as_slice())
}

fn hex_digest(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn write_file_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Session cache path has no parent folder.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|err| format!("Could not create session cache folder: {err}"))?;
    let temp = path.with_extension("wav.tmp");
    std::fs::write(&temp, bytes)
        .map_err(|err| format!("Could not write session audio cache: {err}"))?;
    match std::fs::rename(&temp, path) {
        Ok(()) => Ok(()),
        Err(_) if path.exists() => {
            let _ = std::fs::remove_file(&temp);
            Ok(())
        }
        Err(err) => Err(format!("Could not finalize session audio cache: {err}")),
    }
}

fn session_cache_root() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("Pocket DAW")
        .join("session-imports")
}

fn title_from_paths(paths: &[PathBuf]) -> String {
    let candidate = if paths.len() == 1 && paths[0].is_dir() {
        paths[0]
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Imported Session")
    } else {
        paths[0]
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("Imported Session")
    };
    let mut title = candidate.trim().to_string();
    for suffix in [
        " files",
        " project",
        "-dawproject",
        "-aaf",
        "-als",
        "-stems",
        "-midis",
    ] {
        if title.to_ascii_lowercase().ends_with(suffix) {
            title.truncate(title.len().saturating_sub(suffix.len()));
            title = title.trim().to_string();
            break;
        }
    }
    if title.is_empty() || matches!(title.to_ascii_lowercase().as_str(), "stems" | "midis") {
        "Imported Session".to_string()
    } else {
        title
    }
}

fn role_from_name(name: &str) -> String {
    let lower = name.to_ascii_lowercase();
    for role in ["drums", "bass", "guitar", "vocal", "synth", "other"] {
        if lower.contains(role) || (role == "vocal" && lower.contains("voice")) {
            return role.to_string();
        }
    }
    let clean = base_name(name)
        .trim_end_matches(".wav")
        .trim_end_matches(".mid")
        .trim_end_matches(".midi")
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if clean.is_empty() {
        "media".to_string()
    } else {
        clean
    }
}

fn base_name(name: &str) -> String {
    name.replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or(name)
        .to_string()
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("media")
        .to_string()
}

fn lower_extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn is_supported_extension(extension: &str) -> bool {
    matches!(
        extension,
        "zip" | "dawproject" | "als" | "aaf" | "wav" | "mid" | "midi"
    )
}

fn is_wav_name(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".wav")
}

fn is_midi_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".mid") || lower.ends_with(".midi")
}

fn format_rank(format: &str) -> usize {
    match format {
        "stems" => 0,
        "midi" => 1,
        "ableton-live" => 2,
        "dawproject" => 3,
        "aaf" => 4,
        _ => 5,
    }
}

fn round_six(value: f64) -> f64 {
    (value * 1_000_000.0).round() / 1_000_000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_zip_paths() {
        assert!(safe_zip_entry_name("audio/bass.wav"));
        assert!(!safe_zip_entry_name("../bass.wav"));
        assert!(!safe_zip_entry_name("C:/bass.wav"));
        assert!(!safe_zip_entry_name("audio\\bass.wav"));
    }

    #[test]
    fn builds_and_reads_pcm_wav() {
        let pcm = vec![0u8; 44_100 * 4];
        let wav = build_pcm_wav(&pcm, 44_100, 2, 16).unwrap();
        let info = parse_wav_info(&wav).unwrap();
        assert_eq!(info.sample_rate, 44_100);
        assert_eq!(info.channels, 2);
        assert_eq!(info.duration_seconds, 1.0);
        assert_eq!(&wav[info.pcm_start..info.pcm_end], pcm.as_slice());
    }

    #[test]
    fn parses_dawproject_audio_notes_and_tempo() {
        let xml = br#"<Project><Transport><Tempo value="120.000000"/></Transport><Structure><Track contentType="audio" id="audio1" name="bass"/><Track contentType="notes" id="midi1" name="bass"/></Structure><Arrangement><Lanes><Lanes track="audio1"><Clip time="0"><Audio><File path="audio/bass.wav"/></Audio></Clip></Lanes><Lanes track="midi1"><Clip time="2"><Notes><Note time="1.5" duration="0.5" channel="0" key="42" vel="0.8"/></Notes></Clip></Lanes></Lanes></Arrangement></Project>"#;
        let parsed = parse_dawproject_xml(xml, "fixture.dawproject").unwrap();
        assert_eq!(parsed.fixed_tempo_bpm, Some(120.0));
        assert_eq!(parsed.audio_refs[0].entry, "audio/bass.wav");
        assert_eq!(parsed.note_tracks[0].notes[0].start_beat, 3.5);
        assert_eq!(parsed.note_tracks[0].notes[0].pitch, 42);
        assert_eq!(parsed.note_tracks[0].notes[0].velocity, 102);
    }

    #[test]
    fn parses_ableton_audio_notes_and_tempo() {
        let xml = br#"<Ableton><LiveSet><MasterTrack><DeviceChain><Mixer><Tempo><Manual Value="120"/></Tempo></Mixer></DeviceChain></MasterTrack><Tracks><AudioTrack><Name><EffectiveName Value="bass"/></Name><DeviceChain><MainSequencer><Sample><AudioClip Time="0"><SampleRef><FileRef><Name Value="bass.wav"/></FileRef></SampleRef></AudioClip></Sample></MainSequencer></DeviceChain></AudioTrack><MidiTrack><Name><EffectiveName Value="bass"/></Name><DeviceChain><MainSequencer><ClipTimeable><MidiClip Time="2"><Notes><KeyTracks><KeyTrack><Notes><MidiNoteEvent Time="1.5" Duration="0.5" Velocity="100"/></Notes><MidiKey Value="42"/></KeyTrack></KeyTracks></Notes></MidiClip></ClipTimeable></MainSequencer></DeviceChain></MidiTrack></Tracks></LiveSet></Ableton>"#;
        let parsed = parse_ableton_xml(xml, "fixture.als").unwrap();
        assert_eq!(parsed.fixed_tempo_bpm, Some(120.0));
        assert_eq!(parsed.audio_refs[0].entry, "bass.wav");
        assert_eq!(parsed.note_tracks[0].notes[0].start_beat, 3.5);
        assert_eq!(parsed.note_tracks[0].notes[0].pitch, 42);
    }

    #[test]
    #[ignore = "requires POCKET_DAW_SESSION_FIXTURE pointing at an owned external session folder"]
    fn imports_external_session_fixture() {
        let path = std::env::var("POCKET_DAW_SESSION_FIXTURE")
            .expect("POCKET_DAW_SESSION_FIXTURE is required");
        let payload = import_session_paths(vec![PathBuf::from(path)]).unwrap();
        eprintln!(
            "session import: title={} formats={:?} audio={} midi={} notes={} warnings={:?}",
            payload.title,
            payload.formats,
            payload.audio_assets.len(),
            payload.midi_assets.len(),
            payload.note_tracks.len(),
            payload.warnings
        );
        assert!(payload.audio_assets.len() >= 6);
        assert!(payload.midi_assets.len() >= 6);
        assert!(payload.note_tracks.len() >= 6);
        assert!(payload.formats.iter().any(|format| format == "aaf"));
        assert!(payload
            .formats
            .iter()
            .any(|format| format == "ableton-live"));
        assert!(payload.formats.iter().any(|format| format == "dawproject"));

        let mut pcm_by_role = BTreeMap::<String, std::collections::HashSet<String>>::new();
        for asset in &payload.audio_assets {
            pcm_by_role
                .entry(asset.role.clone())
                .or_default()
                .insert(asset.pcm_checksum.clone());
        }
        assert_eq!(pcm_by_role.len(), 6);
        assert!(
            pcm_by_role.values().all(|checksums| checksums.len() == 1),
            "every source format should resolve to the same PCM for each stem role"
        );

        if let Ok(output_path) = std::env::var("POCKET_DAW_SESSION_PAYLOAD_JSON") {
            let json = serde_json::to_string_pretty(&payload).unwrap();
            std::fs::write(output_path, json).unwrap();
        }
    }
}

//! Original implementation of Pocket Audio's Campfire recipe 1. No game code
//! is vendored. PCM preparation belongs before starting the render worker.
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum TailPolicy {
    ReferenceCut,
    Fade5Ms,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct NoteIdentity {
    midi: u8,
    seed: u32,
    tail: TailPolicy,
}

pub struct NoteBank {
    sample_rate: u32,
    max_bytes: usize,
    bytes: usize,
    notes: HashMap<NoteIdentity, Arc<[f32]>>,
}

pub struct EventSpec {
    pub notes: Vec<u8>,
    pub velocity: f64,
    pub up: bool,
    pub seed: Option<u32>,
    pub tail: TailPolicy,
    pub strum_seconds: f64,
}

struct PreparedVoice {
    pcm: Arc<[f32]>,
    offset_frames: usize,
}

pub struct PreparedEvent {
    sample_rate: u32,
    voices: Vec<PreparedVoice>,
    velocity: f64,
    frames: usize,
}

impl NoteBank {
    pub fn new(sample_rate: u32, max_bytes: usize) -> Result<Self, String> {
        if !(8000..=192000).contains(&sample_rate) || max_bytes > 64 * 1024 * 1024 {
            return Err(
                "Campfire requires an 8–192 kHz rate and a PCM budget at most 64 MiB.".into(),
            );
        }
        Ok(Self {
            sample_rate,
            max_bytes,
            bytes: 0,
            notes: HashMap::new(),
        })
    }

    pub fn prepare(&mut self, mut spec: EventSpec) -> Result<PreparedEvent, String> {
        if spec.notes.is_empty()
            || spec.notes.len() > 12
            || spec.notes.iter().any(|midi| !(36..=96).contains(midi))
        {
            return Err("Campfire supports 1–12 ordered notes in MIDI range 36–96.".into());
        }
        if !spec.velocity.is_finite()
            || !(0.0..=1.4).contains(&spec.velocity)
            || !spec.strum_seconds.is_finite()
            || !(0.0..=0.1).contains(&spec.strum_seconds)
        {
            return Err("Campfire requires velocity 0–1.4 and strum spacing 0–100 ms.".into());
        }
        if spec.up {
            spec.notes.reverse();
        }
        let identities = spec
            .notes
            .iter()
            .map(|midi| NoteIdentity {
                midi: *midi,
                seed: spec.seed.unwrap_or(*midi as u32 * 311),
                tail: spec.tail,
            })
            .collect::<Vec<_>>();
        let note_bytes = (self.sample_rate as usize * 3 / 2) * std::mem::size_of::<f32>();
        let missing = identities
            .iter()
            .filter(|identity| !self.notes.contains_key(identity))
            .collect::<std::collections::HashSet<_>>()
            .len();
        if self
            .bytes
            .saturating_add(missing.saturating_mul(note_bytes))
            > self.max_bytes
        {
            return Err("Campfire prepared PCM exceeds its 64 MiB working-set budget. Reduce note/seed identities or use rendered audio assets.".into());
        }
        let mut voices = Vec::with_capacity(identities.len());
        let mut frames = 0;
        for (index, identity) in identities.into_iter().enumerate() {
            let pcm = self.notes.entry(identity).or_insert_with(|| {
                self.bytes += note_bytes;
                render_note(self.sample_rate, identity).into()
            });
            let offset_frames =
                (index as f64 * spec.strum_seconds * self.sample_rate as f64).round() as usize;
            frames = frames.max(offset_frames + pcm.len());
            voices.push(PreparedVoice {
                pcm: Arc::clone(pcm),
                offset_frames,
            });
        }
        Ok(PreparedEvent {
            sample_rate: self.sample_rate,
            voices,
            velocity: spec.velocity,
            frames,
        })
    }
}

impl PreparedEvent {
    pub fn duration_seconds(&self) -> f64 {
        self.frames as f64 / self.sample_rate as f64
    }

    pub fn sample(&self, local: f64) -> f32 {
        if !local.is_finite() || local < 0.0 {
            return 0.0;
        }
        // Native t is derived from sample position. Tiny floating subtraction
        // error must not move an exact frame into the preceding sample.
        let frame = (local * self.sample_rate as f64 + 1e-7).floor() as usize;
        if frame >= self.frames {
            return 0.0;
        }
        let mut out = 0.0_f32;
        for voice in &self.voices {
            if let Some(index) = frame.checked_sub(voice.offset_frames) {
                if let Some(value) = voice.pcm.get(index) {
                    out = (out as f64 + *value as f64 * self.velocity * 0.36) as f32;
                }
            }
        }
        out
    }
}

fn render_note(sample_rate: u32, identity: NoteIdentity) -> Vec<f32> {
    let frequency = 440.0_f64 * 2.0_f64.powf((identity.midi as f64 - 69.0) / 12.0);
    let delay = (sample_rate as f64 / frequency).round() as usize;
    let mut pcm = vec![0.0; sample_rate as usize * 3 / 2];
    let mut state = identity.seed;
    for value in pcm.iter_mut().take(delay) {
        state = state.wrapping_mul(1664525).wrapping_add(1013904223);
        *value = ((state as f64 / 4294967296.0 - 0.5) * 0.45) as f32;
    }
    for frame in delay..pcm.len() {
        pcm[frame] = ((pcm[frame - delay] as f64 + pcm[frame - delay + 1] as f64) * 0.496) as f32;
    }
    if identity.tail == TailPolicy::Fade5Ms {
        let fade = (sample_rate as f64 * 0.005).round().max(2.0) as usize;
        let start = pcm.len() - fade;
        for index in 0..fade {
            pcm[start + index] =
                (pcm[start + index] as f64 * (1.0 - index as f64 / (fade - 1) as f64)) as f32;
        }
    }
    pcm
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    fn spec(notes: Vec<u8>) -> EventSpec {
        EventSpec {
            notes,
            velocity: 1.0,
            up: false,
            seed: None,
            tail: TailPolicy::ReferenceCut,
            strum_seconds: 0.027,
        }
    }

    #[test]
    fn native_dry_pcm_matches_all_independent_core_reference_hashes() {
        let fixtures: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../packages/pocket-audio-core/tests/fixtures/campfire-reference-hashes.json"
        ))
        .unwrap();
        for fixture in fixtures["records"].as_array().unwrap() {
            let rate = fixture["sampleRate"].as_u64().unwrap() as u32;
            let midi = fixture["midi"].as_u64().unwrap() as u8;
            let pcm = render_note(
                rate,
                NoteIdentity {
                    midi,
                    seed: midi as u32 * 311,
                    tail: TailPolicy::ReferenceCut,
                },
            );
            let bytes = pcm
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect::<Vec<_>>();
            assert_eq!(
                format!("{:x}", Sha256::digest(bytes)),
                fixture["sha256"].as_str().unwrap(),
                "{rate}/{midi}"
            );
        }
    }

    #[test]
    fn preparation_deduplicates_identity_and_scheduler_never_builds_pcm() {
        let mut bank = NoteBank::new(48000, 64 * 1024 * 1024).unwrap();
        let event = bank.prepare(spec(vec![50, 57, 62, 66])).unwrap();
        let again = bank.prepare(spec(vec![50, 57, 62, 66])).unwrap();
        assert_eq!(bank.notes.len(), 4);
        assert_eq!(bank.bytes, 4 * 72000 * 4);
        assert!(Arc::ptr_eq(&event.voices[0].pcm, &again.voices[0].pcm));
        assert_eq!(event.frames, 72000 + 3888);
        let first = render_note(
            48000,
            NoteIdentity {
                midi: 50,
                seed: 50 * 311,
                tail: TailPolicy::ReferenceCut,
            },
        );
        for (frame, value) in first.iter().enumerate().take(1296) {
            assert_eq!(
                event.sample(frame as f64 / 48000.0),
                (*value as f64 * 0.36) as f32
            );
        }
        assert_eq!(event.sample(-0.01), 0.0);
        assert_eq!(event.sample(event.duration_seconds()), 0.0);
        assert!(event.sample(1.0).abs() > 0.0);
    }

    #[test]
    fn seed_tail_and_strum_order_are_explicit_and_bounded() {
        let mut bank = NoteBank::new(48000, 64 * 1024 * 1024).unwrap();
        let down = bank.prepare(spec(vec![50, 57])).unwrap();
        let mut changed = spec(vec![50, 57]);
        changed.up = true;
        let up = bank.prepare(changed).unwrap();
        assert_ne!(down.sample(0.0), up.sample(0.0));
        let mut changed = spec(vec![50]);
        changed.seed = Some(123);
        changed.tail = TailPolicy::Fade5Ms;
        let faded = bank.prepare(changed).unwrap();
        assert_eq!(bank.notes.len(), 3);
        assert_eq!(faded.voices[0].pcm.last(), Some(&0.0));
        let mut tiny = NoteBank::new(48000, 1).unwrap();
        assert!(tiny.prepare(spec(vec![50])).is_err());
        assert!(tiny.notes.is_empty());
        assert!(bank.prepare(spec(vec![35])).is_err());
        assert!(bank.prepare(spec(vec![50; 13])).is_err());
    }

    #[test]
    fn native_ordered_events_match_canonical_core_pcm_with_seed_gain_and_fade() {
        let fixtures: serde_json::Value = serde_json::from_str(include_str!("../../../../packages/pocket-audio-core/tests/fixtures/campfire-event-reference-hashes.json")).unwrap();
        for fixture in fixtures["records"].as_array().unwrap() {
            let rate = fixture["sampleRate"].as_u64().unwrap() as u32;
            let event = &fixture["event"];
            let mut bank = NoteBank::new(rate, 64 * 1024 * 1024).unwrap();
            let voice = bank
                .prepare(EventSpec {
                    notes: event["midiNotes"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|value| value.as_u64().unwrap() as u8)
                        .collect(),
                    velocity: event["velocity"].as_f64().unwrap(),
                    up: event["direction"].as_str() == Some("up"),
                    seed: Some(123),
                    tail: TailPolicy::Fade5Ms,
                    strum_seconds: 0.027,
                })
                .unwrap();
            assert_eq!(voice.frames, fixture["frames"].as_u64().unwrap() as usize);
            let bytes = (0..voice.frames)
                .flat_map(|frame| voice.sample(frame as f64 / rate as f64).to_le_bytes())
                .collect::<Vec<_>>();
            assert_eq!(
                format!("{:x}", Sha256::digest(bytes)),
                fixture["sha256"].as_str().unwrap(),
                "{rate}/{}",
                event["direction"]
            );
        }
    }
}

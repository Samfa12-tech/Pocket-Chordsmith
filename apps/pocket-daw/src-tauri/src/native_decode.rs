use std::io::Cursor;

use symphonia::core::audio::sample::Sample;
use symphonia::core::audio::GenericAudioBufferRef;
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::errors::Error;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;

pub const SYMPHONIA_DECODER_LABEL: &str = "symphonia-0.6";

#[derive(Clone, Debug)]
pub struct NativeDecodedAudio {
    pub wav_bytes: Vec<u8>,
    pub sample_rate: u32,
    pub channels: u16,
    pub duration_seconds: f64,
    pub frame_count: usize,
    pub format: String,
}

pub fn decode_audio_to_wav(
    bytes: &[u8],
    extension: Option<&str>,
) -> Result<NativeDecodedAudio, String> {
    if bytes.is_empty() {
        return Err("Audio file was empty.".to_string());
    }
    let mut hint = Hint::new();
    if let Some(ext) = extension.and_then(clean_extension) {
        hint.with_extension(ext);
    }
    let source = Box::new(Cursor::new(bytes.to_vec()));
    let media = MediaSourceStream::new(source, MediaSourceStreamOptions::default());
    let probed = symphonia::default::get_probe()
        .probe(
            &hint,
            media,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|err| format!("Symphonia could not recognize this audio file: {err}"))?;
    let mut format = probed;
    let track = format
        .default_track(TrackType::Audio)
        .ok_or_else(|| "Symphonia did not find a decodable audio track.".to_string())?;
    let track_id = track.id;
    let codec_params = track
        .codec_params
        .as_ref()
        .and_then(|params| params.audio())
        .ok_or_else(|| "Symphonia audio track did not include codec parameters.".to_string())?
        .clone();
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(&codec_params, &AudioDecoderOptions::default())
        .map_err(|err| format!("Symphonia could not create an audio decoder: {err}"))?;

    let mut sample_rate = codec_params.sample_rate.unwrap_or(0);
    let mut channels = codec_params
        .channels
        .map(|channels| channels.count() as u16)
        .unwrap_or(0);
    let mut samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(Some(packet)) => packet,
            Ok(None) => break,
            Err(Error::IoError(err)) if err.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(Error::ResetRequired) => {
                return Err("Symphonia stream reset is not supported for this import.".to_string())
            }
            Err(err) => return Err(format!("Symphonia could not read audio packet: {err}")),
        };
        if packet.track_id != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(Error::DecodeError(_)) => continue,
            Err(err) => return Err(format!("Symphonia could not decode audio packet: {err}")),
        };
        sample_rate = decoded.spec().rate();
        channels = decoded.spec().channels().count() as u16;
        if channels == 0 || channels > 2 {
            return Err(
                "Pocket DAW native decode currently supports mono or stereo audio.".to_string(),
            );
        }
        append_interleaved_f32(decoded, &mut samples);
    }

    if sample_rate == 0 || channels == 0 || samples.is_empty() {
        return Err("Symphonia decoded no playable audio samples.".to_string());
    }
    let frame_count = samples.len() / channels as usize;
    let duration_seconds = frame_count as f64 / sample_rate as f64;
    let wav_bytes = write_pcm16_wav(&samples, sample_rate, channels)?;
    Ok(NativeDecodedAudio {
        wav_bytes,
        sample_rate,
        channels,
        duration_seconds,
        frame_count,
        format: extension
            .and_then(clean_extension)
            .unwrap_or("unknown")
            .to_string(),
    })
}

fn append_interleaved_f32(decoded: GenericAudioBufferRef<'_>, out: &mut Vec<f32>) {
    let start = out.len();
    out.resize(start + decoded.samples_interleaved(), f32::MID);
    decoded.copy_to_slice_interleaved(&mut out[start..]);
}

fn write_pcm16_wav(samples: &[f32], sample_rate: u32, channels: u16) -> Result<Vec<u8>, String> {
    let data_len = samples
        .len()
        .checked_mul(2)
        .ok_or_else(|| "Decoded WAV data length overflowed.".to_string())?;
    let riff_len = 36usize
        .checked_add(data_len)
        .ok_or_else(|| "Decoded WAV RIFF length overflowed.".to_string())?;
    if riff_len > u32::MAX as usize || data_len > u32::MAX as usize {
        return Err("Decoded WAV is too large for this release.".to_string());
    }
    let byte_rate = sample_rate
        .checked_mul(channels as u32)
        .and_then(|value| value.checked_mul(2))
        .ok_or_else(|| "Decoded WAV byte rate overflowed.".to_string())?;
    let block_align = channels
        .checked_mul(2)
        .ok_or_else(|| "Decoded WAV block alignment overflowed.".to_string())?;

    let mut bytes = Vec::with_capacity(44 + data_len);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(riff_len as u32).to_le_bytes());
    bytes.extend_from_slice(b"WAVE");
    bytes.extend_from_slice(b"fmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&channels.to_le_bytes());
    bytes.extend_from_slice(&sample_rate.to_le_bytes());
    bytes.extend_from_slice(&byte_rate.to_le_bytes());
    bytes.extend_from_slice(&block_align.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&(data_len as u32).to_le_bytes());
    for sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let raw = (clamped * i16::MAX as f32).round() as i16;
        bytes.extend_from_slice(&raw.to_le_bytes());
    }
    Ok(bytes)
}

fn clean_extension(value: &str) -> Option<&str> {
    let ext = value.trim().trim_start_matches('.').to_ascii_lowercase();
    if ext.is_empty() {
        return None;
    }
    match ext.as_str() {
        "wav" | "wave" => Some("wav"),
        "mp3" => Some("mp3"),
        "ogg" | "oga" | "vorbis" => Some("ogg"),
        "flac" => Some("flac"),
        "aif" | "aiff" => Some("aiff"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_audio_bytes() {
        let err = decode_audio_to_wav(b"not audio", Some("wav")).expect_err("invalid bytes");
        assert!(
            err.contains("Symphonia") || err.contains("decoded no playable"),
            "{err}"
        );
    }

    #[test]
    fn decodes_pcm_wav_to_playable_wav_metadata() {
        let source = tiny_pcm16_wav();
        let decoded = decode_audio_to_wav(&source, Some("wav")).expect("decode wav");

        assert_eq!(decoded.sample_rate, 48_000);
        assert_eq!(decoded.channels, 2);
        assert_eq!(decoded.frame_count, 2);
        assert_eq!(&decoded.wav_bytes[0..4], b"RIFF");
        assert_eq!(&decoded.wav_bytes[8..12], b"WAVE");
        assert!(decoded.duration_seconds > 0.0);
    }

    fn tiny_pcm16_wav() -> Vec<u8> {
        let samples = [0i16, i16::MAX / 2, -i16::MAX / 2, 0];
        let data_len = samples.len() * 2;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36u32 + data_len as u32).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&2u16.to_le_bytes());
        bytes.extend_from_slice(&48_000u32.to_le_bytes());
        bytes.extend_from_slice(&(48_000u32 * 2 * 2).to_le_bytes());
        bytes.extend_from_slice(&4u16.to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&(data_len as u32).to_le_bytes());
        for sample in samples {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        bytes
    }
}

@tool
extends RefCounted
## Pure prepared-stream policy. Callers own cache publication and warning delivery.
## Worker callers pass a main-thread output-rate snapshot; no scene/audio-server access.

static func prepare(source: AudioStream, loop_sections: bool, output_mix_rate: int) -> Dictionary:
	var result := {"stream": source, "cache_prepared": true, "warning": ""}
	if not (source is AudioStreamWAV):
		return result
	var wav := source as AudioStreamWAV
	if wav.loop_mode != AudioStreamWAV.LOOP_DISABLED:
		result.cache_prepared = false
		return result # Preserve authored loop points and length exactly.
	if wav.format != AudioStreamWAV.FORMAT_16_BITS and wav.format != AudioStreamWAV.FORMAT_8_BITS:
		result.warning = "Prepared WAV ending preservation requires lossless PCM import; compressed stream is unchanged."
		return result
	if loop_sections:
		var looped := wav.duplicate() as AudioStreamWAV
		var loop_frame_bytes := (2 if wav.format == AudioStreamWAV.FORMAT_16_BITS else 1) * (2 if wav.stereo else 1)
		looped.loop_begin = 0
		looped.loop_end = wav.data.size() / loop_frame_bytes
		looped.loop_mode = AudioStreamWAV.LOOP_FORWARD
		looped.set_meta("pcs_native_section_loop", true)
		result.stream = looped
		return result
	# Keep the existing lookahead/resampler guard entirely in trailing silence.
	# Duplicate the resource; never mutate imported/caller-owned PCM or files.
	var guard_frames := ceili(128.0 * wav.mix_rate / maxf(1.0, output_mix_rate)) + 4
	if guard_frames > 4096:
		result.warning = "Prepared WAV rate needs an unsupported ending guard; stream is unchanged."
		return result
	guard_frames = maxi(8, guard_frames)
	var guarded := wav.duplicate() as AudioStreamWAV
	var pcm := wav.data
	var frame_bytes := (2 if wav.format == AudioStreamWAV.FORMAT_16_BITS else 1) * (2 if wav.stereo else 1)
	var content_frames := pcm.size() / frame_bytes
	var content_bytes := pcm.size()
	pcm.resize(pcm.size() + guard_frames * frame_bytes)
	for index in range(content_bytes, pcm.size()):
		pcm[index] = 0
	guarded.data = pcm
	guarded.set_meta("pcs_content_frames", content_frames)
	guarded.set_meta("pcs_eof_guard_frames", guard_frames)
	guarded.set_meta("pcs_guard_mix_rate", output_mix_rate)
	result.stream = guarded
	return result

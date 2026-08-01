/// Fixed outer processing quantum shared with the future plug-in-host protocol.
/// Existing built-in DSP remains sample-accurate inside each block.
pub(crate) const NATIVE_AUDIO_BLOCK_FRAMES: usize = 128;

pub(crate) fn for_each_output_block<T>(
    output: &mut [T],
    channels: usize,
    mut process: impl FnMut(&mut [T]),
) {
    let samples_per_block = channels
        .max(1)
        .saturating_mul(NATIVE_AUDIO_BLOCK_FRAMES)
        .max(1);
    for block in output.chunks_mut(samples_per_block) {
        process(block);
    }
}

pub(crate) fn for_each_frame_block(frame_count: usize, mut process: impl FnMut(usize)) {
    let mut remaining = frame_count;
    while remaining > 0 {
        let block_frames = remaining.min(NATIVE_AUDIO_BLOCK_FRAMES);
        process(block_frames);
        remaining -= block_frames;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_blocks_are_bounded_and_preserve_every_sample() {
        let mut output = vec![0_u8; 2 * NATIVE_AUDIO_BLOCK_FRAMES + 19];
        let mut block_lengths = Vec::new();
        for_each_output_block(&mut output, 2, |block| {
            block_lengths.push(block.len());
            block.fill(1);
        });
        assert_eq!(block_lengths, vec![256, 19]);
        assert!(output.iter().all(|sample| *sample == 1));
    }

    #[test]
    fn frame_blocks_are_bounded_and_cover_the_exact_duration() {
        let mut blocks = Vec::new();
        for_each_frame_block(300, |frames| blocks.push(frames));
        assert_eq!(blocks, vec![128, 128, 44]);
        assert_eq!(blocks.iter().sum::<usize>(), 300);
    }
}

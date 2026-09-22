/* exported createSchedulerTiming, elapsedSchedulerPlanSeconds, schedulerStepsToReach */
function createSchedulerTiming(durations){
  const prefix = [0];
  durations.forEach(duration => {
    prefix.push(prefix[prefix.length - 1] + Math.max(0, Number(duration) || 0));
  });
  return {prefix, total:prefix[prefix.length - 1] || 0};
}

function elapsedSchedulerPlanSeconds(stepCount, playStep, timing){
  const planLength = timing.prefix.length - 1;
  if(!planLength || stepCount <= 0) return 0;
  const cycles = Math.floor(stepCount / planLength);
  const remainder = stepCount % planLength;
  const position = playStep % planLength;
  const end = position + remainder;
  const partial = end <= planLength
    ? timing.prefix[end] - timing.prefix[position]
    : timing.total - timing.prefix[position] + timing.prefix[end - planLength];
  return cycles * timing.total + partial;
}

function schedulerStepsToReach(nextNoteTime, targetTime, playStep, timing){
  const overdueSeconds = targetTime - nextNoteTime;
  if(overdueSeconds <= 0 || timing.total <= 0) return 0;
  let low = 0;
  let high = 1;
  while(elapsedSchedulerPlanSeconds(high, playStep, timing) < overdueSeconds && high < Number.MAX_SAFE_INTEGER / 2) high *= 2;
  while(low + 1 < high){
    const middle = low + Math.floor((high - low) / 2);
    if(elapsedSchedulerPlanSeconds(middle, playStep, timing) < overdueSeconds) low = middle;
    else high = middle;
  }
  return high;
}

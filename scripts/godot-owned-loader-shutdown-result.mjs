/** Require both lifecycle markers; a silent or unresumed shutdown waiter is not a pass. */
export function assertGodotOwnedLoaderShutdownResult(stdout) {
  const records = String(stdout || "").split(/\r?\n/).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const requireOne = name => {
    const matches = records.filter(record => record?.test === name);
    if (matches.length !== 1) throw new Error(`Expected exactly one ${name} marker, found ${matches.length}`);
    return matches[0];
  };
  const started = requireOne("owned-loader-shutdown");
  if (started.worker_live_at_quit !== true || started.actual_resource_loaded !== true || started.created_jobs !== 1) {
    throw new Error("Shutdown probe must quit with one actual loaded worker still live");
  }
  const completed = requireOne("owned-loader-shutdown-result");
  if (completed.cancelled !== true || completed.ok !== false || completed.created_jobs !== 1) {
    throw new Error("Shutdown waiter must complete cancelled, unsuccessful, with exactly one created job");
  }
  return completed;
}

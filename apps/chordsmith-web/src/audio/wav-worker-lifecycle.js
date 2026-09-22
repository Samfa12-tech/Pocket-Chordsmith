/* exported awaitPocketAudioWavWorkerResult */
function awaitPocketAudioWavWorkerResult({workerJob, id, payload, isCurrent, onRendering, setActiveWorker, clearActiveWorker}){
  const {worker, blobUrl} = workerJob;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if(settled) return;
      settled = true;
      worker.terminate();
      if(blobUrl) URL.revokeObjectURL(blobUrl);
      clearActiveWorker(worker);
      callback(value);
    };
    const cancel = () => finish(reject, new DOMException("WAV export cancelled", "AbortError"));

    setActiveWorker({worker, cancel});
    worker.onmessage = event => {
      const message = event.data || {};
      if(message.id !== id) return;
      if(!isCurrent()) return cancel();
      if(message.state === "rendering") return onRendering();
      if(!message.ok) return finish(reject, new Error(message.error || "Pocket Audio Core worker failed."));
      finish(resolve, new Blob([message.bytes], {type:message.type || "audio/wav"}));
    };
    worker.onerror = event => finish(reject, new Error(event.message || "Pocket Audio Core worker failed to load."));
    try{
      worker.postMessage(payload);
    }catch(error){
      finish(reject, error);
    }
  });
}

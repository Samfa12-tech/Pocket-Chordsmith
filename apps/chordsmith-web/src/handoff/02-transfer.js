function utf8ToBase64Url(text){
  const bytes = new TextEncoder().encode(text);
  if(bytes.byteLength > PCS_MAX_DECODED_BYTES) throw projectPayloadTooLargeError();
  let binary = "";
  const chunkSize = 0x8000;
  for(let i = 0; i < bytes.length; i += chunkSize){
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlToUtf8(value){
  if(value.length > PCS_MAX_ENCODED_CHARS) throw projectPayloadTooLargeError();
  if(!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("PCS1 payload contains invalid base64url characters.");
  if(Math.floor(value.length * 3 / 4) > PCS_MAX_DECODED_BYTES) throw projectPayloadTooLargeError();
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  if(binary.length > PCS_MAX_DECODED_BYTES) throw projectPayloadTooLargeError();
  const bytes = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8", {fatal:true}).decode(bytes);
}
function projectPayloadTooLargeError(){
  const error = new RangeError(`Project payload exceeds ${PCS_MAX_DECODED_BYTES} decoded bytes.`);
  error.code = "PROJECT_PAYLOAD_TOO_LARGE";
  return error;
}
function assertRawProjectTextSize(value){
  const text = String(value || "");
  if(text.length > PCS_MAX_DECODED_BYTES || new TextEncoder().encode(text).byteLength > PCS_MAX_DECODED_BYTES) throw projectPayloadTooLargeError();
  return text;
}
function buildShareCode(){
  const compact = JSON.stringify(exportProject());
  return `${SHARE_CODE_PREFIX}${utf8ToBase64Url(compact)}`;
}
function parseShareCode(text){
  const source = String(text || "");
  if(source.length > PCS_MAX_ENCODED_CHARS + SHARE_CODE_PREFIX.length) throw projectPayloadTooLargeError();
  const trimmed = source.trim();
  if(!trimmed.startsWith(SHARE_CODE_PREFIX)){
    if(trimmed.startsWith("{") || trimmed.startsWith("[")) throw new Error("This looks like raw JSON. Press Import to auto-detect it.");
    throw new Error("This does not look like a PCS1 share code or raw JSON project.");
  }
  const payload = trimmed.slice(SHARE_CODE_PREFIX.length).trim();
  if(!payload) throw new Error("That PCS1 share code is empty.");
  let decoded;
  try{
    decoded = base64UrlToUtf8(payload);
  }catch(e){
    if(e?.code === "PROJECT_PAYLOAD_TOO_LARGE") throw e;
    throw new Error("That PCS1 share code could not be decoded.");
  }
  let parsed;
  try{
    parsed = JSON.parse(decoded);
  }catch(e){
    throw new Error("That PCS1 share code decoded, but the project JSON inside it was invalid.");
  }
  return sanitizeProjectData(parsed);
}
function parseProjectText(text){
  const source = String(text || "");
  if(/^\s*PCS1:/.test(source)) return parseShareCode(source);
  const trimmed = assertRawProjectTextSize(source).trim();
  if(!trimmed) throw new Error("Paste a project JSON or PCS1 share code first.");
  let parsed;
  try{
    parsed = JSON.parse(trimmed);
  }catch(e){
    throw new Error("That does not look like a valid PCS1 share code or raw JSON project.");
  }
  return sanitizeProjectData(parsed);
}
function buildPocketHandoff(kind, code, options={}){
  const createdAt = new Date();
  return {
    app:"PocketHandoff",
    handoffVersion:1,
    kind,
    code,
    createdAt:createdAt.toISOString(),
    nonce: options.nonce || makePocketHandoffNonce(),
    expiresAt: options.expiresAt || new Date(createdAt.getTime() + 10 * 60 * 1000).toISOString(),
    sourceApp:options.sourceApp || "Pocket Chordsmith",
    targetApp:options.targetApp,
    metadata:options.metadata || {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      bpm: state.bpm,
      key: state.key,
      scale: state.scale
    }
  };
}
function makePocketHandoffNonce(){
  try{
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }catch(e){
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  }
}
function encodePocketHandoff(payload){
  return utf8ToBase64Url(JSON.stringify(payload));
}
function decodePocketHandoff(value){
  let decoded, parsed;
  try{
    decoded = base64UrlToUtf8(value);
    parsed = JSON.parse(decoded);
  }catch(e){
    return null;
  }
  if(!parsed || parsed.app !== "PocketHandoff" || typeof parsed.code !== "string") return null;
  return parsed;
}
function buildHandoffUrl(url, payload){
  const encoded = encodePocketHandoff(payload);
  try{
    const parsed = new URL(url);
    if(parsed.protocol === "pocket-daw:"){
      parsed.searchParams.set(HANDOFF_PARAM, encoded);
      return parsed.href;
    }
  }catch(e){}
  const joiner = url.includes("#") ? (/[#&]$/.test(url) ? "" : "&") : "#";
  return `${url}${joiner}${HANDOFF_PARAM}=${encoded}`;
}
function isLocalHandoffHost(){
  const host = window.location.hostname;
  return window.location.protocol === "file:"
    || ["localhost", "127.0.0.1", "::1"].includes(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}
function resolvePocketDjUrl(){
  if(isLocalHandoffHost()){
    try{ return new URL("../pocket-dj/index.html", window.location.href).href; }catch(e){}
  }
  return POCKET_DJ_URL;
}
function resolvePocketDawUrl(){
  return POCKET_DAW_URL;
}
function resolvePocketAudioHandoffUrl(){
  const withRelayOverride = (url) => appendPocketAudioHandoffRelayOverride(url);
  if(isLocalHandoffHost()){
    try{ return withRelayOverride(new URL("../pocket-audio-handoff/index.html", window.location.href).href); }catch(e){}
  }
  return withRelayOverride(POCKET_AUDIO_HANDOFF_URL);
}
function configuredPocketAudioHandoffRelayUrl(){
  if(window.location.protocol !== "file:" && !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) return "";
  try{
    const params = new URL(window.location.href).searchParams;
    const value = params.get("handoffRelay") || params.get("relay");
    if(!value) return "";
    const parsed = new URL(value);
    if(!["http:","https:"].includes(parsed.protocol) || !["localhost","127.0.0.1","::1"].includes(parsed.hostname)) return "";
    return parsed.href.replace(/\/$/,"");
  }catch(e){}
  return "";
}
function appendPocketAudioHandoffRelayOverride(url){
  const relay = configuredPocketAudioHandoffRelayUrl();
  if(!relay) return url;
  try{
    const parsed = new URL(url, window.location.href);
    parsed.searchParams.set("handoffRelay", relay);
    return parsed.href;
  }catch(e){
    return url;
  }
}
function saveHandoffPayload(storageKey, payload){
  try{
    localStorage.setItem(storageKey, JSON.stringify(payload));
    return true;
  }catch(e){
    return false;
  }
}
function clearStoredHandoff(storageKey){
  try{ localStorage.removeItem(storageKey); }catch(e){}
}
function payloadFromParams(params){
  const packed = params.get(HANDOFF_PARAM);
  if(packed){
    const payload = decodePocketHandoff(packed);
    if(payload) return payload;
  }
  const code = params.get("pcs1") || params.get("pcs") || params.get("code") || params.get("import");
  if(code) return buildPocketHandoff("dj-to-chordsmith", code);
  return null;
}
function readUrlHandoff(){
  try{
    const searchPayload = payloadFromParams(new URLSearchParams(window.location.search || ""));
    if(searchPayload) return searchPayload;
    const hash = String(window.location.hash || "").replace(/^#/, "");
    if(hash) return payloadFromParams(new URLSearchParams(hash));
  }catch(e){}
  return null;
}
function readWindowNameHandoff(){
  try{
    const name = String(window.name || "");
    if(!name.startsWith(HANDOFF_WINDOW_PREFIX)) return null;
    const payload = decodePocketHandoff(name.slice(HANDOFF_WINDOW_PREFIX.length));
    window.name = "";
    return payload;
  }catch(e){
    return null;
  }
}
function readStoredHandoff(storageKey){
  try{
    const raw = localStorage.getItem(storageKey);
    if(!raw) return null;
    const payload = JSON.parse(raw);
    if(payload && payload.app === "PocketHandoff" && typeof payload.code === "string") return payload;
  }catch(e){}
  return null;
}
function clearUrlHandoff(){
  if(!window.history || !window.history.replaceState) return;
  try{
    const url = new URL(window.location.href);
    let changed = false;
    [HANDOFF_PARAM, "pcs1", "pcs", "code", "import"].forEach(name => {
      if(url.searchParams.has(name)){ url.searchParams.delete(name); changed = true; }
    });
    if(url.hash){
      const hashText = url.hash.slice(1);
      if([HANDOFF_PARAM, "pcs1", "pcs", "code", "import"].some(name => hashText.includes(`${name}=`))){
        url.hash = "";
        changed = true;
      }
    }
    if(changed) window.history.replaceState(null, document.title, url.href);
  }catch(e){}
}
function isExpectedHandoff(payload, expectedKind){
  if(!payload || typeof payload.code !== "string") return false;
  if(expectedKind && payload.kind && payload.kind !== expectedKind) return false;
  return payload.code.trim().startsWith(SHARE_CODE_PREFIX) || payload.code.trim().startsWith("{");
}
function consumeIncomingChordsmithHandoff(){
  const payload = readUrlHandoff() || readWindowNameHandoff() || readStoredHandoff(HANDOFF_TO_CHORDSMITH_KEY);
  if(!isExpectedHandoff(payload, "dj-to-chordsmith")) return false;
  if(els.projectBox) els.projectBox.value = payload.code;
  try{
    const parsed = parseProjectText(payload.code);
    importProject(parsed);
    markProjectDirty();
    primePocketAudioCoreFromCurrentProject("DJ handoff").catch(() => {});
    setProjectBoxValidation();
    clearStoredHandoff(HANDOFF_TO_CHORDSMITH_KEY);
    clearUrlHandoff();
    setStatus("Song received from Pocket DJ");
    setPushHandoffStatus("Imported the source song from Pocket DJ. DJ mutes, loops and FX stayed in Pocket DJ.");
    return true;
  }catch(e){
    const message = e && e.message ? e.message : "Could not import Pocket DJ handoff";
    setProjectBoxValidation(message);
    setStatus(message);
    setPushHandoffStatus("Pocket DJ sent a code, but Chordsmith could not import it.");
    return false;
  }
}
function setProjectBoxValidation(message=""){
  if(!els.projectBox) return;
  const error = document.getElementById("projectBoxError");
  const invalid = !!message;
  els.projectBox.setAttribute("aria-invalid", invalid ? "true" : "false");
  if(error){
    error.textContent = message;
    error.hidden = !invalid;
  }
}
function importProjectFromTextBox(){
  try{
    const parsed = parseProjectText(els.projectBox.value);
    importProject(parsed);
    markProjectDirty();
    primePocketAudioCoreFromCurrentProject("import").catch(() => {});
    setProjectBoxValidation();
    setStatus(`Project imported${parsed.projectVersion < PROJECT_SCHEMA_VERSION ? " (legacy project normalised)" : ""}`);
    return true;
  }catch(e){
    const message = e && e.message ? e.message : "Could not import project";
    setProjectBoxValidation(message);
    setStatus(message);
    return false;
  }
}
function loadProjectFromStorage(storageKey, emptyMessage, successMessage){
  try{
    const raw = localStorage.getItem(storageKey);
    if(!raw){ setStatus(emptyMessage); return false; }
    const parsed = parseProjectText(raw);
    importProject(parsed);
    primePocketAudioCoreFromCurrentProject("storage load").catch(() => {});
    setStatus(successMessage);
    return true;
  }catch(e){
    setStatus(e && e.message ? e.message : "Could not load project");
    return false;
  }
}

async function copyShareCode(){
  let code = "";
  try{
    code = buildShareCode();
    els.projectBox.value = code;
    setProjectBoxValidation();
  }catch(e){
    setStatus("Could not build Share Code");
    return;
  }
  rememberImmersiveModeBeforeExternalUi();
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(code);
      setStatus("Share Code copied");
    } else {
      setStatus("Share Code ready");
    }
  }catch(e){
    setStatus("Share Code ready in text box; clipboard blocked");
  }finally{
    scheduleImmersiveRestore();
  }
}
function importShareCode(){
  importProjectFromTextBox();
}

async function copyTextForHandoff(text, successMessage, fallbackMessage){
  if(els.projectBox){ els.projectBox.value = text; setProjectBoxValidation(); }
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text);
      setStatus(successMessage);
      return true;
    }
  }catch(e){}
  setStatus(fallbackMessage);
  return false;
}
function downloadTextFallback(filename, text){
  try{
    const blob = new Blob([text], {type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }catch(e){
    return false;
  }
}
function makePocketDawDownloadHandoffFileName(){
  const stamp = Date.now().toString(36);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `pocket-chordsmith-to-pocket-daw-${stamp}-${suffix}.pcs1.txt`;
}
function makeGodotDownloadHandoffFileName(){
  const stamp = Date.now().toString(36);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `pocket-chordsmith-to-godot-${stamp}-${suffix}.pcs1.txt`;
}
function makeMobileTransferDownloadFileName(){
  const stamp = Date.now().toString(36);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `pocket-chordsmith-mobile-transfer-${stamp}-${suffix}.pcs1.txt`;
}
function setPushHandoffStatus(message){
  if(els.pushHandoffStatus) els.pushHandoffStatus.textContent = message;
}
function setMobileTransferStatus(message){
  if(els.mobileTransferStatus) els.mobileTransferStatus.textContent = message;
}
function buildMobileTransfer(){
  let code = "";
  try{
    code = buildShareCode();
  }catch(e){
    setStatus("Could not build mobile transfer code");
    setMobileTransferStatus("Could not build a PCS1 code for this song.");
    return null;
  }
  if(els.projectBox){ els.projectBox.value = code; setProjectBoxValidation(); }
  const payload = buildPocketHandoff("chordsmith-mobile-transfer", code, {
    targetApp: "Pocket Audio Handoff",
    metadata: {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      bpm: state.bpm,
      key: state.key,
      scale: state.scale,
      songSequenceLength: Array.isArray(state.songSequence) ? state.songSequence.length : 0
    }
  });
  const transferUrl = buildHandoffUrl(resolvePocketAudioHandoffUrl(), payload);
  return {
    code,
    payload,
    transferUrl,
    urlFits: transferUrl.length <= MOBILE_TRANSFER_URL_LIMIT
  };
}
function mobileTransferRelayUrl(){
  const configured = configuredPocketAudioHandoffRelayUrl();
  if(configured) return configured.replace(/\/+$/g, "");
  if(isLocalHandoffHost()) return `${window.location.origin}/api/pocket-audio-handoff`;
  return POCKET_AUDIO_HANDOFF_RELAY_URL;
}
async function createMobileTransferRelay(transfer){
  if(!transfer?.code) return null;
  try{
    const response = await fetch(`${mobileTransferRelayUrl()}/transfers`, {
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        code:transfer.code,
        source:"Pocket Chordsmith",
        metadata:{
          schemaVersion:String(PROJECT_SCHEMA_VERSION),
          bpm:String(state.bpm),
          key:String(state.key),
          scale:String(state.scale),
          songSequenceLength:String(Array.isArray(state.songSequence) ? state.songSequence.length : 0)
        }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if(!response.ok) throw new Error(payload.error || "Relay unavailable");
    return payload;
  }catch(e){
    return null;
  }
}
function showMobileTransferPanel(){
  if(els.mobileTransferPanel) els.mobileTransferPanel.hidden = false;
}
function prepareMobileTransfer(){
  stopLivePlaybackBeforeHandoff();
  showMobileTransferPanel();
  const transfer = buildMobileTransfer();
  if(!transfer) return null;
  const sizeNote = transfer.urlFits
    ? "Transfer link ready. The samfa12 page can create a short code and show DAW/Godot import options."
    : "This song is too large for a reliable URL transfer. Use Share, Copy, or Download.";
  setStatus("Mobile transfer ready");
  setPushHandoffStatus("Mobile transfer prepared. DAW/Godot direct push is same-device; this PCS1 transfer works across phone and desktop.");
  setMobileTransferStatus(sizeNote);
  return transfer;
}
async function shareMobileTransfer(){
  return shareMobileTransferLink();
}
async function shareMobileTransferLink(){
  const transfer = prepareMobileTransfer();
  if(!transfer) return;
  rememberImmersiveModeBeforeExternalUi();
  try{
    if(navigator.share){
      const shareData = transfer.urlFits
        ? {title:"Pocket Chordsmith transfer", text:"Open this Pocket Chordsmith handoff on desktop.", url:transfer.transferUrl}
        : {title:"Pocket Chordsmith PCS1", text:transfer.code};
      await navigator.share(shareData);
      setStatus("Mobile transfer shared");
      setMobileTransferStatus(transfer.urlFits ? "Transfer link shared." : "PCS1 code shared.");
      return;
    }
  }catch(e){
    setMobileTransferStatus("Share was cancelled or blocked. Copy or download the PCS1 code instead.");
    return;
  }finally{
    scheduleImmersiveRestore();
  }
  const copied = await copyTextForHandoff(
    transfer.urlFits ? transfer.transferUrl : transfer.code,
    "Mobile transfer copied",
    "Mobile transfer ready in the project box; clipboard was blocked"
  );
  setMobileTransferStatus(copied ? "Copied transfer text because Web Share is not available." : "Copy was blocked. Use Download or select the PCS1 code from the project box.");
  scheduleImmersiveRestore();
}
async function copyMobileTransferCode(){
  const transfer = prepareMobileTransfer();
  if(!transfer) return;
  await copyTextForHandoff(
    transfer.code,
    "Mobile transfer PCS1 copied",
    "Mobile transfer PCS1 is ready in the project box; clipboard was blocked"
  );
  setMobileTransferStatus("PCS1 code is ready for Pocket DAW Import Paste or Godot Paste JSON/Code.");
}
function downloadMobileTransferCode(){
  const transfer = prepareMobileTransfer();
  if(!transfer) return;
  const downloaded = downloadTextFallback(makeMobileTransferDownloadFileName(), transfer.code);
  setStatus(downloaded ? "Mobile transfer file downloaded" : "Mobile transfer download blocked");
  setMobileTransferStatus(downloaded ? "Downloaded a .pcs1.txt file for desktop import." : "Download was blocked. Copy the PCS1 code from the project box.");
}
function openMobileTransferPendingWindow(){
  try{
    const opened = window.open("about:blank", "PocketAudioMobileTransfer");
    if(opened){
      try{
        if(opened.document){
          opened.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pocket Audio Handoff</title><style>body{font:16px system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#101722;color:#eef4ff}main{max-width:28rem;padding:24px;text-align:center}p{color:#b8c3d6}</style></head><body><main><h1>Preparing transfer...</h1><p>Pocket Chordsmith is creating a short samfa12 code for this song.</p></main></body></html>`);
          opened.document.close();
        }
      }catch(e){}
      return opened;
    }
  }catch(e){}
  return null;
}
async function openMobileTransferPage(){
  const transfer = prepareMobileTransfer();
  if(!transfer) return;
  const pendingWindow = openMobileTransferPendingWindow();
  setMobileTransferStatus("Creating a short samfa12 transfer code...");
  const relay = await createMobileTransferRelay(transfer);
  const url = relay?.url || (transfer.urlFits ? transfer.transferUrl : resolvePocketAudioHandoffUrl());
  const opened = openHandoffUrl(
    url,
    relay
      ? "Transfer page pop-up blocked. Copy the short code or open samfa12.com/apps/pocket-audio-handoff/."
      : transfer.urlFits
        ? "Transfer page pop-up blocked. Copy the PCS1 code or open samfa12.com/apps/pocket-audio-handoff/."
      : "Transfer page pop-up blocked. Copy or download the PCS1 code.",
    null,
    pendingWindow
  );
  if(opened){
    setStatus("Opening mobile transfer page...");
    setMobileTransferStatus(relay
      ? `Opening samfa12 transfer page with short code ${relay.shortCode || relay.id}. Enter that code on your desktop.`
      : transfer.urlFits
        ? "Opening samfa12 transfer page with this song in the URL hash. It can create a short code there."
        : "Relay unavailable and the song is too large for a URL. Download the PCS1 file or copy it from the project box.");
  }
}
function stopLivePlaybackBeforeHandoff(){
  if(!state.isPlaying) return false;
  stopPlayback();
  setPushHandoffStatus("Live playback stopped. Preparing handoff...");
  return true;
}
function openPreparedHandoffWindow(payload=null){
  try{
    const opened = window.open("about:blank", "PocketHandoffTarget");
    if(opened){
      if(payload) opened.name = `${HANDOFF_WINDOW_PREFIX}${encodePocketHandoff(payload)}`;
      try{ opened.opener = null; }catch(e){}
      return opened;
    }
  }catch(e){}
  return null;
}
function openHandoffUrl(url, blockedMessage, payload=null, preparedWindow=null){
  if(!url) return false;
  try{
    if(preparedWindow && !preparedWindow.closed){
      preparedWindow.location.href = url;
      return true;
    }
    const targetName = payload ? `${HANDOFF_WINDOW_PREFIX}${encodePocketHandoff(payload)}` : "_blank";
    const opened = window.open(url, targetName);
    if(opened){
      if(payload) opened.name = targetName;
      try{ opened.opener = null; }catch(e){}
      return true;
    }
  }catch(e){}
  setStatus(blockedMessage);
  return false;
}
function openInstalledAppProtocol(url, blockedMessage){
  if(!url) return false;
  try{
    const link = document.createElement("a");
    link.href = url;
    link.style.display = "none";
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  }catch(e){}
  setStatus(blockedMessage);
  return false;
}
async function postPocketDawLocalHandoff(encodedHandoff){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1400);
  try{
    const response = await fetch(POCKET_DAW_LOCAL_HANDOFF_URL, {
      method: "POST",
      mode: "cors",
      headers: {"Content-Type":"text/plain;charset=utf-8"},
      body: encodedHandoff,
      signal: controller.signal
    });
    return response.ok;
  }catch(e){
    return false;
  }finally{
    clearTimeout(timer);
  }
}
function submitPocketDawLocalHandoffForm(encodedHandoff){
  try{
    const frameName = `PocketDawLocalHandoff_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement("iframe");
    iframe.name = frameName;
    iframe.style.display = "none";
    const form = document.createElement("form");
    form.method = "POST";
    form.action = POCKET_DAW_LOCAL_HANDOFF_URL;
    form.target = frameName;
    form.enctype = "application/x-www-form-urlencoded";
    form.style.display = "none";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "encodedHandoff";
    input.value = encodedHandoff;
    form.appendChild(input);
    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();
    setTimeout(() => {
      try{ form.remove(); }catch(e){}
      try{ iframe.remove(); }catch(e){}
    }, 10000);
    return true;
  }catch(e){
    return false;
  }
}
function submitGodotReceiverForm(endpoint, code){
  try{
    const frameName = `PocketGodotPush_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement("iframe");
    iframe.name = frameName;
    iframe.style.display = "none";
    const form = document.createElement("form");
    form.method = "POST";
    form.action = endpoint;
    form.target = frameName;
    form.enctype = "application/x-www-form-urlencoded";
    form.style.display = "none";
    const fields = {
      type: "pocket-chordsmith.push-to-godot",
      format: "PCS1",
      code,
      source: "Pocket Chordsmith",
      schema: String(PROJECT_SCHEMA_VERSION)
    };
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();
    setTimeout(() => {
      try{ form.remove(); }catch(e){}
      try{ iframe.remove(); }catch(e){}
    }, 10000);
    return true;
  }catch(e){
    return false;
  }
}
async function sendPocketDawLocalHandoff(encodedHandoff, options={}){
  const attempts = Number.isFinite(options.attempts) ? options.attempts : 1;
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 350;
  const formFallback = options.formFallback === true;
  for(let attempt=0; attempt<attempts; attempt++){
    if(attempt > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    if(await postPocketDawLocalHandoff(encodedHandoff)) return "confirmed";
  }
  if(formFallback && submitPocketDawLocalHandoffForm(encodedHandoff)) return "submitted";
  return "failed";
}
function getGodotReceiverToken(){
  try{ return sessionStorage.getItem(GODOT_RECEIVER_TOKEN_KEY) || ""; }catch(e){ return ""; }
}
function setGodotReceiverToken(token){
  try{
    if(token) sessionStorage.setItem(GODOT_RECEIVER_TOKEN_KEY, token);
    else sessionStorage.removeItem(GODOT_RECEIVER_TOKEN_KEY);
  }catch(e){}
}
function makeGodotReceiverRequestId(){
  try{ if(crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID(); }catch(e){}
  return `pcs-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
async function postCodeToGodotReceiver(endpoint, code, token=""){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1400);
  try{
    const headers = {
      "Content-Type":"application/json",
      "X-Pocket-Audio-Request-Id":makeGodotReceiverRequestId()
    };
    if(token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      targetAddressSpace: "loopback",
      body: JSON.stringify({
        type: "pocket-chordsmith.push-to-godot",
        format: "PCS1",
        code,
        source: "Pocket Chordsmith",
        schema: PROJECT_SCHEMA_VERSION
      }),
      signal: controller.signal
    });
    let data = null;
    try{ data = await response.json(); }catch(e){}
    if(response.ok && data && data.ok){
      return {ok:true, endpoint, data};
    }
    return {
      ok:false,
      endpoint,
      authRequired: response.status === 401,
      error: data && data.error ? data.error : `Godot receiver returned ${response.status}`
    };
  }catch(e){
    return {ok:false, endpoint, error: e && e.name === "AbortError" ? "Godot receiver timed out" : "Godot receiver unavailable"};
  }finally{
    clearTimeout(timer);
  }
}
async function pushCodeDirectlyToGodot(code){
  const failures = [];
  let token = getGodotReceiverToken();
  for(const endpoint of GODOT_PUSH_ENDPOINTS){
    let result = await postCodeToGodotReceiver(endpoint, code, token);
    if(result.ok) return result;
    if(result.authRequired){
      setGodotReceiverToken("");
      const entered = window.prompt("In Godot, turn on Browser Receiver, choose Copy Receiver Token, then paste that per-session token here.", "");
      token = String(entered || "").trim();
      if(!token) return {ok:false, error:"Godot receiver token was not provided"};
      setGodotReceiverToken(token);
      result = await postCodeToGodotReceiver(endpoint, code, token);
      if(result.ok) return result;
      if(result.authRequired) setGodotReceiverToken("");
    }
    failures.push(result.error || endpoint);
  }
  const uniqueFailures = [...new Set(failures.filter(Boolean))];
  return {ok:false, error: uniqueFailures.join("; ") || "Godot receiver unavailable"};
}
function submitCodeToGodotReceiver(code){
  // Authenticated requests require headers, which HTML form fallback cannot
  // provide. Manual paste remains the universal fallback.
  return false;
}
function localNetworkAccessPolicyState(){
  const policy = document.permissionsPolicy || document.featurePolicy;
  if(!policy || typeof policy.allowsFeature !== "function") return "unknown";
  try{
    if(policy.allowsFeature("loopback-network") === false) return "blocked";
  }catch(e){}
  try{
    if(policy.allowsFeature("local-network-access") === false) return "blocked";
  }catch(e){}
  return "allowed";
}
function godotLoopbackBlockMessage(error){
  const base = "Chrome blocked hosted Pocket Chordsmith from reaching localhost.";
  const detail = error ? ` (${error})` : "";
  return `${base}${detail} Open a local/standalone Chordsmith build or paste the PCS1 code in Godot > Chordsmith tab > Paste JSON/Code > Import.`;
}
async function pushToPocketDj(){
  stopLivePlaybackBeforeHandoff();
  let code = "";
  try{
    code = buildShareCode();
  }catch(e){
    setStatus("Could not build Pocket DJ handoff code");
    return;
  }
  setPushHandoffStatus("Copying PCS1 song code for Pocket DJ...");
  const payload = buildPocketHandoff("pcs-to-dj", code);
  const saved = saveHandoffPayload(HANDOFF_TO_DJ_KEY, payload);
  const targetBaseUrl = resolvePocketDjUrl();
  const targetUrl = buildHandoffUrl(targetBaseUrl, payload);
  const preparedWindow = openPreparedHandoffWindow(payload);
  const copied = await copyTextForHandoff(
    code,
    "Pocket DJ song code copied",
    "Pocket DJ song code is ready in the project box; clipboard was blocked"
  );
  const blockedPopupMessage = copied
    ? `Pocket DJ code copied. Pop-up blocked; open ${targetBaseUrl} and paste Import.`
    : `Pocket DJ pop-up and clipboard were blocked. Copy the PCS1 code from the project box, open ${targetBaseUrl}, then paste Import.`;
  const opened = openHandoffUrl(
    targetUrl,
    blockedPopupMessage,
    payload,
    preparedWindow
  );
  if(opened){
    setStatus(copied ? "Song sent to Pocket DJ. Opening Pocket DJ..." : "Song sent to Pocket DJ. Opening target with manual paste fallback in the project box.");
    setPushHandoffStatus(saved ? "Pocket DJ will import this song when it opens." : "Pocket DJ will import from the launch URL; the PCS1 code remains in the project box for manual paste.");
  }else{
    setPushHandoffStatus(copied
      ? `Open ${targetBaseUrl}, paste the copied PCS1 code, then press Import.`
      : `Pop-up and clipboard were blocked. Copy the PCS1 code from the project box, open ${targetBaseUrl}, then press Import.`);
  }
}
async function pushToPocketDaw(){
  stopLivePlaybackBeforeHandoff();
  let code = "";
  try{
    code = buildShareCode();
  }catch(e){
    setStatus("Could not build Pocket DAW handoff code");
    return;
  }
  setPushHandoffStatus("Preparing PCS1 song code for Pocket DAW...");
  const payload = buildPocketHandoff("chordsmith-to-daw", code, {
    targetApp: "PocketDAW",
    metadata: {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      bpm: state.bpm,
      key: state.key,
      scale: state.scale,
      songSequenceLength: Array.isArray(state.songSequence) ? state.songSequence.length : 0
    }
  });
  const targetBaseUrl = resolvePocketDawUrl();
  const encodedHandoff = encodePocketHandoff(payload);
  let deliveryResult = await sendPocketDawLocalHandoff(encodedHandoff);
  let delivered = deliveryResult === "confirmed";
  let downloadedHandoff = false;
  let opened = false;
  if(!delivered){
    const fileName = makePocketDawDownloadHandoffFileName();
    downloadedHandoff = downloadTextFallback(fileName, code);
    const wakeUrl = downloadedHandoff
      ? `${targetBaseUrl}?source=download&file=${encodeURIComponent(fileName)}`
      : `${targetBaseUrl}?source=loopback`;
    opened = openInstalledAppProtocol(
      wakeUrl,
      "Pocket DAW launch was blocked; paste the code into installed Pocket DAW."
    );
    if(opened && !downloadedHandoff){
      setPushHandoffStatus("Opening Pocket DAW, then sending the song locally...");
      deliveryResult = await sendPocketDawLocalHandoff(encodedHandoff, {attempts: 16, delayMs: 350});
      delivered = deliveryResult === "confirmed";
    }else if(opened && downloadedHandoff){
      setPushHandoffStatus("Pocket DAW is opening and importing the downloaded handoff file.");
    }
  }
  const copied = await copyTextForHandoff(
    code,
    "Pocket DAW song code copied",
    "Pocket DAW song code is ready in the project box; clipboard was blocked"
  );
  if(delivered){
    setStatus("Song sent to Pocket DAW.");
    setPushHandoffStatus("Pocket DAW received the song through the installed-app local handoff.");
  }else if(opened && downloadedHandoff){
    setStatus(copied ? "Opened Pocket DAW with downloaded handoff fallback." : "Pocket DAW launch requested with downloaded handoff fallback.");
    setPushHandoffStatus("Pocket DAW should import the downloaded handoff file. If it does not, paste the PCS1 code into Import.");
  }else if(opened){
    setStatus(copied ? "Opened Pocket DAW; paste fallback is ready." : "Pocket DAW launch requested. Paste fallback is ready.");
    setPushHandoffStatus("Pocket DAW opened but did not confirm local receipt. Paste the PCS1 code into Import.");
  }else{
    const downloaded = downloadTextFallback("pocket-chordsmith-to-pocket-daw.pcs1.txt", code);
    if(downloaded && copied){
      setPushHandoffStatus("Pocket DAW did not open. Share code was copied and downloaded for manual import.");
    }else if(downloaded){
      setPushHandoffStatus("Pocket DAW did not open and clipboard was blocked. A PCS1 handoff file was downloaded; the code is also in the project box for manual import.");
    }else if(copied){
      setPushHandoffStatus("Pocket DAW did not open. Share code is copied and ready in the project box for manual import.");
    }else{
      setPushHandoffStatus("Pocket DAW did not open and clipboard/download fallback failed. Copy the PCS1 code from the project box into Pocket DAW Import.");
    }
  }
}
async function pushToGodot(){
  stopLivePlaybackBeforeHandoff();
  let code = "";
  try{
    code = buildShareCode();
  }catch(e){
    setStatus("Could not build Godot handoff code");
    return;
  }
  if(els.projectBox){ els.projectBox.value = code; setProjectBoxValidation(); }
  setStatus("Trying direct Push to Godot...");
  setPushHandoffStatus("Looking for the Pocket Chordsmith Godot addon on localhost...");
  const direct = await pushCodeDirectlyToGodot(code);
  if(direct.ok){
    const data = direct.data || {};
    const eventCount = Number.isFinite(data.event_count) ? ` (${data.event_count} events)` : "";
    const message = `Song pushed to Godot${eventCount}. Review it in the Chordsmith tab, then Save Chart Resource.`;
    setStatus(message);
    setPushHandoffStatus(message);
    return;
  }
  if(localNetworkAccessPolicyState() === "blocked"){
    const copied = await copyTextForHandoff(
      code,
      "Godot import code copied",
      "Godot import code is ready in the project box; clipboard was blocked"
    );
    const downloaded = copied ? false : downloadTextFallback(makeGodotDownloadHandoffFileName(), code);
    const message = godotLoopbackBlockMessage(direct.error);
    setStatus(copied ? "Godot push blocked by browser local-network permissions; PCS1 code copied." : "Godot push blocked by browser local-network permissions.");
    if(copied){
      setPushHandoffStatus(`${message} PCS1 code was copied.`);
    }else if(downloaded){
      setPushHandoffStatus(`${message} Clipboard was blocked by itch, so a PCS1 handoff text file was downloaded and the code remains in the project box.`);
    }else{
      setPushHandoffStatus(`${message} Clipboard and download fallback were blocked; select the PCS1 code from the project box manually.`);
    }
    return;
  }
  if(submitCodeToGodotReceiver(code)){
    const message = "Godot push submitted through browser fallback. Check the Chordsmith tab, then Save Chart Resource. If nothing appears, paste the PCS1 code from the project box.";
    setStatus(message);
    setPushHandoffStatus(`${message} Fetch was unavailable (${direct.error}).`);
    return;
  }
  await copyTextForHandoff(
    code,
    "Godot import code copied",
    "Godot import code is ready in the project box; clipboard was blocked"
  );
  const instructions = "Godot > Chordsmith tab > Paste JSON/Code > paste > Import > Save Chart Resource.";
  setStatus(`Godot import code ready. ${instructions}`);
  setPushHandoffStatus(`Direct push unavailable (${direct.error}). ${instructions}`);
}

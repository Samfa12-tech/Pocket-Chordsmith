function utf8ToBase64Url(text){
  const bytes = new TextEncoder().encode(text);
  if(bytes.byteLength > SHARE_MAX_DECODED_BYTES) throw sharePayloadTooLargeError();
  let binary = "";
  for(let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function base64UrlToUtf8(value){
  const source = String(value || "");
  if(source.length > SHARE_MAX_ENCODED_CHARS) throw sharePayloadTooLargeError();
  if(!/^[A-Za-z0-9_-]*$/.test(source)) throw new Error("Share payload contains invalid base64url characters.");
  if(Math.floor(source.length * 3 / 4) > SHARE_MAX_DECODED_BYTES) throw sharePayloadTooLargeError();
  const normalized = source.replace(/-/g,"+").replace(/_/g,"/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  if(binary.length > SHARE_MAX_DECODED_BYTES) throw sharePayloadTooLargeError();
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8", {fatal:true}).decode(bytes);
}
function sharePayloadTooLargeError(){
  const error = new RangeError(`Share payload exceeds ${SHARE_MAX_DECODED_BYTES} decoded bytes.`);
  error.code = "SHARE_PAYLOAD_TOO_LARGE";
  return error;
}
function assertRawImportTextSize(value){
  const text = String(value || "");
  if(text.length > SHARE_MAX_DECODED_BYTES || new TextEncoder().encode(text).byteLength > SHARE_MAX_DECODED_BYTES) throw sharePayloadTooLargeError();
  return text;
}
function parsePocketChordsmithShareCode(text){
  const source = String(text || "");
  if(source.length > SHARE_MAX_ENCODED_CHARS + PCS_SHARE_PREFIX.length) throw sharePayloadTooLargeError();
  const trimmed = source.trim();
  if(!trimmed.startsWith(PCS_SHARE_PREFIX)) throw new Error("That doesn’t look like a Pocket Chordsmith share code.");
  const payload = trimmed.slice(PCS_SHARE_PREFIX.length).trim();
  if(!payload) throw new Error("That share code is empty.");
  let decoded, parsed;
  try{ decoded = base64UrlToUtf8(payload); }catch(e){ if(e?.code === "SHARE_PAYLOAD_TOO_LARGE") throw e; throw new Error("That Pocket Chordsmith share code could not be decoded."); }
  try{ parsed = JSON.parse(decoded); }catch(e){ throw new Error("That share code decoded, but the project JSON was invalid."); }
  return parsed;
}
function parsePocketDjShareCode(text){
  const source = String(text || "");
  if(source.length > SHARE_MAX_ENCODED_CHARS + PDJ_SHARE_PREFIX.length) throw sharePayloadTooLargeError();
  const trimmed = source.trim();
  if(!trimmed.startsWith(PDJ_SHARE_PREFIX)) throw new Error("Invalid Pocket DJ share code.");
  let decoded, parsed;
  try{ decoded = base64UrlToUtf8(trimmed.slice(PDJ_SHARE_PREFIX.length).trim()); parsed = JSON.parse(decoded); }
  catch(e){ if(e?.code === "SHARE_PAYLOAD_TOO_LARGE") throw e; throw new Error("That Pocket DJ session could not be decoded."); }
  return parsed;
}
function parsePocketChordsmithJson(text){
  try{ return JSON.parse(assertRawImportTextSize(text).trim()); }
  catch(e){ throw new Error("That doesn’t look like a Pocket Chordsmith share code or JSON project."); }
}
function parseAnyImportText(text){
  const source = String(text || "");
  if(/^\s*PDJ1:/.test(source)) return {kind:"pdj", data:parsePocketDjShareCode(source)};
  if(/^\s*PCS1:/.test(source)) return {kind:"pcs", data:parsePocketChordsmithShareCode(source)};
  const trimmed = assertRawImportTextSize(source).trim();
  if(!trimmed) throw new Error("Paste a Pocket Chordsmith share code or project JSON first.");
  const parsed = parsePocketChordsmithJson(trimmed);
  if(parsed && parsed.app === "PocketDJ") return {kind:"pdj", data:parsed};
  return {kind:"pcs", data:parsed};
}
function buildPocketHandoff(kind, code){
  return {app:"PocketHandoff", handoffVersion:1, kind, code, createdAt:Date.now()};
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
  const joiner = url.includes("#") ? (/[#&]$/.test(url) ? "" : "&") : "#";
  return `${url}${joiner}${HANDOFF_PARAM}=${encoded}`;
}
function isLocalHandoffHost(){
  return window.location.protocol === "file:" || ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}
function resolvePocketChordsmithUrl(){
  if(isLocalHandoffHost()){
    try{ return new URL("../chordsmith-web/index.html", window.location.href).href; }catch(e){}
  }
  return POCKET_CHORDSMITH_URL;
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
  if(code) return buildPocketHandoff("pcs-to-dj", code);
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
  const code = payload.code.trim();
  return code.startsWith(PCS_SHARE_PREFIX) || code.startsWith(PDJ_SHARE_PREFIX) || code.startsWith("{");
}

/* 3. Sanitiser */

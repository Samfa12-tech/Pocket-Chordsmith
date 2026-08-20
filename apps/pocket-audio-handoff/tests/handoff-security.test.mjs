import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const schema16 = JSON.parse(fs.readFileSync(new URL("../../../packages/pcs-format/fixtures/schema16-valid.json", import.meta.url), "utf8"));
const schema17 = JSON.parse(fs.readFileSync(new URL("../../../packages/pcs-format/fixtures/schema17-funk-rich-events.json", import.meta.url), "utf8"));
const pcs = project => `PCS1:${Buffer.from(JSON.stringify(project), "utf8").toString("base64url")}`;
const valid16 = pcs(schema16);
const valid17 = pcs(schema17);
const official = "https://pocket-audio-handoff.samfa12.workers.dev/api/pocket-audio-handoff";
// Match the runtime element as HTML, not a case-sensitive literal.  This keeps
// the CSP hash check correct if the document serializer changes tag casing or
// adds a benign attribute to the generated inline runtime.
const script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/i)?.[1] || "";
assert.ok(script, "handoff production runtime is present");

function fakeElement(){
  return { value:"", textContent:"", disabled:false, files:[], style:{}, classList:{add(){},remove(){}}, addEventListener(){}, setAttribute(){}, removeAttribute(){}, appendChild(){}, remove(){}, focus(){}, select(){}, click(){} };
}
function relayPayload(extra = {}){
  return {id:"SAM-1234", shortCode:"SAM-1234", expiresAt:new Date(Date.now() + 60_000).toISOString(), url:`${official}/transfers/SAM-1234`, ...extra};
}
function response(payload, {status=200, body, declaredLength, stream=true} = {}){
  const text = body ?? JSON.stringify(payload);
  const bytes = Buffer.from(text, "utf8");
  let delivered = false;
  return {
    ok:status >= 200 && status < 300,
    status,
    headers:{get(name){ return name.toLowerCase() === "content-length" ? String(declaredLength ?? bytes.length) : null; }},
    body:stream ? {getReader(){ return {async read(){ if(delivered) return {done:true}; delivered = true; return {done:false, value:new Uint8Array(bytes)}; }, async cancel(){}}; }} : undefined,
    async text(){ return text; },
  };
}
function loadPage(href, options = {}){
  const elements = new Map(); const fetches = []; const historyCalls = [];
  const location = new URL(href);
  const document = {body:fakeElement(), getElementById(id){ if(!elements.has(id)) elements.set(id, fakeElement()); return elements.get(id); }, querySelector(selector){
    if(selector === 'meta[name="pocket-audio-handoff-dev-mode"]' && options.metaDevMode) return {content:"enabled"};
    if(selector === 'meta[name="pocket-audio-handoff-relay"]' && options.metaRelay) return {content:options.metaRelay}; return null;
  }, createElement(){ return fakeElement(); }};
  const window = {location, history:{replaceState(_state, _title, url){ historyCalls.push(String(url)); location.href = String(url); }}, POCKET_AUDIO_HANDOFF_DEV_MODE:options.devMode === true, POCKET_AUDIO_HANDOFF_RELAY_URL:options.windowRelay};
  const context = vm.createContext({window, document, URL, URLSearchParams, TextEncoder, TextDecoder, Blob, navigator:{clipboard:{writeText:async()=>{}}},
    fetch:async (url, init={}) => { fetches.push({url:String(url), init}); return options.fetchResponse?.(url, init, fetches.length) || response(relayPayload()); },
    setTimeout, clearTimeout, console, crypto, btoa:v=>Buffer.from(v,"binary").toString("base64"), atob:v=>Buffer.from(v,"base64").toString("binary"),
  });
  vm.runInContext(script, context, {filename:"index.html"});
  return {context, elements, fetches, historyCalls};
}
async function invoke(page, expression){ return vm.runInContext(`(async()=>(${expression}))()`, page.context); }
function rejected(value, name){
  const page = loadPage("https://samfa12.com/apps/pocket-audio-handoff/");
  const result = vm.runInContext(`extractCode(${JSON.stringify(value)})`, page.context);
  assert.ok(result?.error, `${name} returns a visible validation error`);
  assert.equal(vm.runInContext(`loadCode(${JSON.stringify(value)}, "test")`, page.context), false, `${name} cannot enable actions`);
  assert.equal(page.fetches.length, 0, `${name} has no relay side effect`);
}

for(const href of ["https://samfa12.com/apps/pocket-audio-handoff/?relay=https://example.test", "https://samfa12.com/apps/pocket-audio-handoff/#relay=https%3A%2F%2Fexample.test"]){
  assert.equal(vm.runInContext("RELAY_ENDPOINT", loadPage(href, {devMode:true, windowRelay:"https://example.test"}).context), official, "production ignores relay overrides");
}
assert.equal(vm.runInContext("RELAY_ENDPOINT", loadPage("http://localhost:4173/?relay=http://127.0.0.1:8787").context), official, "local override needs explicit dev mode");
assert.equal(vm.runInContext("RELAY_ENDPOINT", loadPage("http://localhost:4173/?relay=http://127.0.0.1:8787", {devMode:true}).context), "http://127.0.0.1:8787", "explicit local dev mode permits loopback relay");

for(const [code, schema] of [[valid16, 16], [valid17, 17]]){
  const page = loadPage("https://samfa12.com/apps/pocket-audio-handoff/");
  assert.equal(vm.runInContext(`loadCode(${JSON.stringify(code)}, "test")`, page.context), true, `schema ${schema} is accepted`);
  assert.equal(vm.runInContext("currentCode", page.context), code, `schema ${schema} is retained only after validation`);
}

const fullHash = loadPage(`https://samfa12.com/apps/pocket-audio-handoff/#pcs1=${encodeURIComponent(valid16)}`);
assert.equal(fullHash.fetches.length, 0, "full-song hash stays local");
assert.equal(fullHash.elements.get("createRelayBtn").disabled, false, "validated hash enables explicit short-code button");
assert.equal(fullHash.historyCalls.length, 1, "successful full-song hash import clears browser history");
assert.doesNotMatch(fullHash.historyCalls[0], /PCS1|pcs1/i, "cleared history contains no full song payload");
await invoke(fullHash, "createRelayTransfer()");
assert.equal(fullHash.fetches.length, 1, "only explicit create action uploads");
assert.equal(fullHash.fetches[0].url, `${official}/transfers`, "production upload uses official relay");

const nested = Buffer.from(JSON.stringify({app:"PocketHandoff", handoffVersion:1, code:valid16}), "utf8").toString("base64url");
const nestedHash = loadPage(`https://samfa12.com/apps/pocket-audio-handoff/#pocketHandoff=${nested}`);
assert.equal(nestedHash.fetches.length, 0, "nested handoff hash stays local");
assert.equal(nestedHash.elements.get("createRelayBtn").disabled, false, "validated nested handoff enables explicit short-code action");

rejected("PCS1:not-valid-base64!", "malformed PCS1 base64url");
rejected("PCS1:A", "truncated PCS1 base64url");
rejected("PCS1:_w", "invalid PCS1 UTF-8");
rejected(`PCS1:${Buffer.from("not JSON", "utf8").toString("base64url")}`, "invalid PCS1 JSON");
rejected(`PCS1:${Buffer.from('{"projectVersion":99}', "utf8").toString("base64url")}`, "unsupported PCS schema");
rejected(`PCS1:${"A".repeat(5_592_409)}`, "oversized encoded PCS1");
rejected(`PCS1:${Buffer.from(`{"projectVersion":16,"padding":"${"x".repeat(4 * 1024 * 1024)}"}`, "utf8").toString("base64url")}`, "oversized decoded PCS1");
rejected(`PocketHandoff:${Buffer.from(JSON.stringify({app:"PocketHandoff", handoffVersion:1, code:"PCS1:invalid"}), "utf8").toString("base64url")}`, "invalid nested PCS1");
rejected(`PocketHandoff:${Buffer.from(JSON.stringify({app:"PocketHandoff", handoffVersion:2, code:valid16}), "utf8").toString("base64url")}`, "unsupported nested handoff version");
rejected(JSON.stringify({app:"PocketHandoff", handoffVersion:2, code:valid16}), "invalid raw nested handoff");

const badUrl = loadPage("https://samfa12.com/apps/pocket-audio-handoff/", {fetchResponse:() => response(relayPayload({url:"https://attacker.example/steal"}))});
vm.runInContext(`loadCode(${JSON.stringify(valid16)}, "test")`, badUrl.context);
assert.equal(await invoke(badUrl, "createRelayTransfer()"), null, "unapproved relay URL is rejected");
assert.equal(badUrl.elements.get("copyRelayUrlBtn").disabled, true, "unapproved relay URL cannot be copied");

const expiredRelay = loadPage("https://samfa12.com/apps/pocket-audio-handoff/", {fetchResponse:() => response(relayPayload({expiresAt:"2000-01-01T00:00:00.000Z"}))});
vm.runInContext(`loadCode(${JSON.stringify(valid16)}, "test")`, expiredRelay.context);
assert.equal(await invoke(expiredRelay, "createRelayTransfer()"), null, "expired relay metadata is rejected");

const redeemed = loadPage("https://samfa12.com/apps/pocket-audio-handoff/", {fetchResponse:() => response(relayPayload({code:valid17}))});
assert.ok(await invoke(redeemed, 'redeemRelayTransfer("SAM-1234")'), "a bounded valid relay response loads a validated schema 17 song");
assert.equal(vm.runInContext("currentCode", redeemed.context), valid17, "relay redemption enables only a PCS-validated song");

const tooLargeRelay = loadPage("https://samfa12.com/apps/pocket-audio-handoff/", {fetchResponse:() => response({}, {declaredLength:6_000_000, body:"{}"})});
assert.equal(await invoke(tooLargeRelay, 'redeemRelayTransfer("SAM-1234")'), null, "oversized relay response is rejected before parsing");
assert.equal(vm.runInContext("currentCode", tooLargeRelay.context), "", "oversized relay response does not load a song");

const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1] || "";
const scriptPolicy = csp.match(/script-src[^;]*/)?.[0] || "";
const connectPolicy = csp.match(/connect-src[^;]*/)?.[0] || "";
assert.match(scriptPolicy, /'sha256-[A-Za-z0-9+/=]+'/i, "production CSP pins the generated inline runtime");
assert.doesNotMatch(scriptPolicy, /unsafe-inline/i, "production CSP has no unrestricted inline script execution");
assert.doesNotMatch(connectPolicy, /localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\./i, "production CSP permits no private network destination");
assert.equal(csp.includes(`sha256-${createHash("sha256").update(script, "utf8").digest("base64")}`), true, "CSP hash matches the deterministic production runtime");

console.log("Pocket Audio Handoff security tests passed.");

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "handoff inline script is present");

function fakeElement(){
  return {
    value: "", textContent: "", disabled: false, files: [], style: {},
    classList: {add(){}, remove(){}},
    addEventListener(){}, setAttribute(){}, removeAttribute(){}, appendChild(){},
    remove(){}, focus(){}, select(){}, click(){}, submit(){},
  };
}

function loadPage(href, options = {}){
  const elements = new Map();
  const fetches = [];
  const location = new URL(href);
  const document = {
    body: fakeElement(),
    getElementById(id){
      if(!elements.has(id)) elements.set(id, fakeElement());
      return elements.get(id);
    },
    querySelector(selector){
      if(selector === 'meta[name="pocket-audio-handoff-dev-mode"]' && options.metaDevMode) return {content:"enabled"};
      if(selector === 'meta[name="pocket-audio-handoff-relay"]' && options.metaRelay) return {content:options.metaRelay};
      return null;
    },
    createElement(){ return fakeElement(); },
  };
  const window = {
    location,
    POCKET_AUDIO_HANDOFF_DEV_MODE: options.devMode === true,
    POCKET_AUDIO_HANDOFF_RELAY_URL: options.windowRelay,
  };
  const context = vm.createContext({
    window, document, URL, URLSearchParams, TextEncoder, TextDecoder, Blob,
    navigator:{clipboard:{writeText:async()=>{}}},
    fetch:async (url, init={}) => {
      fetches.push({url:String(url), init});
      return {ok:true, status:200, json:async()=>({id:"SAM-1234", shortCode:"SAM-1234"})};
    },
    setTimeout, clearTimeout, console, crypto,
    btoa:value=>Buffer.from(value, "binary").toString("base64"),
    atob:value=>Buffer.from(value, "base64").toString("binary"),
  });
  vm.runInContext(script, context, {filename:"index.html"});
  return {context, elements, fetches};
}

const official = "https://pocket-audio-handoff.samfa12.workers.dev/api/pocket-audio-handoff";

for(const href of [
  "https://samfa12.com/apps/pocket-audio-handoff/?relay=https://example.test",
  "https://samfa12.com/apps/pocket-audio-handoff/#relay=https%3A%2F%2Fexample.test",
]){
  const page = loadPage(href, {devMode:true, windowRelay:"https://example.test"});
  assert.equal(vm.runInContext("RELAY_ENDPOINT", page.context), official, "production ignores every relay override source");
}

const localDefault = loadPage("http://localhost:4173/?relay=http://127.0.0.1:8787");
assert.equal(vm.runInContext("RELAY_ENDPOINT", localDefault.context), official, "local override requires explicit developer mode");

const localDev = loadPage("http://localhost:4173/?relay=http://127.0.0.1:8787", {devMode:true});
assert.equal(vm.runInContext("RELAY_ENDPOINT", localDev.context), "http://127.0.0.1:8787", "explicit local developer mode enables a loopback override");
assert.match(localDev.elements.get("relayEndpoint").textContent, /127\.0\.0\.1:8787.*local developer mode/, "rendered UI identifies the relay endpoint");

const hostileProduction = loadPage("https://samfa12.com/apps/pocket-audio-handoff/?relay=https://example.test");
vm.runInContext('loadCode("PCS1:complete-unreleased-song", "test"); createRelayTransfer()', hostileProduction.context);
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(hostileProduction.fetches.length, 1);
assert.equal(hostileProduction.fetches[0].url, `${official}/transfers`);
assert.match(hostileProduction.fetches[0].init.body, /PCS1:complete-unreleased-song/);
assert.ok(!hostileProduction.fetches[0].url.startsWith("https://example.test"), "complete PCS1 is never sent to an unapproved host");

assert.match(html, /Content-Security-Policy/);
assert.match(html, /connect-src[^;]*pocket-audio-handoff\.samfa12\.workers\.dev/);
assert.doesNotMatch(html.match(/connect-src[^;]*/)?.[0] || "", /https:\/\/\*/);
assert.match(html, /name="application-version" content="handoff-v1"/);
assert.match(html, /aria-label="Build handoff-v1"/);

console.log("Pocket Audio Handoff security tests passed.");

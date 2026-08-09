# Pocket DAW VST3 Beta Compatibility Matrix

The public 0.6.46 installer passed the installed VST3 host smoke. This matrix
also records compatibility tests run against unbundled official vendor
releases. Plug-ins are never committed, bundled, mirrored, or downloaded by
Pocket DAW. The current source-only 0.6.47 release-process work does not change
the VST3 host contract.

## 2026-08-01 source-candidate pass

| Product | Official source | Tested class | Local SHA-256 | Result |
| --- | --- | --- | --- | --- |
| JS80P 4.0.2, Windows x64 SSE2 VST3 single file | [Official JS80P release repository](https://github.com/attilammagyar/js80p/releases/tag/v4.0.2) | Instrument `00565354414D4A386A73383070000000` | `2BF72F9AE1A0BDB48C849F59C4631539898FEC014C85965A428E792C7D644C02` | Scan, instantiate, bus negotiation, 1,154 parameters, state round-trip, Bright Organ factory program, audible note processing, and clean unload passed. Peak: `0.2811005`. |
| Surge XT 1.3.4, Windows x64 VST3 | [Official Surge XT release](https://github.com/surge-synthesizer/releases-xt/releases/tag/1.3.4) | Instrument `ABCDEF019182FAEB566D624153675854` | `49794AD99D899A869B97416024283D74BAF2C517BAC15DB0FDE511BC99624E20` | Scan, instantiate, auxiliary-bus-safe negotiation, 2,855 parameters, state round-trip, audible note processing, and clean unload passed. Peak: `0.1639246`. |
| Surge XT Effects 1.3.4, Windows x64 VST3 | [Official Surge XT release](https://github.com/surge-synthesizer/releases-xt/releases/tag/1.3.4) | Effect `ABCDEF019182FAEB566D624153465854` | `3B9F6C9B3363491A37721ED2CB9F080EB0D4ABE1CE545A942E4FBB30B3E93050` | Scan, instantiate, 14 parameters, state round-trip, audible stereo processing, deterministic dry-input change, and clean unload passed. Peak: `0.1484425`; absolute dry difference: `512.4879892`. |

Downloaded archive hashes:

- JS80P 4.0.2 single-file ZIP: `39C9AFF121E30960AF498216D42B5B06A137726FF3BDD3DF1B19CCB37C95367A`
- Surge XT 1.3.4 plug-ins-only ZIP: `564E162C560AF07AD4ED47FE1BFCD827CF97A575DE30D06C48249AAD2E7C35E6`

Exact command:

```powershell
cargo test --test vst3_session_process real_compat_scans_hosts_and_processes_js80p_and_surge_xt -- --ignored --nocapture --test-threads=1
```

The test keeps factory program changes one block ahead of the first note because
VST3 does not define ordering between a program parameter and a note at the same
sample offset. This matches normal DAW behavior and prevents a deliberately
blank initial patch from being misdiagnosed as a host failure.

Compatibility is not an endorsement. Users should install plug-ins only from
the developer's official site, keep their own installers, and Freeze or Render
important tracks when portability matters.

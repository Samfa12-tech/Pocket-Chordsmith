param(
  [int]$NoteCount = 600,
  [int]$NoteOnMilliseconds = 90,
  [int]$NoteOffMilliseconds = 110,
  [string]$DevicePattern = "loopMIDI",
  [string]$SummaryPath = ""
)

$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class PocketDawTrackedMidiOutSmoke {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct MIDIOUTCAPS {
    public UInt16 wMid;
    public UInt16 wPid;
    public UInt32 vDriverVersion;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szPname;
    public UInt16 wTechnology;
    public UInt16 wVoices;
    public UInt16 wNotes;
    public UInt16 wChannelMask;
    public UInt32 dwSupport;
  }

  [DllImport("winmm.dll")] public static extern UInt32 midiOutGetNumDevs();
  [DllImport("winmm.dll", CharSet = CharSet.Auto)] public static extern UInt32 midiOutGetDevCaps(UIntPtr deviceId, out MIDIOUTCAPS caps, UInt32 capsSize);
  [DllImport("winmm.dll")] public static extern UInt32 midiOutOpen(out IntPtr handle, UInt32 deviceId, IntPtr callback, IntPtr instance, UInt32 flags);
  [DllImport("winmm.dll")] public static extern UInt32 midiOutShortMsg(IntPtr handle, UInt32 message);
  [DllImport("winmm.dll")] public static extern UInt32 midiOutClose(IntPtr handle);
}
"@

$deviceId = $null
$deviceName = $null
$deviceCount = [PocketDawTrackedMidiOutSmoke]::midiOutGetNumDevs()
for ($index = 0; $index -lt $deviceCount; $index++) {
  $caps = New-Object PocketDawTrackedMidiOutSmoke+MIDIOUTCAPS
  $devicePointer = [UIntPtr]::new([uint32]$index)
  $result = [PocketDawTrackedMidiOutSmoke]::midiOutGetDevCaps(
    $devicePointer,
    [ref]$caps,
    [Runtime.InteropServices.Marshal]::SizeOf($caps)
  )
  if ($result -eq 0 -and $caps.szPname -match $DevicePattern) {
    $deviceId = [uint32]$index
    $deviceName = $caps.szPname
    break
  }
}

if ($null -eq $deviceId) {
  throw "No MIDI output device matched '$DevicePattern'. Start loopMIDI and confirm its port exists."
}

$handle = [IntPtr]::Zero
$openResult = [PocketDawTrackedMidiOutSmoke]::midiOutOpen(
  [ref]$handle,
  $deviceId,
  [IntPtr]::Zero,
  [IntPtr]::Zero,
  0
)
if ($openResult -ne 0) {
  throw "midiOutOpen failed with code $openResult for $deviceName."
}

$pitches = @(60, 64, 67, 72, 76, 79, 84, 88)
$sent = 0
$startedAt = [DateTime]::UtcNow
try {
  for ($index = 0; $index -lt $NoteCount; $index++) {
    $pitch = $pitches[$index % $pitches.Count]
    $noteOn = [uint32](0x90 -bor ($pitch -shl 8) -bor (104 -shl 16))
    $noteOff = [uint32](0x80 -bor ($pitch -shl 8))
    [void][PocketDawTrackedMidiOutSmoke]::midiOutShortMsg($handle, $noteOn)
    Start-Sleep -Milliseconds $NoteOnMilliseconds
    [void][PocketDawTrackedMidiOutSmoke]::midiOutShortMsg($handle, $noteOff)
    Start-Sleep -Milliseconds $NoteOffMilliseconds
    $sent++
  }
} finally {
  [void][PocketDawTrackedMidiOutSmoke]::midiOutClose($handle)
}

$summary = [pscustomobject]@{
  ok = $true
  device = $deviceName
  noteCount = $sent
  startedAt = $startedAt.ToString("o")
  finishedAt = [DateTime]::UtcNow.ToString("o")
  pitches = $pitches
}

if ($SummaryPath) {
  $resolvedSummaryPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SummaryPath)
  $summary | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 -LiteralPath $resolvedSummaryPath
}

$summary | ConvertTo-Json -Depth 3

param([string]$Artifact)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'apk-digest.ps1')
if (!$Artifact) {
  $version = (Get-Content (Join-Path $project 'package.json') | ConvertFrom-Json).version
  $appName = (Get-Content (Join-Path $project 'app.json') | ConvertFrom-Json).expo.name
  $Artifact = Join-Path $project "release/$appName-$version-android.apk"
}
$tools = Get-Content (Join-Path $project '.build-tools/environment.json') | ConvertFrom-Json
$env:JAVA_HOME = $tools.javaHome
$buildTools = Get-ChildItem -LiteralPath (Join-Path $tools.sdk 'build-tools') -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'apksigner.bat') } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (!$buildTools) { throw 'Android verification tools are unavailable' }
$certificate = & (Join-Path $buildTools.FullName 'apksigner.bat') verify --verbose --print-certs $Artifact
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
if ($certificate -match 'CN=Android Debug') { throw 'APK still uses the shared Android debug signing identity' }
$certificate
$badging = & (Join-Path $buildTools.FullName 'aapt2.exe') dump badging $Artifact
if ($LASTEXITCODE -ne 0) { throw 'APK manifest inspection failed' }
$badging | Select-String '^(package:|sdkVersion:|minSdkVersion:|targetSdkVersion:|application-label:|native-code:|launchable-activity:)'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($Artifact)
try {
  $names = $zip.Entries.FullName
  foreach ($name in @('AndroidManifest.xml', 'classes.dex', 'assets/index.android.bundle')) {
    if ($names -notcontains $name) { throw "APK is missing $name" }
  }
  $nativeLibraries = $names | Where-Object { $_ -match '^lib/[^/]+/libc\+\+_shared\.so$' }
  if (!$nativeLibraries) { throw 'APK is missing the shared C++ runtime' }
  $fonts = $names | Where-Object { $_ -match '\.ttf$' }
  if (!$fonts) { throw 'APK is missing bundled fonts' }
  "APK_CONTENT_OK: $($nativeLibraries.Count) C++ runtime ABI entries; $($fonts.Count) fonts; manifest, dex and offline Hermes bundle present"
} finally { $zip.Dispose() }
Get-ApkDigest -Artifact $Artifact | Format-List

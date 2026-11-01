param([Parameter(Mandatory=$true)][string]$Artifact, [int]$ValidityDays = 3650)
# Days: ten-year internal distribution certificate; reuse this identity for updates.
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'apk-digest.ps1')
$tools = Get-Content (Join-Path $project '.build-tools/environment.json') | ConvertFrom-Json
$keyDirectory = Join-Path $project '.build-tools/signing'
$settingsFile = Join-Path $keyDirectory 'release.json'
$keyFile = Join-Path $keyDirectory 'release.jks'
$keytool = Join-Path $tools.javaHome 'bin/keytool.exe'
$keySizeBits = 2048 # Bits: RSA certificate strength for Android internal distribution.
$passwordBytes = 32 # Bytes: cryptographic entropy for the local keystore password.
$buildTools = Get-ChildItem -LiteralPath (Join-Path $tools.sdk 'build-tools') -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'apksigner.bat') } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (!$buildTools) { throw 'Android APK signing tools are unavailable' }
$signer = Join-Path $buildTools.FullName 'apksigner.bat'
$previousJava = $env:JAVA_HOME
$previousPassword = $env:CHIEF_ANDROID_SIGNING_PASSWORD
try {
  $env:JAVA_HOME = $tools.javaHome
  if (!(Test-Path -LiteralPath $settingsFile)) {
    if (Test-Path -LiteralPath $keyFile) { throw 'Existing signing key has no password metadata; restore its backup rather than replacing it' }
    New-Item -ItemType Directory -Force -Path $keyDirectory | Out-Null
    # The signing secret stays outside release artifacts, readable only by this OS identity.
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetOwner($identity)
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    # Apply through .NET: security-module autoload can fail on duplicate type data.
    (Get-Item -LiteralPath $keyDirectory).SetAccessControl($acl)
    $secretBytes = New-Object byte[] $passwordBytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($secretBytes) } finally { $rng.Dispose() }
    $password = [Convert]::ToBase64String($secretBytes)
    $settings = @{ alias = 'chief-release'; password = $password }
    $env:CHIEF_ANDROID_SIGNING_PASSWORD = $password
    $name = (Get-Content (Join-Path $project 'app.json') | ConvertFrom-Json).expo.name
    $ErrorActionPreference = 'Continue'
    & $keytool -genkeypair -keystore $keyFile -alias $settings.alias -keyalg RSA -keysize $keySizeBits -sigalg SHA256withRSA -validity $ValidityDays -dname "CN=$name" -storepass:env CHIEF_ANDROID_SIGNING_PASSWORD -keypass:env CHIEF_ANDROID_SIGNING_PASSWORD
    $code = $LASTEXITCODE; $ErrorActionPreference = 'Stop'
    if ($code -ne 0) { throw "Signing key creation failed: $code" }
    $settings | ConvertTo-Json | Set-Content -LiteralPath $settingsFile
  } else { $settings = Get-Content -LiteralPath $settingsFile | ConvertFrom-Json }
  if (!(Test-Path -LiteralPath $keyFile)) { throw 'Signing key is missing; restore its backup to preserve update compatibility' }
  $env:CHIEF_ANDROID_SIGNING_PASSWORD = $settings.password
  $ErrorActionPreference = 'Continue'
  & $signer sign --ks $keyFile --ks-key-alias $settings.alias --ks-pass env:CHIEF_ANDROID_SIGNING_PASSWORD --key-pass env:CHIEF_ANDROID_SIGNING_PASSWORD $Artifact
  $code = $LASTEXITCODE; $ErrorActionPreference = 'Stop'
  if ($code -ne 0) { throw "APK signing failed: $code" }
  & $signer verify --verbose --print-certs $Artifact
  if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
  Get-ApkDigest -Artifact $Artifact | Format-List
} finally { $env:JAVA_HOME = $previousJava; $env:CHIEF_ANDROID_SIGNING_PASSWORD = $previousPassword }

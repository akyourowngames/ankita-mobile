param([string]$Architectures = 'arm64-v8a,x86_64', [int]$HeapMb = 1536, [int]$MetaspaceMb = 768)
# MiB: bounded heap and metadata budgets; Expo release lint exceeded 384 MiB metadata.
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$tools = Get-Content (Join-Path $project '.build-tools/environment.json') | ConvertFrom-Json
$env:JAVA_HOME = $tools.javaHome
$env:ANDROID_HOME = $tools.sdk
$env:ANDROID_SDK_ROOT = $tools.sdk
$env:NODE_ENV = 'production'
$env:PATH = (Join-Path $tools.javaHome 'bin') + ';' + $env:PATH
Push-Location (Join-Path $project 'android')
try {
  # One worker bounds peak RAM on this machine; ABIs are configurable.
  # Windows PowerShell wraps native stderr warnings as errors; use exit code as the build result.
  $ErrorActionPreference = 'Continue'
  & .\gradlew.bat assembleRelease --no-daemon --max-workers=1 "-PreactNativeArchitectures=$Architectures" "-Dorg.gradle.jvmargs=-Xmx$($HeapMb)m -XX:MaxMetaspaceSize=$($MetaspaceMb)m" 2>&1 | Tee-Object -FilePath (Join-Path $project '.build-tools/apk-build.log')
  $ErrorActionPreference = 'Stop'
  if ($LASTEXITCODE -ne 0) { throw "Android build failed: $LASTEXITCODE" }
  $version = (Get-Content (Join-Path $project 'package.json') | ConvertFrom-Json).version
  $release = Join-Path $project 'release'
  New-Item -ItemType Directory -Force $release | Out-Null
  $appName = (Get-Content (Join-Path $project 'app.json') | ConvertFrom-Json).expo.name
  $artifact = Join-Path $release "$appName-$version-android.apk"
  Copy-Item -LiteralPath 'app/build/outputs/apk/release/app-release.apk' -Destination $artifact
  & (Join-Path $PSScriptRoot 'sign-apk.ps1') -Artifact $artifact
} finally { Pop-Location }

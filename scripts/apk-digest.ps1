function Get-ApkDigest([Parameter(Mandatory=$true)][string]$Artifact) {
  # Use framework crypto instead of optional PowerShell hashing-module autoload.
  $resolved = (Resolve-Path -LiteralPath $Artifact).ProviderPath
  $stream = [System.IO.File]::OpenRead($resolved)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $digest = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
    [PSCustomObject]@{ Algorithm = 'SHA256'; Hash = $digest; Bytes = $stream.Length; Path = $resolved }
  } finally { $algorithm.Dispose(); $stream.Dispose() }
}

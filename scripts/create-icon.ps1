# Workspace build asset. Size/geometry are pixels on a square store-icon canvas.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$size = 1024
$margin = 300
$stroke = 90
$project = Split-Path $PSScriptRoot -Parent
$assets = Join-Path $project 'assets'
New-Item -ItemType Directory -Force $assets | Out-Null
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#111113'))
$pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#C4B5FD'), $stroke)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawArc($pen, $margin, $margin, $size - $margin * 2, $size - $margin * 2, 45, 270)
$bitmap.Save((Join-Path $assets 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$pen.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

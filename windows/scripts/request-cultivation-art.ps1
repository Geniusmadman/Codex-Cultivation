[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$JobId,

  [string]$ApiUrl = $env:IMAGE_API_URL,

  [string]$ApiKey = $env:IMAGE_API_KEY,

  [switch]$Force
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ApiUrl)) { throw 'IMAGE_API_URL is not configured.' }
if ([string]::IsNullOrWhiteSpace($ApiKey)) { throw 'IMAGE_API_KEY is not configured.' }

$windowsRoot = Split-Path -Parent $PSScriptRoot
$promptPath = Join-Path $windowsRoot 'references\cultivation-art-prompts.json'
$assetRoot = [IO.Path]::GetFullPath((Join-Path $windowsRoot 'assets\cultivation'))
$jobs = Get-Content -Raw -LiteralPath $promptPath -Encoding utf8 | ConvertFrom-Json
$job = $jobs | Where-Object id -ceq $JobId | Select-Object -First 1
if ($null -eq $job) { throw "Unknown cultivation art job: $JobId" }

$outputPath = [IO.Path]::GetFullPath((Join-Path $assetRoot ([string]$job.output)))
if (-not $outputPath.StartsWith($assetRoot + [IO.Path]::DirectorySeparatorChar,
    [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Cultivation art output escapes the managed asset directory.'
}
if ((Test-Path -LiteralPath $outputPath) -and -not $Force) {
  throw "Cultivation art already exists: $outputPath"
}

$endpoint = $ApiUrl.TrimEnd('/') + '/v1/images/generations'
$body = [ordered]@{
  model = [string]$job.model
  prompt = [string]$job.prompt
  n = 1
  size = [string]$job.size
  quality = [string]$job.quality
  response_format = 'url'
} | ConvertTo-Json -Depth 5
$downloadPath = Join-Path $assetRoot ".$JobId.$PID.$([guid]::NewGuid().ToString('N')).download"
$pngPath = Join-Path $assetRoot ".$JobId.$PID.$([guid]::NewGuid().ToString('N')).png"
$downloadUsable = $false
$completed = $false
try {
  Add-Type -AssemblyName System.Net.Http
  $handler = [Net.Http.HttpClientHandler]::new()
  $client = [Net.Http.HttpClient]::new($handler)
  try {
    $client.Timeout = [TimeSpan]::FromSeconds(300)
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, $endpoint)
    try {
      $request.Version = [Version]::new(1, 1)
      $request.VersionPolicy = [Net.Http.HttpVersionPolicy]::RequestVersionExact
      $request.Headers.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $ApiKey)
      $request.Content = [Net.Http.StringContent]::new($body, [Text.Encoding]::UTF8, 'application/json')
      $httpResponse = $client.SendAsync($request).GetAwaiter().GetResult()
      try {
        $responseText = $httpResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if (-not $httpResponse.IsSuccessStatusCode) {
          throw "Image API returned HTTP $([int]$httpResponse.StatusCode)."
        }
        $response = $responseText | ConvertFrom-Json -ErrorAction Stop
      } finally {
        $httpResponse.Dispose()
      }
    } finally {
      $request.Dispose()
    }
  } finally {
    $client.Dispose()
    $handler.Dispose()
  }
  $candidate = $response.data[0]
  $imageUrl = if ($candidate.url) { [string]$candidate.url }
    elseif ($candidate -is [string]) { [string]$candidate }
    else { $null }
  if ([string]::IsNullOrWhiteSpace($imageUrl)) { throw 'Image API returned no download URL.' }
  $parsed = [Uri]$imageUrl
  if ($parsed.Scheme -ne 'https') { throw 'Image API returned a non-HTTPS download URL.' }

  Invoke-WebRequest -Uri $parsed.AbsoluteUri -OutFile $downloadPath -TimeoutSec 300
  $download = Get-Item -LiteralPath $downloadPath
  if ($download.Length -lt 1024) { throw 'Downloaded image is unexpectedly small.' }

  Add-Type -AssemblyName System.Drawing
  $image = [Drawing.Image]::FromFile($downloadPath)
  try {
    if ($image.Width -lt 700 -or $image.Height -lt 700) {
      throw "Downloaded image is too small: $($image.Width)x$($image.Height)"
    }
    if ([long]$image.Width * [long]$image.Height -gt 50000000) {
      throw "Downloaded image exceeds the 50MP safety limit: $($image.Width)x$($image.Height)"
    }
    $downloadUsable = $true
    $sourceWidth = $image.Width
    $sourceHeight = $image.Height
    $sizeMatch = [regex]::Match([string]$job.size, '^(?<width>\d+)x(?<height>\d+)$')
    if (-not $sizeMatch.Success) { throw "Invalid configured image size: $($job.size)" }
    $width = [int]$sizeMatch.Groups['width'].Value
    $height = [int]$sizeMatch.Groups['height'].Value
    $normalized = [Drawing.Bitmap]::new($width, $height, [Drawing.Imaging.PixelFormat]::Format24bppRgb)
    try {
      $graphics = [Drawing.Graphics]::FromImage($normalized)
      try {
        $graphics.Clear([Drawing.Color]::Black)
        $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $targetAspect = $width / [double]$height
        $sourceAspect = $image.Width / [double]$image.Height
        if ($sourceAspect -gt $targetAspect) {
          $cropWidth = [int][Math]::Round($image.Height * $targetAspect)
          $sourceRect = [Drawing.Rectangle]::new(
            [int][Math]::Round(($image.Width - $cropWidth) / 2), 0, $cropWidth, $image.Height)
        } else {
          $cropHeight = [int][Math]::Round($image.Width / $targetAspect)
          $sourceRect = [Drawing.Rectangle]::new(
            0, [int][Math]::Round(($image.Height - $cropHeight) / 2), $image.Width, $cropHeight)
        }
        $graphics.DrawImage(
          $image,
          [Drawing.Rectangle]::new(0, 0, $width, $height),
          $sourceRect,
          [Drawing.GraphicsUnit]::Pixel)
      } finally {
        $graphics.Dispose()
      }
      $normalized.Save($pngPath, [Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $normalized.Dispose()
    }
  } finally {
    $image.Dispose()
  }
  if ((Get-Item -LiteralPath $pngPath).Length -lt 1024) { throw 'Validated PNG is unexpectedly small.' }

  if (Test-Path -LiteralPath $outputPath) {
    $backupPath = "$outputPath.before-$JobId-$([DateTime]::Now.ToString('yyyyMMdd-HHmmss')).bak"
    [IO.File]::Move($outputPath, $backupPath)
  }
  [IO.File]::Move($pngPath, $outputPath)
  $completed = $true
  [pscustomobject]@{
    pass = $true
    job = $JobId
    output = $outputPath
    width = $width
    height = $height
    sourceWidth = $sourceWidth
    sourceHeight = $sourceHeight
    bytes = (Get-Item -LiteralPath $outputPath).Length
    responseFormat = 'url-download'
  } | ConvertTo-Json
} finally {
  if (Test-Path -LiteralPath $downloadPath) {
    if ($downloadUsable -and -not $completed) {
      $rejectedPath = Join-Path $assetRoot "$JobId-rejected-$([DateTime]::Now.ToString('yyyyMMdd-HHmmss')).img"
      [IO.File]::Move($downloadPath, $rejectedPath)
      Write-Warning "A usable downloaded image was preserved after processing failure: $rejectedPath"
    } else {
      [IO.File]::Delete($downloadPath)
    }
  }
  if (Test-Path -LiteralPath $pngPath) { [IO.File]::Delete($pngPath) }
}

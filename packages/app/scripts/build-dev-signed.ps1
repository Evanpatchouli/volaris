#Requires -Version 7.0
param([string]$OpenSSL)

$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'The Windows development installer requires Windows.' }
if (-not $OpenSSL) {
    $OpenSSL = (Get-Command openssl.exe -ErrorAction SilentlyContinue).Source
    if (-not $OpenSSL -and (Get-Command git.exe -ErrorAction SilentlyContinue)) {
        $gitExec = & git.exe --exec-path
        $OpenSSL = Join-Path $gitExec '../../bin/openssl.exe'
    }
}
if (-not $OpenSSL -or -not (Get-Command $OpenSSL -CommandType Application -ErrorAction SilentlyContinue)) {
    throw 'Install OpenSSL or pass its executable path with -OpenSSL.'
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$saved = @{}
foreach ($name in 'VOLARIS_SIGN_PFX', 'VOLARIS_SIGN_PASSWORD', 'VOLARIS_SIGN_CA_FILE', 'VOLARIS_TIMESTAMP_URL') {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name)
}
$temp = Join-Path ([IO.Path]::GetTempPath()) ('volaris-dev-sign-' + [guid]::NewGuid())
$key = Join-Path $temp 'key.pem'
$cert = Join-Path $temp 'public.pem'
$pfx = Join-Path $temp 'signer.pfx'
$null = New-Item -ItemType Directory -Path $temp
try {
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $bytes = [byte[]]::new(32)
        $random.GetBytes($bytes)
        $env:VOLARIS_SIGN_PASSWORD = [Convert]::ToBase64String($bytes)
    } finally {
        $random.Dispose()
    }
    $env:VOLARIS_SIGN_PFX = $pfx
    $env:VOLARIS_SIGN_CA_FILE = $cert
    Remove-Item Env:VOLARIS_TIMESTAMP_URL -ErrorAction SilentlyContinue
    & $OpenSSL req -x509 -newkey rsa:3072 -sha256 -days 30 -subj '/CN=Volaris Local Development' `
        -addext 'basicConstraints=critical,CA:FALSE' -addext 'keyUsage=critical,digitalSignature' `
        -addext 'extendedKeyUsage=codeSigning' -passout env:VOLARIS_SIGN_PASSWORD -keyout $key -out $cert
    if ($LASTEXITCODE) { throw 'OpenSSL could not create the development certificate.' }
    & $OpenSSL pkcs12 -export -in $cert -inkey $key -out $pfx `
        -passin env:VOLARIS_SIGN_PASSWORD -passout env:VOLARIS_SIGN_PASSWORD
    if ($LASTEXITCODE) { throw 'OpenSSL could not create the development PKCS#12 file.' }

    & pnpm --dir $repo app:dist
    if ($LASTEXITCODE) { throw 'The signed installer build failed.' }
    Copy-Item -LiteralPath $cert -Destination (Join-Path $repo 'packages/app/release/volaris-development.pem')
} finally {
    foreach ($name in $saved.Keys) {
        if ($null -eq $saved[$name]) {
            Remove-Item "Env:$name" -ErrorAction SilentlyContinue
        } else {
            Set-Item "Env:$name" $saved[$name]
        }
    }
    foreach ($file in $key, $cert, $pfx) { [IO.File]::Delete($file) }
    [IO.Directory]::Delete($temp)
}

$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$installed = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'BirthdayPost'
$page = Join-Path $installed 'post.html'
$exe = Join-Path $project 'dist\生辰邮局-Windows.exe'
$profile = Join-Path $installed 'Browser'
$process = Start-Process -FilePath $exe -WindowStyle Hidden -PassThru
if (-not $process.WaitForExit(15000)) { throw 'The desktop launcher did not finish starting the app.' }
if (-not (Test-Path -LiteralPath $page)) { throw 'The embedded offline page was not installed.' }
if ((Get-FileHash -LiteralPath $page).Hash -ne (Get-FileHash -LiteralPath (Join-Path $project 'build\assets\post.html')).Hash) {
    throw 'Installed resource differs from the tested app bundle.'
}
$launched = $false
for ($attempt = 0; $attempt -lt 16; $attempt++) {
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" | Where-Object {
        $_.CommandLine -and $_.CommandLine.Contains($profile) -and $_.CommandLine.Contains('--app=')
    }
    foreach ($edge in $processes) {
        $appWindow = Get-Process -Id $edge.ProcessId -ErrorAction SilentlyContinue
        if ($appWindow.MainWindowTitle -like '*生辰邮局*') {
            $launched = $true
            break
        }
    }
    if ($launched) { break }
    Start-Sleep -Milliseconds 500
}
if (-not $launched) { throw 'The Birthday Post application window was not detected.' }
Write-Output 'Windows EXE opened its dedicated app window with the exact tested offline page.'

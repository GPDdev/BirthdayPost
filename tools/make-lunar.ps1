$ErrorActionPreference = 'Stop'
$calendar = [Globalization.ChineseLunisolarCalendar]::new()
$bits = foreach ($year in 1901..2100) {
    $leapIndex = $calendar.GetLeapMonth($year)
    $value = if ($leapIndex) { $leapIndex - 1 } else { 0 }
    foreach ($index in 1..$calendar.GetMonthsInYear($year)) {
        if ($calendar.GetDaysInMonth($year, $index) -eq 30) {
            $value = $value -bor (1 -shl ($index + 3))
        }
    }
    $value
}
$outFile = Join-Path $PSScriptRoot '../web/lunar-data.js'
$source = "// Lunar year 1901 begins on 1901-02-19. Generated with ChineseLunisolarCalendar.`nconst LUNAR_YEARS = [" + ($bits -join ',') + "];`n"
[IO.File]::WriteAllText($outFile, $source, [Text.UTF8Encoding]::new($false))

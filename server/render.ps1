$ErrorActionPreference = 'Stop'
$presentation = $null
$powerpoint = $null
try {
    $powerpoint = New-Object -ComObject PowerPoint.Application
    $previousSecurity = $powerpoint.AutomationSecurity
    $powerpoint.AutomationSecurity = 3
    $presentation = $powerpoint.Presentations.Open($env:INKSTAGE_INPUT, -1, 0, 0)
    $width = 1920
    $height = [int][Math]::Round($width * $presentation.PageSetup.SlideHeight / $presentation.PageSetup.SlideWidth)
    for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
        $target = Join-Path $env:INKSTAGE_OUTPUT "slide-$i.png"
        $presentation.Slides.Item($i).Export($target, 'PNG', $width, $height)
    }
} finally {
    if ($null -ne $presentation) {
        $presentation.Close()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)
    }
    if ($null -ne $powerpoint) {
        if ($null -ne $previousSecurity) { $powerpoint.AutomationSecurity = $previousSecurity }
        # Leave an existing PowerPoint instance and the user's open decks alone.
        if ($powerpoint.Presentations.Count -eq 0) { $powerpoint.Quit() }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($powerpoint)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

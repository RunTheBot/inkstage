$ErrorActionPreference = 'Stop'
$presentation = $null
$powerpoint = $null
try {
    $powerpoint = New-Object -ComObject PowerPoint.Application
    $previousSecurity = $powerpoint.AutomationSecurity
    $powerpoint.AutomationSecurity = 3
    $presentation = $powerpoint.Presentations.Open($env:INKSTAGE_INPUT, -1, 0, 0)
    # PDF retains text, paths and embedded fonts instead of flattening a slide.
    $pdf = Join-Path $env:INKSTAGE_OUTPUT 'deck.pending.pdf'
    $range = $presentation.PrintOptions.Ranges.Add(1, $presentation.Slides.Count)
    $hidden = @()
    try {
        # Some Office builds omit hidden slides despite PrintHiddenSlides.
        # Unhide only this read-only, in-memory copy so PDF indices stay exact.
        for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
            $slide = $presentation.Slides.Item($i)
            if ($slide.SlideShowTransition.Hidden -ne 0) {
                $hidden += $i
                $slide.SlideShowTransition.Hidden = 0
            }
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($slide)
        }
        $presentation.ExportAsFixedFormat($pdf, 2, 2, 0, 1, 1, -1, $range, 1, '', $false, $false, $false, $true, $false)
    } finally {
        foreach ($index in $hidden) { $presentation.Slides.Item($index).SlideShowTransition.Hidden = -1 }
        $presentation.Saved = -1
    }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($range)
    $width = 1920
    $height = [int][Math]::Round($width * $presentation.PageSetup.SlideHeight / $presentation.PageSetup.SlideWidth)
    for ($i = 1; $env:INKSTAGE_PDF_ONLY -ne '1' -and $i -le $presentation.Slides.Count; $i++) {
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

# Get Errors from Orbo Server
# Usage: .\deploy\scripts\get-errors.ps1 [-Hours 12] [-Level error]

param(
    [int]$Hours = 12,
    [string]$Level = "error|warn|fail",
    [switch]$Raw
)

Write-Host "=== Orbo Errors (last $Hours hours) ===" -ForegroundColor Cyan

$logs = ssh selectel-orbo "cd ~/orbo && docker compose logs app --since ${Hours}h 2>&1"

if ($Raw) {
    $logs | Select-String -Pattern $Level -CaseSensitive:$false
} else {
    # Parse and format logs
    $logs | Select-String -Pattern $Level -CaseSensitive:$false | ForEach-Object {
        $line = $_.Line
        
        # Try to parse JSON logs
        if ($line -match '"level":"(\w+)".*"msg":"([^"]+)"') {
            $level = $matches[1]
            $msg = $matches[2]
            
            $color = switch ($level) {
                "error" { "Red" }
                "warn" { "Yellow" }
                default { "White" }
            }
            
            Write-Host "[$level] $msg" -ForegroundColor $color
        }
        # Parse pino logs
        elseif ($line -match 'level=(\w+).*msg=(.+)$') {
            $level = $matches[1]
            $msg = $matches[2]
            
            $color = switch ($level) {
                "error" { "Red" }
                "warn" { "Yellow" }
                default { "White" }
            }
            
            Write-Host "[$level] $msg" -ForegroundColor $color
        }
        # Regular error messages
        elseif ($line -match '(error|Error|ERROR|failed|Failed)') {
            Write-Host $line -ForegroundColor Red
        }
        else {
            Write-Host $line -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "=== End of Errors ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tip: Copy errors above and paste to Cursor for fixing" -ForegroundColor Gray


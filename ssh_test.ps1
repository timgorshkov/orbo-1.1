# SSH Test Script
$ErrorActionPreference = "Continue"

Write-Output "Starting SSH test..."
Write-Output "Date: $(Get-Date)"

try {
    $result = & ssh -o BatchMode=yes -o ConnectTimeout=20 selectel-orbo "hostname; pwd; ls -la /home/deploy" 2>&1
    Write-Output "SSH Result:"
    Write-Output $result
    Write-Output "Exit Code: $LASTEXITCODE"
} catch {
    Write-Output "Error: $_"
}

Write-Output "Test complete."

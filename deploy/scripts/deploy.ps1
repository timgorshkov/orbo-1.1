# ============================================
# Orbo Deployment Script (Windows PowerShell)
# ============================================
#
# Deploys the application to Selectel server via SSH.
#
# Prerequisites:
#   - SSH key configured (~/.ssh/selectel_key)
#   - rsync installed (via Git Bash or WSL)
#
# Usage:
#   .\deploy.ps1                    # Full deploy
#   .\deploy.ps1 -Quick             # Quick deploy (skip build)
#   .\deploy.ps1 -Server "my-server" # Custom server name
#

param(
    [string]$Server = "selectel-orbo",
    [switch]$Quick,
    [switch]$Help
)

# Colors
function Write-ColorOutput($ForegroundColor, $Message) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    Write-Output $Message
    $host.UI.RawUI.ForegroundColor = $fc
}

# Help message
if ($Help) {
    Write-Host @"
Orbo Deployment Script

Usage:
    .\deploy.ps1                     # Full deploy
    .\deploy.ps1 -Quick              # Quick deploy (skip npm install)
    .\deploy.ps1 -Server "hostname"  # Custom server

Options:
    -Server   SSH host name (default: selectel-orbo)
    -Quick    Skip npm install on server (faster)
    -Help     Show this help message

Prerequisites:
    1. SSH config with 'selectel-orbo' host
    2. rsync available (Git Bash or WSL)
"@
    exit 0
}

Write-Host "============================================"
Write-Host "  Orbo Deployment to $Server"
Write-Host "============================================"
Write-Host ""

# Get project root (one level up from deploy folder)
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Write-Host "Project root: $ProjectRoot"

# ============================================
# Step 1: Check SSH connection
# ============================================
Write-Host ""
Write-ColorOutput Yellow "[1/4] Checking SSH connection..."

try {
    $sshTest = ssh $Server "echo 'SSH OK'" 2>&1
    if ($sshTest -ne "SSH OK") {
        throw "SSH connection failed"
    }
    Write-ColorOutput Green "SSH connection successful"
} catch {
    Write-ColorOutput Red "Error: Cannot connect to $Server"
    Write-Host "Make sure SSH is configured in ~/.ssh/config:"
    Write-Host ""
    Write-Host "Host selectel-orbo"
    Write-Host "    HostName YOUR_SERVER_IP"
    Write-Host "    User deploy"
    Write-Host "    IdentityFile ~/.ssh/selectel_key"
    Write-Host ""
    exit 1
}

# ============================================
# Step 2: Sync files to server
# ============================================
Write-Host ""
Write-ColorOutput Yellow "[2/4] Syncing files to server..."

# Use rsync through Git Bash if available
$GitBashPath = "C:\Program Files\Git\bin\bash.exe"
$UseWSL = $false

if (Test-Path $GitBashPath) {
    Write-Host "Using Git Bash for rsync"
    
    # Convert Windows path to Unix path for Git Bash
    $UnixProjectRoot = $ProjectRoot -replace '\\', '/' -replace '^([A-Z]):', '/$1'
    $UnixProjectRoot = $UnixProjectRoot.ToLower()
    
    # Rsync command
    $rsyncCmd = @"
rsync -avz --progress --delete \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude '.git' \
    --exclude 'deploy' \
    --exclude '*.log' \
    --exclude '.env.local' \
    --exclude '.env' \
    $UnixProjectRoot/ deploy@$($Server -replace 'selectel-orbo', (ssh $Server 'hostname -I | cut -d" " -f1')):~/orbo/app/
"@
    
    # Execute through Git Bash
    & $GitBashPath -c $rsyncCmd
} elseif (Get-Command wsl -ErrorAction SilentlyContinue) {
    Write-Host "Using WSL for rsync"
    $UseWSL = $true
    
    # Convert Windows path to WSL path
    $WslPath = wsl wslpath -a $ProjectRoot.Replace('\', '/')
    
    wsl rsync -avz --progress --delete `
        --exclude 'node_modules' `
        --exclude '.next' `
        --exclude '.git' `
        --exclude 'deploy' `
        --exclude '*.log' `
        --exclude '.env.local' `
        --exclude '.env' `
        "$WslPath/" "deploy@${Server}:~/orbo/app/"
} else {
    Write-ColorOutput Yellow "rsync not found. Using scp (slower)..."
    
    # Fallback to scp
    Write-Host "Copying files via scp..."
    scp -r "$ProjectRoot\*" "${Server}:~/orbo/app/"
}

Write-ColorOutput Green "Files synced successfully"

# ============================================
# Step 3: Build on server
# ============================================
Write-Host ""
Write-ColorOutput Yellow "[3/4] Building application on server..."

$buildScript = @"
cd ~/orbo
echo 'Copying app files to build context...'
cp -r app/* . 2>/dev/null || true

echo 'Building Docker image...'
docker compose build app

echo 'Build complete!'
"@

ssh $Server $buildScript

Write-ColorOutput Green "Build completed successfully"

# ============================================
# Step 4: Restart containers
# ============================================
Write-Host ""
Write-ColorOutput Yellow "[4/4] Restarting containers..."

$restartScript = @"
cd ~/orbo
docker compose up -d app
docker compose ps
"@

ssh $Server $restartScript

Write-ColorOutput Green "Containers restarted successfully"

# ============================================
# Summary
# ============================================
Write-Host ""
Write-Host "============================================"
Write-ColorOutput Green "  Deployment Complete!"
Write-Host "============================================"
Write-Host ""
Write-Host "View logs: ssh $Server 'cd ~/orbo && docker compose logs -f app'"
Write-Host "Status: ssh $Server 'cd ~/orbo && docker compose ps'"
Write-Host ""


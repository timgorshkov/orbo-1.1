# ============================================
# Apply Migrations Script for Orbo
# ============================================
# 
# Applies new migrations for Applications system.
# 
# USAGE:
#   Open PowerShell terminal (outside Cursor)
#   cd "C:\Cursor WS\orbo-1.1.1\orbo-1.1"
#   .\apply_migrations.ps1
#
# MANUAL ALTERNATIVE:
#   If script doesn't work, use manual commands below.
#
# ============================================

$ErrorActionPreference = "Stop"

$SERVER = "selectel-orbo"
$LOCAL_MIGRATIONS = ".\db\migrations"

$migrations = @(
    "206_applications_system.sql",
    "207_applications_rpc_functions.sql"
)

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Orbo Migration Deployment" -ForegroundColor Cyan
Write-Host "  Migrations: $($migrations -join ', ')" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Test SSH connection
Write-Host "[1/4] Testing SSH connection to $SERVER..." -ForegroundColor Yellow
$testResult = ssh -o ConnectTimeout=10 $SERVER "echo 'OK'" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  SSH connection failed!" -ForegroundColor Red
    Write-Host "  Error: $testResult" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Troubleshooting:" -ForegroundColor Yellow
    Write-Host "    1. Check SSH key: ssh-add -l" -ForegroundColor Gray
    Write-Host "    2. Test manually: ssh $SERVER hostname" -ForegroundColor Gray
    Write-Host ""
    exit 1
}
Write-Host "  SSH connection OK" -ForegroundColor Green

# Step 2: Check server structure
Write-Host ""
Write-Host "[2/4] Checking server structure..." -ForegroundColor Yellow
ssh $SERVER "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep orbo"
Write-Host ""

# Step 3: Copy migrations
Write-Host "[3/4] Copying migration files..." -ForegroundColor Yellow
foreach ($migration in $migrations) {
    $localFile = Join-Path $LOCAL_MIGRATIONS $migration
    if (-not (Test-Path $localFile)) {
        Write-Host "  ERROR: File not found: $localFile" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Copying $migration..." -ForegroundColor Gray
    scp -q $localFile "${SERVER}:/tmp/${migration}"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Failed to copy $migration" -ForegroundColor Red
        exit 1
    }
}
Write-Host "  All files copied to /tmp/" -ForegroundColor Green

# Step 4: Apply migrations
Write-Host ""
Write-Host "[4/4] Applying migrations to database..." -ForegroundColor Yellow
Write-Host ""

foreach ($migration in $migrations) {
    Write-Host "  Applying $migration..." -ForegroundColor Yellow
    
    # Apply via docker exec
    ssh $SERVER "docker exec -i orbo_postgres psql -U orbo -d orbo < /tmp/$migration"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  WARNING: Some errors during $migration (may be OK if objects exist)" -ForegroundColor Yellow
    } else {
        Write-Host "  $migration applied successfully" -ForegroundColor Green
    }
    
    # Cleanup
    ssh $SERVER "rm -f /tmp/$migration"
    Write-Host ""
}

# Verify
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Verifying migration..." -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
ssh $SERVER "docker exec orbo_postgres psql -U orbo -d orbo -c `"\dt application*`""
Write-Host ""

Write-Host "============================================" -ForegroundColor Green
Write-Host "  DONE!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next: git add . && git commit -m 'feat: add applications system' && git push"
Write-Host ""

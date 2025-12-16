# ============================================
# Copy Project to Server Script (Windows)
# ============================================
#
# Создаёт архив проекта БЕЗ node_modules и .next,
# копирует на сервер и распаковывает.
#
# Использование:
#   .\copy-to-server.ps1
#   .\copy-to-server.ps1 -Server "selectel-orbo"
#

param(
    [string]$Server = "selectel-orbo",
    [string]$RemotePath = "~/orbo/app",
    [switch]$Help
)

if ($Help) {
    Write-Host @"
Copy Project to Server Script

Создаёт ZIP-архив проекта (без node_modules, .next, .git),
копирует на сервер и распаковывает.

Использование:
    .\copy-to-server.ps1                    # По умолчанию
    .\copy-to-server.ps1 -Server "myhost"   # Другой хост

Требования:
    - SSH доступ к серверу настроен
    - На сервере установлен unzip
"@
    exit 0
}

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Copy Project to $Server" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Определяем путь к проекту (на уровень выше от scripts)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DeployDir = Split-Path -Parent $ScriptDir
$ProjectRoot = Split-Path -Parent $DeployDir

Write-Host "Project root: $ProjectRoot"

# Временные файлы
$TempDir = [System.IO.Path]::GetTempPath()
$ArchiveName = "orbo-deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss').zip"
$ArchivePath = Join-Path $TempDir $ArchiveName

# ============================================
# Step 1: Создание архива
# ============================================
Write-Host ""
Write-Host "[1/4] Creating archive (excluding node_modules, .next, .git)..." -ForegroundColor Yellow

# Переходим в папку проекта
Push-Location $ProjectRoot

try {
    # Получаем список файлов для архивации (исключая ненужные)
    $excludePatterns = @(
        'node_modules',
        '.next',
        '.git',
        'deploy\data',
        'deploy\nginx\logs',
        'deploy\nginx\ssl',
        '*.log',
        '.env.local',
        '.env',
        'temp',
        '.tmp-migration',
        '.cursor'
    )
    
    # Собираем файлы
    $filesToArchive = Get-ChildItem -Path . -Recurse -File | Where-Object {
        $relativePath = $_.FullName.Substring($ProjectRoot.Length + 1)
        $exclude = $false
        foreach ($pattern in $excludePatterns) {
            if ($relativePath -like "*$pattern*") {
                $exclude = $true
                break
            }
        }
        -not $exclude
    }
    
    Write-Host "  Files to archive: $($filesToArchive.Count)"
    
    # Создаём архив
    if (Test-Path $ArchivePath) {
        Remove-Item $ArchivePath -Force
    }
    
    # Используем Compress-Archive
    $filesToArchive | Compress-Archive -DestinationPath $ArchivePath -CompressionLevel Optimal
    
    $archiveSize = (Get-Item $ArchivePath).Length / 1MB
    Write-Host "  Archive created: $ArchivePath ($([math]::Round($archiveSize, 2)) MB)" -ForegroundColor Green
    
} finally {
    Pop-Location
}

# ============================================
# Step 2: Копирование на сервер
# ============================================
Write-Host ""
Write-Host "[2/4] Copying archive to server..." -ForegroundColor Yellow

# Проверяем SSH соединение
Write-Host "  Testing SSH connection..."
$sshTest = ssh $Server "echo OK" 2>&1
if ($sshTest -ne "OK") {
    Write-Host "  ERROR: Cannot connect to $Server" -ForegroundColor Red
    Write-Host "  Check your SSH configuration" -ForegroundColor Red
    exit 1
}

# Копируем архив
Write-Host "  Uploading..."
scp $ArchivePath "${Server}:~/$ArchiveName"

Write-Host "  Archive uploaded" -ForegroundColor Green

# ============================================
# Step 3: Распаковка на сервере
# ============================================
Write-Host ""
Write-Host "[3/4] Extracting on server..." -ForegroundColor Yellow

$extractScript = @"
cd ~

# Устанавливаем unzip если нет
which unzip > /dev/null 2>&1 || sudo apt install -y unzip

# Создаём папку если нет
mkdir -p $RemotePath

# Очищаем старые файлы (кроме node_modules если есть)
cd $RemotePath
find . -maxdepth 1 -not -name 'node_modules' -not -name '.' -exec rm -rf {} \; 2>/dev/null || true

# Распаковываем
cd ~
unzip -o $ArchiveName -d $RemotePath

# Удаляем архив
rm $ArchiveName

# Показываем результат
echo "Files extracted:"
ls -la $RemotePath | head -20
"@

ssh $Server $extractScript

Write-Host "  Extraction complete" -ForegroundColor Green

# ============================================
# Step 4: Очистка
# ============================================
Write-Host ""
Write-Host "[4/4] Cleaning up..." -ForegroundColor Yellow

Remove-Item $ArchivePath -Force
Write-Host "  Local archive removed" -ForegroundColor Green

# ============================================
# Summary
# ============================================
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Copy Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps on server:"
Write-Host "  ssh $Server"
Write-Host "  cd ~/orbo"
Write-Host "  docker compose build app"
Write-Host "  docker compose up -d app"
Write-Host ""


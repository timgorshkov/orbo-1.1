# PowerShell script to archive old migrations
# Run after generating consolidated migrations in migrations_v2/

$sourcePath = "db\migrations"
$archivePath = "db\migrations_archive"

# Create archive directory if not exists
if (-not (Test-Path $archivePath)) {
    New-Item -ItemType Directory -Path $archivePath -Force
}

# Move all migration files to archive
$migrations = Get-ChildItem -Path $sourcePath -Filter "*.sql"
Write-Host "Found $($migrations.Count) migration files"

foreach ($file in $migrations) {
    Move-Item -Path $file.FullName -Destination $archivePath -Force
    Write-Host "Archived: $($file.Name)"
}

Write-Host ""
Write-Host "✅ All migrations archived to $archivePath"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Copy consolidated migrations from migrations_v2/ to migrations/"
Write-Host "2. Test on a fresh database"
Write-Host "3. If successful, delete migrations_archive/"


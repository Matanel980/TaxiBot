# PowerShell script to remove GitHub credential
# Run this script: powershell -ExecutionPolicy Bypass -File scripts/remove-github-credential.ps1

$target = "LegacyGeneric:target=GitHub - https://api.github.com/Matanel980"

# Try to delete using cmdkey
try {
    $result = cmdkey /delete:$target 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Successfully removed GitHub credential" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Could not remove via cmdkey. Please remove manually:" -ForegroundColor Yellow
        Write-Host "1. Open Windows Credential Manager (run: rundll32.exe keymgr.dll,KRShowKeyMgr)" -ForegroundColor Yellow
        Write-Host "2. Find 'GitHub - https://api.github.com/Matanel980'" -ForegroundColor Yellow
        Write-Host "3. Click 'Remove'" -ForegroundColor Yellow
        Write-Host $result
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}








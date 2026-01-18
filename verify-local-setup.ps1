# ============================================
# Local Setup Verification Script
# ============================================

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Local Setup Verification" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# Check 1: .env.local exists
Write-Host "[1/5] Checking .env.local file..." -ForegroundColor Yellow
if (Test-Path .env.local) {
    Write-Host "✅ .env.local file exists" -ForegroundColor Green
} else {
    Write-Host "❌ .env.local file NOT FOUND" -ForegroundColor Red
    Write-Host "   Create .env.local in project root" -ForegroundColor Yellow
    $allGood = $false
}
Write-Host ""

# Check 2: Required environment variables
Write-Host "[2/5] Checking environment variables..." -ForegroundColor Yellow
if (Test-Path .env.local) {
    $envContent = Get-Content .env.local -Raw
    
    $checks = @(
        @{ Name = "NEXT_PUBLIC_SUPABASE_URL"; Pattern = "NEXT_PUBLIC_SUPABASE_URL=.*" },
        @{ Name = "NEXT_PUBLIC_SUPABASE_ANON_KEY"; Pattern = "NEXT_PUBLIC_SUPABASE_ANON_KEY=.*" },
        @{ Name = "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"; Pattern = "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=.*" }
    )
    
    foreach ($check in $checks) {
        if ($envContent -match $check.Pattern) {
            Write-Host "✅ $($check.Name) is set" -ForegroundColor Green
        } else {
            Write-Host "❌ $($check.Name) is MISSING" -ForegroundColor Red
            $allGood = $false
        }
    }
    
    # Verify Supabase URL matches project ID
    if ($envContent -match 'NEXT_PUBLIC_SUPABASE_URL=(.+)') {
        $url = $matches[1].Trim()
        if ($url -match 'zfzahgxrmlwotdzpjvhz') {
            Write-Host "✅ Supabase URL matches project ID (zfzahgxrmlwotdzpjvhz)" -ForegroundColor Green
        } else {
            Write-Host "⚠️ Supabase URL may not match project ID" -ForegroundColor Yellow
            Write-Host "   Expected: https://zfzahgxrmlwotdzpjvhz.supabase.co" -ForegroundColor Yellow
            Write-Host "   Found: $url" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "❌ Cannot check environment variables (file not found)" -ForegroundColor Red
    $allGood = $false
}
Write-Host ""

# Check 3: Dependencies installed
Write-Host "[3/5] Checking dependencies..." -ForegroundColor Yellow
if (Test-Path node_modules) {
    Write-Host "✅ node_modules exists (dependencies installed)" -ForegroundColor Green
} else {
    Write-Host "❌ node_modules NOT FOUND" -ForegroundColor Red
    Write-Host "   Run: npm install" -ForegroundColor Yellow
    $allGood = $false
}
Write-Host ""

# Check 4: package.json exists
Write-Host "[4/5] Checking package.json..." -ForegroundColor Yellow
if (Test-Path package.json) {
    Write-Host "✅ package.json exists" -ForegroundColor Green
    
    # Check for required scripts
    $packageContent = Get-Content package.json -Raw | ConvertFrom-Json
    if ($packageContent.scripts.dev) {
        Write-Host "✅ dev script found: $($packageContent.scripts.dev)" -ForegroundColor Green
    } else {
        Write-Host "❌ dev script not found in package.json" -ForegroundColor Red
        $allGood = $false
    }
} else {
    Write-Host "❌ package.json NOT FOUND" -ForegroundColor Red
    $allGood = $false
}
Write-Host ""

# Check 5: Google Maps API key format
Write-Host "[5/5] Checking Google Maps API key format..." -ForegroundColor Yellow
if (Test-Path .env.local) {
    $envContent = Get-Content .env.local -Raw
    if ($envContent -match 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=([^\r\n]+)') {
        $apiKey = $matches[1].Trim()
        if ($apiKey.Length -gt 30 -and ($apiKey -match '^AIza|^[A-Za-z0-9_-]+$')) {
            Write-Host "✅ Google Maps API key format looks valid" -ForegroundColor Green
        } else {
            Write-Host "⚠️ Google Maps API key format may be invalid" -ForegroundColor Yellow
            Write-Host "   Key should start with 'AIza' or be alphanumeric" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "❌ Cannot check API key (file not found)" -ForegroundColor Red
}
Write-Host ""

# Summary
Write-Host "============================================" -ForegroundColor Cyan
if ($allGood) {
    Write-Host "✅ All checks passed! Ready to start dev server." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next step: Run 'npm run dev'" -ForegroundColor Cyan
} else {
    Write-Host "❌ Some checks failed. Please fix the issues above." -ForegroundColor Red
}
Write-Host "============================================" -ForegroundColor Cyan






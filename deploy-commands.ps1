# ============================================
# Edge Functions Deployment Script
# Project: TaxiBot
# Project ID: zfzahgxrmlwotdzpjvhz
# ============================================

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Edge Functions Deployment Script" -ForegroundColor Cyan
Write-Host "Project ID: zfzahgxrmlwotdzpjvhz" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if Supabase CLI is installed
Write-Host "[1/6] Checking Supabase CLI installation..." -ForegroundColor Yellow
$supabaseVersion = supabase --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Supabase CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "  npm install -g supabase" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ Supabase CLI found: $supabaseVersion" -ForegroundColor Green
Write-Host ""

# Step 1: Login to Supabase
Write-Host "[2/6] Logging in to Supabase..." -ForegroundColor Yellow
Write-Host "  (This will open your browser for authentication)" -ForegroundColor Gray
supabase login
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Login failed. Please try again." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Logged in successfully" -ForegroundColor Green
Write-Host ""

# Step 2: Link project
Write-Host "[3/6] Linking project to zfzahgxrmlwotdzpjvhz..." -ForegroundColor Yellow
supabase link --project-ref zfzahgxrmlwotdzpjvhz
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Project linking failed. Please check the project ID." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Project linked successfully" -ForegroundColor Green
Write-Host ""

# Step 3: Set secrets (prompt user)
Write-Host "[4/6] Setting Edge Function secrets..." -ForegroundColor Yellow
Write-Host "  Please enter your VAPID keys from .env.local:" -ForegroundColor Gray
Write-Host ""

$vapidPublic = Read-Host "VAPID_PUBLIC_KEY"
$vapidPrivate = Read-Host "VAPID_PRIVATE_KEY" -AsSecureString
$vapidPrivatePlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($vapidPrivate)
)
$vapidSubject = Read-Host "VAPID_SUBJECT (or press Enter for default: mailto:your-email@example.com)"
if ([string]::IsNullOrWhiteSpace($vapidSubject)) {
    $vapidSubject = "mailto:your-email@example.com"
}

Write-Host ""
Write-Host "  Setting secrets..." -ForegroundColor Gray
supabase secrets set VAPID_PUBLIC_KEY="$vapidPublic"
supabase secrets set VAPID_PRIVATE_KEY="$vapidPrivatePlain"
supabase secrets set VAPID_SUBJECT="$vapidSubject"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to set secrets. Please check your keys." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Secrets set successfully" -ForegroundColor Green
Write-Host ""

# Step 4: Deploy functions
Write-Host "[5/6] Deploying Edge Functions..." -ForegroundColor Yellow
Write-Host ""

Write-Host "  Deploying auto-assign-trip..." -ForegroundColor Gray
supabase functions deploy auto-assign-trip
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to deploy auto-assign-trip" -ForegroundColor Red
    exit 1
}
Write-Host "✅ auto-assign-trip deployed" -ForegroundColor Green

Write-Host ""
Write-Host "  Deploying send-push-notification..." -ForegroundColor Gray
supabase functions deploy send-push-notification
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to deploy send-push-notification" -ForegroundColor Red
    exit 1
}
Write-Host "✅ send-push-notification deployed" -ForegroundColor Green
Write-Host ""

# Step 5: Summary
Write-Host "[6/6] Deployment Summary" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Function URLs:" -ForegroundColor Cyan
Write-Host "  - auto-assign-trip: https://zfzahgxrmlwotdzpjvhz.supabase.co/functions/v1/auto-assign-trip"
Write-Host "  - send-push-notification: https://zfzahgxrmlwotdzpjvhz.supabase.co/functions/v1/send-push-notification"
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Run postgis-verification.sql in Supabase SQL Editor" -ForegroundColor White
Write-Host "  2. Run supabase-find-nearest-driver-function.sql in SQL Editor" -ForegroundColor White
Write-Host "  3. Set up Database Webhooks (see DEPLOY-EDGE-FUNCTIONS.md)" -ForegroundColor White
Write-Host "  4. Test functions using: supabase functions logs <function-name>" -ForegroundColor White
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan






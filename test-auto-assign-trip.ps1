# Test Script for auto-assign-trip Edge Function
# This script allows you to manually test the auto-assign-trip function

param(
    [Parameter(Mandatory=$true)]
    [string]$TripId,
    
    [Parameter(Mandatory=$false)]
    [string]$SupabaseUrl = "https://zfzahgxrmlwotdzpjvhz.supabase.co",
    
    [Parameter(Mandatory=$false)]
    [string]$ServiceRoleKey
)

# Check if ServiceRoleKey is provided
if (-not $ServiceRoleKey) {
    Write-Host "❌ Error: ServiceRoleKey is required" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\test-auto-assign-trip.ps1 -TripId 'your-trip-uuid' -ServiceRoleKey 'your-service-role-key'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Or set it as an environment variable:" -ForegroundColor Yellow
    Write-Host "  `$env:SUPABASE_SERVICE_ROLE_KEY = 'your-key'" -ForegroundColor Cyan
    Write-Host "  .\test-auto-assign-trip.ps1 -TripId 'your-trip-uuid'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Get your Service Role Key from:" -ForegroundColor Yellow
    Write-Host "  Supabase Dashboard → Settings → API → service_role key" -ForegroundColor Cyan
    exit 1
}

$functionUrl = "$SupabaseUrl/functions/v1/auto-assign-trip"

Write-Host "🔵 Testing auto-assign-trip function..." -ForegroundColor Cyan
Write-Host "🔵 Trip ID: $TripId" -ForegroundColor Cyan
Write-Host "🔵 Function URL: $functionUrl" -ForegroundColor Cyan
Write-Host ""

# Prepare request body (direct format)
$body = @{
    trip_id = $TripId
} | ConvertTo-Json

Write-Host "🔵 Request body:" -ForegroundColor Cyan
Write-Host $body -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $functionUrl -Method POST -Headers @{
        "Authorization" = "Bearer $ServiceRoleKey"
        "Content-Type" = "application/json"
    } -Body $body -ErrorAction Stop

    Write-Host "✅ Success!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Gray
} catch {
    Write-Host "❌ Error occurred:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails) {
        Write-Host ""
        Write-Host "Error details:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message -ForegroundColor Gray
    }
    
    if ($_.Response) {
        Write-Host ""
        Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
        
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body:" -ForegroundColor Yellow
        Write-Host $responseBody -ForegroundColor Gray
    }
    
    exit 1
}






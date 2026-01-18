#!/bin/bash
# Test Script for auto-assign-trip Edge Function
# This script allows you to manually test the auto-assign-trip function

# Configuration
TRIP_ID="${1}"
SUPABASE_URL="${SUPABASE_URL:-https://zfzahgxrmlwotdzpjvhz.supabase.co}"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${2}}"

# Check if Trip ID is provided
if [ -z "$TRIP_ID" ]; then
    echo "❌ Error: Trip ID is required"
    echo ""
    echo "Usage:"
    echo "  ./test-auto-assign-trip.sh <trip-uuid> [service-role-key]"
    echo ""
    echo "Or set environment variables:"
    echo "  export SUPABASE_SERVICE_ROLE_KEY='your-key'"
    echo "  ./test-auto-assign-trip.sh <trip-uuid>"
    echo ""
    echo "Get your Service Role Key from:"
    echo "  Supabase Dashboard → Settings → API → service_role key"
    exit 1
fi

# Check if Service Role Key is provided
if [ -z "$SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: Service Role Key is required"
    echo ""
    echo "Set it as an environment variable:"
    echo "  export SUPABASE_SERVICE_ROLE_KEY='your-key'"
    echo ""
    echo "Or pass it as the second argument:"
    echo "  ./test-auto-assign-trip.sh <trip-uuid> <service-role-key>"
    exit 1
fi

FUNCTION_URL="${SUPABASE_URL}/functions/v1/auto-assign-trip"

echo "🔵 Testing auto-assign-trip function..."
echo "🔵 Trip ID: $TRIP_ID"
echo "🔵 Function URL: $FUNCTION_URL"
echo ""

# Prepare request body (direct format)
BODY=$(cat <<EOF
{
  "trip_id": "$TRIP_ID"
}
EOF
)

echo "🔵 Request body:"
echo "$BODY"
echo ""

# Make the request
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$FUNCTION_URL" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "$BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    echo "✅ Success! (HTTP $HTTP_CODE)"
    echo ""
    echo "Response:"
    echo "$RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$RESPONSE_BODY"
else
    echo "❌ Error (HTTP $HTTP_CODE)"
    echo ""
    echo "Response:"
    echo "$RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$RESPONSE_BODY"
    exit 1
fi






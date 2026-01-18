# 🗺️ Directions API Diagnostics Guide

## Re-enabled: Real-World Routing Only

The Directions API has been re-enabled. The system now **only** uses `google.maps.DirectionsService` for routes - **no straight lines or fallbacks**.

## Error Diagnostics

If you see `REQUEST_DENIED` or any other error, check the browser console for detailed logs:

### Console Logs to Look For:

1. **Status Code**: The exact Google Maps status code (e.g., `REQUEST_DENIED`, `OVER_QUERY_LIMIT`)
2. **Error Message**: Detailed explanation of what went wrong
3. **Error Details**: Object with `error`, `status`, `origin`, `destination`

### Common Errors and Solutions:

#### 1. REQUEST_DENIED
**Error Message**: "REQUEST_DENIED: The API key is missing or invalid, or billing is not enabled, or the Directions API is not enabled in Google Cloud Console."

**Solution**:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** > **Enabled APIs**
3. Search for **"Directions API"**
4. Click **"+ Enable API"** if it's not enabled
5. Verify **billing is enabled** for your project
6. Check that your API key has **Directions API** permission

#### 2. OVER_QUERY_LIMIT
**Error Message**: "OVER_QUERY_LIMIT: You have exceeded your quota."

**Solution**:
1. Check your **Google Cloud Console** > **APIs & Services** > **Quotas**
2. Verify you haven't exceeded the free tier (2,500 requests/day)
3. Consider upgrading your quota or implementing request throttling

#### 3. ZERO_RESULTS
**Error Message**: "ZERO_RESULTS: No route could be found between the origin and destination."

**Solution**:
- This means no valid driving route exists (e.g., across water without a ferry)
- Verify the coordinates are valid and accessible by road

#### 4. NOT_FOUND
**Error Message**: "NOT_FOUND: Origin or destination could not be geocoded."

**Solution**:
- Verify that **Geocoding API** is enabled in Google Cloud Console
- Check that addresses/coordinates are valid

## Required APIs in Google Cloud Console

Your API key **MUST** have these APIs enabled:

1. ✅ **Maps JavaScript API** - For rendering the map
2. ✅ **Directions API** - **REQUIRED** for route calculation
3. ✅ **Geocoding API** - For converting addresses to coordinates
4. ✅ **Maps JavaScript API** - Geometry library (for polyline decoding)

## Environment Variable

Ensure your API key is set in `.env.local`:
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
```

## Status

✅ Directions API re-enabled
✅ Detailed error logging added
✅ No straight-line fallbacks
✅ Only real road-based routes

## Next Steps

If you see any errors:
1. Check the browser console for the detailed error message
2. Follow the solution steps above based on the error type
3. Verify all required APIs are enabled in Google Cloud Console
4. Ensure billing is enabled for your project






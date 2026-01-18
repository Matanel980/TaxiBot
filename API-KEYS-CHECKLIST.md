# 🔑 Google Maps API Keys Checklist

## Required APIs

Your Google Maps API Key must have the following APIs **enabled** in the Google Cloud Console:

1. ✅ **Maps JavaScript API** - For rendering the map
2. ✅ **Directions API** - For calculating street-level routes
3. ✅ **Geocoding API** - For converting addresses to coordinates
4. ✅ **Places API** (optional) - For address autocomplete

## How to Verify

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** > **Enabled APIs**
3. Search for each API and verify it's enabled
4. If any API is missing, click **+ Enable API** and enable it

## Environment Variable

Your API key should be set in `.env.local`:
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
```

## Common Errors

- **403 Forbidden**: API not enabled or API key invalid
- **429 Too Many Requests**: API quota exceeded (check quotas in Cloud Console)
- **Routes not showing**: Directions API not enabled
- **Geocoding failing**: Geocoding API not enabled

## Status

✅ Check your Google Cloud Console to verify all APIs are enabled!






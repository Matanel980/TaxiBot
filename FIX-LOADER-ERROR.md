# 🔧 Fix: Google Maps Loader Configuration Error

## Problem
Getting error: "Loader must not be called again with different options"

This happens when different components use `useJsApiLoader` with **different library configurations**.

## Root Cause
Components were loading different library sets:
- `ZoneMapEditor.tsx`: `['drawing', 'geometry']`
- `AdminLiveMapClient.tsx`: `['places', 'geometry', 'drawing']`
- `DriverMapClient.tsx`: `['places', 'geometry']`

Google Maps API requires the **exact same options** across all components.

## Solution ✅

Created centralized configuration in `lib/google-maps-loader.ts`:

```typescript
export const GOOGLE_MAPS_LOADER_OPTIONS = {
  googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  language: 'iw',
  region: 'IL',
  libraries: ['places', 'geometry', 'drawing'], // Same everywhere
}
```

All components now import and use this:

```typescript
import { GOOGLE_MAPS_LOADER_OPTIONS } from '@/lib/google-maps-loader'

const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS)
```

## Files Updated
- ✅ `lib/google-maps-loader.ts` - Added centralized config
- ✅ `components/admin/ZoneMapEditor.tsx` - Uses centralized config
- ✅ `components/admin/AdminLiveMapClient.tsx` - Uses centralized config
- ✅ `components/driver/DriverMapClient.tsx` - Uses centralized config

## Prevention
**Never manually configure `useJsApiLoader` again!**

Always import and use `GOOGLE_MAPS_LOADER_OPTIONS`:

```typescript
// ❌ DON'T DO THIS
const { isLoaded } = useJsApiLoader({
  googleMapsApiKey: '...',
  libraries: ['places'], // Different libraries = ERROR
})

// ✅ DO THIS
import { GOOGLE_MAPS_LOADER_OPTIONS } from '@/lib/google-maps-loader'
const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS)
```

## Status
🟢 **Fixed** - Error should no longer occur


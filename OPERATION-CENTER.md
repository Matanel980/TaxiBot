# 🚕 TaxiFlow - Real-Time Operation Center
## Acre Taxi Station Management System

This document describes the fully functional real-time operation center for managing taxi operations in Acre, Israel.

---

## 🎯 Overview

TaxiFlow is now a complete, production-ready taxi dispatch and management system featuring:
- **Real-time GPS tracking** of all drivers
- **Geographic zone management** with visual polygon drawing
- **Automatic zone detection** using Point-in-Polygon algorithms
- **Live fleet visualization** with color-coded status indicators
- **Apple-style UI** with glassmorphism effects
- **Mobile-first design** with responsive layouts

---

## 🗺️ Geographic Features

### 1. Map Configuration

The system is optimized for **Acre, Israel** (עכו):
- **Center Point**: 32.9270°N, 35.0830°E
- **Default Zoom**: Level 13 (street-level detail)
- **Map Style**: Silver mode (high-contrast, clean streets)

### 2. Zone Management

#### Creating Zones
1. Navigate to **Admin → Zones**
2. Click **"Add New Zone"**
3. Use the **Drawing Manager** to draw a polygon on the map
4. Name the zone (e.g., "Old Acre", "Acre East", "Industrial Zone")
5. Click **Save**

#### Zone Storage
- Zones are stored as **GeoJSON Polygon** objects in the `zones` table
- Format: `{"type": "Polygon", "coordinates": [[[lng, lat], ...]]}`
- Supports complex polygons with multiple vertices

#### Automatic Zone Detection
- When a driver's GPS position updates, the system checks if they're within any zone
- Uses Google Maps `geometry.poly.containsLocation()` for accurate detection
- Updates `current_zone` field in real-time
- **Location**: `lib/google-maps-loader.ts` → `findZoneForPoint()`

---

## 👥 Fleet Visualization

### Driver Marker System

Drivers are represented with **custom taxi icons** that show real-time status:

| Status | Color | Icon | Description |
|--------|-------|------|-------------|
| **Available** | 🟢 Green | 🚕 | Online, no active trip |
| **On Trip** | 🔴 Red | 🚕 | Currently on an active trip |
| **Offline** | ⚪ Gray | 🚕 | Not connected or unavailable |

### Marker Features
- **Smooth animations** when position updates
- **Bounce effect** when selected
- **Shadow effects** for depth
- **Status indicator dot** on marker
- **Auto-zoom** to fit all active drivers

---

## 📡 Real-Time Updates

### Supabase Realtime Integration

The system uses **Supabase Realtime** for live updates:

```typescript
// Subscribes to all driver profile changes
supabase
  .channel('admin-live-map-drivers')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'profiles',
    filter: 'role=eq.driver'
  }, (payload) => {
    // Update UI instantly
  })
  .subscribe()
```

### What Updates in Real-Time?
- ✅ Driver GPS position (every 30 seconds)
- ✅ Online/Offline status
- ✅ Zone assignments
- ✅ Trip status changes
- ✅ New zones created/edited
- ✅ Driver profile updates

---

## 🎨 Apple-Style UI

### Glassmorphism Effects

All overlays use the luxury glassmorphism effect:

```css
.glass-card-light {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.2);
}
```

Applied to:
- 📊 Stats overlay (top-left of map)
- 👤 Driver detail sheets
- 🗺️ Zone editor panels
- 📱 Mobile bottom sheets

### Bottom Sheet Interaction

Clicking any driver marker opens an **iOS-style Bottom Sheet** with:
- Driver photo/initial
- Full name
- Phone number (tap to call)
- Vehicle number
- Current location coordinates
- Current zone
- **"Assign Trip"** button

---

## 🔧 Technical Implementation

### Key Files

| File | Purpose |
|------|---------|
| `lib/google-maps-loader.ts` | Map styles, taxi icons, zone detection |
| `components/admin/AdminLiveMapClient.tsx` | Main map component with real-time updates |
| `components/admin/DriverDetailSheet.tsx` | Driver info bottom sheet |
| `components/admin/ZoneMapEditor.tsx` | Zone drawing interface |
| `lib/hooks/useGeolocation.ts` | Driver GPS tracking (30s interval) |

### Database Schema

```sql
-- Profiles (Drivers)
profiles (
  id UUID PRIMARY KEY,
  full_name TEXT,
  phone TEXT,
  vehicle_number TEXT,
  is_online BOOLEAN,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  current_zone UUID REFERENCES zones(id)
)

-- Zones
zones (
  id UUID PRIMARY KEY,
  name TEXT,
  polygon_coordinates JSONB -- GeoJSON format
)

-- Trips
trips (
  id UUID PRIMARY KEY,
  driver_id UUID REFERENCES profiles(id),
  status trip_status, -- 'pending' | 'active' | 'completed'
  pickup_address TEXT,
  destination_address TEXT
)
```

### Point-in-Polygon Algorithm

Located in `lib/google-maps-loader.ts`:

```typescript
export function findZoneForPoint(
  point: { lat: number; lng: number },
  zones: Array<{ id: string; polygon_coordinates: any }>
): string | null {
  for (const zone of zones) {
    const coords = zone.polygon_coordinates.coordinates[0]
    const polygon = new google.maps.Polygon({ paths: coords })
    
    if (google.maps.geometry.poly.containsLocation(
      new google.maps.LatLng(point.lat, point.lng),
      polygon
    )) {
      return zone.id
    }
  }
  return null
}
```

---

## 📱 Mobile Experience

### Responsive Design
- **Mobile**: Bottom sheets, touch-optimized controls
- **Desktop**: Dialogs, hover effects, keyboard shortcuts
- **Tablet**: Hybrid approach with adaptive layouts

### Bottom Navigation
- Positioned at `bottom: 0` with `z-index: 50`
- FAB (Floating Action Button) at `bottom: 80px` to avoid overlap
- Safe area insets for notched devices

---

## 🚀 Getting Started

### Prerequisites
1. **Google Maps API Key** with these APIs enabled:
   - Maps JavaScript API
   - Places API
   - Geometry API
   - Drawing API

2. **Supabase Project** with:
   - Tables created (`supabase-migration.sql`)
   - Realtime enabled on all tables
   - RLS policies configured

### Environment Setup

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_key
```

### Running the System

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open in browser
# Admin: http://localhost:3000/admin/dashboard
# Driver: http://localhost:3000/driver/dashboard
```

---

## 📊 Dashboard Statistics

The map overlay shows real-time statistics:
- 🟢 **Active Drivers**: Count of online drivers
- 🗺️ **Active Zones**: Number of defined zones
- 📍 **Drivers in Zones**: Drivers currently in defined zones

---

## 🎯 Use Cases

### 1. Dispatcher View
- See all active taxis on the map
- Identify available drivers by green markers
- Check which zone each driver is in
- Assign trips to nearby drivers

### 2. Zone-Based Dispatch
- Create zones for different neighborhoods
- Track driver density per zone
- Balance fleet across zones
- Optimize response times

### 3. Real-Time Monitoring
- Watch drivers move in real-time
- Detect when drivers enter/leave zones
- Monitor trip progress
- Track fleet utilization

---

## 🔐 Security

- **Row Level Security (RLS)** on all tables
- **Admin-only** access to live map and zones
- **Driver-specific** trip and profile data
- **Secure API routes** with authentication checks

---

## 🎨 Design Philosophy

**Apple-Inspired UX:**
- Smooth animations and transitions
- Glassmorphism for depth and luxury
- High contrast for readability
- Touch-friendly interactions
- Minimal, clean interface

**Colors:**
- 🟢 Green (#10B981): Available, success
- 🔴 Red (#EF4444): Busy, error
- 🟡 Yellow (#F7C948): Warning, taxi brand
- ⚪ Gray (#6B7280): Inactive, neutral
- 🔵 Blue (#3B82F6): Primary actions

---

## 📈 Performance Optimizations

- **Memoized components** to prevent unnecessary re-renders
- **Debounced map updates** to avoid jitter
- **Efficient realtime subscriptions** with filters
- **Lazy loading** for maps and heavy components
- **Optimized marker rendering** with React.memo

---

## 🔮 Future Enhancements

- [ ] Trip routing with Google Directions API
- [ ] Heat maps for high-demand areas
- [ ] Driver performance analytics
- [ ] Automated dispatch algorithms
- [ ] Customer mobile app
- [ ] Voice dispatch commands
- [ ] Integration with payment systems

---

## 📞 Support

For issues or questions:
1. Check the console for errors
2. Verify all environment variables
3. Ensure Supabase tables are created
4. Confirm Google Maps APIs are enabled

---

**Built with ❤️ for Acre Taxi Station**
*Powered by Next.js, Supabase, and Google Maps*


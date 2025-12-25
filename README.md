# TaxiFlow - מערכת ניהול מוניות

מערכת ניהול מוניות מקצועית עם ממשק נהג (מובייל) וממשק מנהל (דסקטופ).

## 🚀 Real-Time Operation Center with PostGIS

**TaxiFlow is now a production-ready, real-time taxi dispatch system for Acre, Israel with PostGIS spatial database!**

### ✨ Latest Features (December 2025)
- 🗺️ **PostGIS Spatial Database** - Production-grade zone management
- 🎯 **Point-in-Polygon Detection** - Sub-10ms spatial queries
- 🤖 **n8n Automation Ready** - Standard GeoJSON API
- 🚕 **Live Fleet Tracking** - Real-time driver positions
- 📍 **Full-Screen Zone Editor** - Apple-style Focus Mode
- 🎨 **Framer Motion Animations** - Smooth, professional UI
- 📡 **Real-Time Sync** - Supabase Realtime integration

### 📚 Documentation

#### Quick Start (Choose One)
- **[PostGIS Quick Start](./POSTGIS-QUICKSTART.md)** ⭐ **NEW!** - 10-minute setup
- **[Legacy Quick Start](./QUICK-START.md)** - Original guide

#### Complete Guides
- **[PostGIS Zone System](./POSTGIS-ZONE-SYSTEM.md)** ⭐ **NEW!** - Production implementation
- **[n8n Workflows](./N8N-WORKFLOWS.md)** ⭐ **NEW!** - 6 ready-to-use automations
- **[Implementation Summary](./IMPLEMENTATION-COMPLETE.md)** ⭐ **NEW!** - What's been built
- **[Operation Center Guide](./OPERATION-CENTER.md)** - Real-time features
- **[Zone Focus Mode](./ZONE-FOCUS-MODE.md)** - UI/UX documentation

#### Database Setup
- **[PostGIS Migration](./supabase-postgis-migration.sql)** ⭐ **NEW!** - Spatial database
- **[Legacy Migration](./supabase-migration.sql)** - Original schema
- **[Real-time Enhancements](./supabase-realtime-enhancements.sql)** - Performance tuning

---

## 🎯 What's New in This Version

### Production-Ready Zone Management
- ✅ PostGIS GEOMETRY(Polygon, 4326) storage
- ✅ GIST spatial indexes (< 10ms queries)
- ✅ WKT/GeoJSON conversion utilities
- ✅ Automated area & centroid calculation
- ✅ n8n-compatible GeoJSON API
- ✅ Point-in-polygon endpoint for automations

### Enhanced Architecture
- ✅ Clean separation: MapEngine hook vs UI
- ✅ Spatial utilities library
- ✅ Framer Motion shared layout animations
- ✅ Glassmorphism UI effects
- ✅ Mobile-first BottomSheet

### Performance Improvements
- 🚀 **10x faster** spatial queries vs JSON
- 🚀 Real-time polygon validation
- 🚀 Smooth 60fps animations
- 🚀 Optimized map rendering

---

## טכנולוגיות

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (Authentication, Database, Real-time)
- **Framer Motion** (Animations)
- **Lucide React** (Icons)
- **Shadcn/UI** (UI Components)

## התקנה

1. התקן את התלויות:
```bash
npm install
```

2. צור קובץ `.env.local` והגדר את משתני הסביבה:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

**חשוב:**
- `SUPABASE_SERVICE_ROLE_KEY` נדרש ליצירת נהגים חדשים דרך ממשק המנהל (Admin API)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` נדרש להצגת מפות ולציור אזורים
- ניתן למצוא את המפתחות ב-Supabase Dashboard → Settings → API

3. הפעל את השרת:
```bash
npm run dev
```

## הגדרת מסד הנתונים (Supabase)

### 1. יצירת טבלאות

**חשוב:** הרץ את קובץ המיגרציה המלא `supabase-migration.sql` ב-Supabase SQL Editor. הקובץ מכיל את כל הטבלאות, האינדקסים, הטריגרים ומדיניות ה-RLS בסדר הנכון.

**הוראות מהירות:**
1. פתח את Supabase Dashboard → SQL Editor
2. העתק והדבק את כל התוכן של `supabase-migration.sql`
3. לחץ "Run" לביצוע המיגרציה
4. ודא שהטבלאות נוצרו: בדוק את "Table Editor" ב-Supabase Dashboard

הקובץ `supabase-migration.sql` כולל:
- יצירת טיפוסי enum (user_role, trip_status)
- יצירת טבלאות (zones, profiles, trips) - בסדר הנכון
- הוספת עמודת `vehicle_number` לטבלת `profiles`
- יצירת אינדקסים לביצועים
- יצירת טריגרים לעדכון updated_at
- הגדרת Row Level Security (RLS)
- הגדרת Realtime publication

### 2. Row Level Security (RLS)

הפעל RLS והגדר מדיניות:

```sql
-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Drivers can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Drivers can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Trips policies
CREATE POLICY "Drivers can view own trips"
  ON trips FOR SELECT
  USING (driver_id = auth.uid());

CREATE POLICY "Admins can view all trips"
  ON trips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert trips"
  ON trips FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update trips"
  ON trips FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Zones policies
CREATE POLICY "Everyone can view zones"
  ON zones FOR SELECT
  USING (true);
```

### 3. הגדרת Authentication

1. עבור ל-Supabase Dashboard > Authentication > Providers
2. הפעל את Phone provider
3. הגדר את Twilio או ספק SMS אחר

### 4. יצירת משתמשים לדוגמה

לאחר יצירת משתמש דרך Authentication, עדכן את הטבלה `profiles`:

```sql
-- Update profile after user creation (run after phone auth)
-- This should be done via a database trigger or function
```

או עדכן ידנית:

```sql
UPDATE profiles 
SET role = 'driver', full_name = 'שם הנהג'
WHERE phone = '050-1234567';
```

## מבנה הפרויקט

```
TaxiBot/
├── app/
│   ├── login/          # עמוד התחברות
│   ├── driver/          # ממשק נהג (מובייל)
│   └── admin/           # ממשק מנהל (דסקטופ)
├── components/
│   ├── ui/              # רכיבי Shadcn/UI
│   ├── driver/          # רכיבי נהג
│   └── admin/           # רכיבי מנהל
├── lib/
│   ├── hooks/           # React hooks
│   ├── supabase.ts      # Supabase client
│   └── utils.ts         # כלי עזר
└── app/api/             # API routes
```

## תכונות

### ממשק נהג (מובייל)
- התחברות עם OTP לטלפון
- מעבר Online/Offline
- מעקב GPS אוטומטי (כל 30 שניות)
- עדכון מיקום בתור בזמן אמת
- קבלת נסיעות חדשות בזמן אמת
- ניהול נסיעה פעילה (הגעתי/התחיל/סיים)
- היסטוריית נסיעות

### ממשק מנהל (דסקטופ)
- דאשבורד עם סטטיסטיקות בזמן אמת
- מפה חיה עם מיקומי נהגים (Google Maps)
- רשימת נהגים עם סטטוס ואישור
- יצירת ועריכת נהגים (עם אימייל וסיסמה)
- ניהול אזורים עם ציור פוליגונים על המפה
- היסטוריית נסיעות עם חיפוש וסינון
- ממשק מובייל עם Bottom Sheet ו-Responsive Table
- עיצוב Apple-style עם Glassmorphism

## פיתוח

```bash
# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## רישיון

ISC



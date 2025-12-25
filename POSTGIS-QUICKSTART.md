# 🚀 Quick Start Guide - PostGIS Zone System

## Prerequisites
- Supabase project set up
- Admin account created
- Google Maps API key configured

---

## 1. Database Setup (5 minutes)

### Step 1: Run Migration Script
1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy the entire contents of `supabase-postgis-migration.sql`
4. Paste and click **Run**

Expected output:
```
CREATE EXTENSION
CREATE TABLE
CREATE INDEX (2 rows)
CREATE FUNCTION (4 rows)
CREATE POLICY (2 rows)
✅ Success
```

### Step 2: Verify Installation
```sql
-- Check if PostGIS is enabled
SELECT PostGIS_version();

-- Should see zones_postgis table
SELECT COUNT(*) FROM zones_postgis;
```

---

## 2. Create Your First Zone (2 minutes)

1. **Navigate** to `/admin/zones` in your app
2. **Click** "צור אזור חדש" (Create New Zone)
3. **Click** "התחל לצייר" (Start Drawing)
4. **Draw** a polygon on the map of Acre
5. **Click** "המשך" (Continue)
6. **Enter** zone name (e.g., "עכו העתיקה")
7. **Select** a color
8. **Click** "שמור אזור" (Save Zone)

✅ Your first zone is now stored in PostGIS!

---

## 3. Test Point-in-Polygon (1 minute)

### Via API:
```bash
curl -X POST https://your-app.com/api/zones/check-point \
  -H "Content-Type: application/json" \
  -d '{"lat": 32.9270, "lng": 35.0830}'
```

### Via SQL:
```sql
SELECT * FROM get_zone_for_point(32.9270, 35.0830);
```

Expected response:
```json
{
  "in_zone": true,
  "zone": {
    "id": "uuid",
    "name": "עכו העתיקה",
    "color": "#F7C948"
  }
}
```

---

## 4. Get GeoJSON (n8n Ready)

```bash
curl https://your-app.com/api/zones
```

Returns standard GeoJSON FeatureCollection:
```json
{
  "type": "FeatureCollection",
  "features": [...]
}
```

---

## 5. Optional: Migrate Existing Zones

If you have zones in the old `zones` table:

```sql
-- Run migration function
SELECT migrate_zones_to_postgis();

-- Check results
SELECT 
  (SELECT COUNT(*) FROM zones) as old_count,
  (SELECT COUNT(*) FROM zones_postgis) as new_count;
```

---

## 🎯 Common Tasks

### Add Multiple Zones:
1. Repeat "Create Zone" workflow
2. Each zone gets its own color
3. Zones appear in admin dashboard

### Edit Existing Zone:
1. Go to `/admin/zones`
2. Click "ערוך" (Edit) on a zone
3. Modify polygon or properties
4. Save changes

### Delete Zone:
1. Click "מחק" (Delete)
2. Confirm deletion
3. Zone removed from PostGIS

---

## 🔧 Troubleshooting

### "PostGIS extension not found"
```sql
-- Run in SQL Editor:
CREATE EXTENSION IF NOT EXISTS postgis;
```

### "Function does not exist"
- Re-run the entire migration script
- Check for errors in the output

### "Map not loading"
- Verify Google Maps API key in `.env.local`
- Check browser console for errors

### "Zones not appearing"
```sql
-- Check if zones exist:
SELECT * FROM zones_postgis;

-- If empty, create via UI
```

---

## 📞 Next Steps

1. ✅ Create 3-5 zones covering Acre
2. ✅ Test point-in-polygon with real driver locations
3. ✅ Set up n8n workflow (see POSTGIS-ZONE-SYSTEM.md)
4. ✅ Configure zone-based notifications

---

## 💡 Pro Tips

- **Zoom in** close to Acre before drawing for accuracy
- **Use different colors** for easy zone identification
- **Keep polygons simple** (< 20 points) for best performance
- **Test zones** with `/api/zones/check-point` before production

---

**Total Setup Time:** ~10 minutes  
**Difficulty:** Easy 🟢

Need help? Check the full documentation in `POSTGIS-ZONE-SYSTEM.md`


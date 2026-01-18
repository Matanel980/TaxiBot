# 🗄️ Database Migration Instructions

## Adding Destination Coordinates to Trips Table

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: `zfzahgxrmlwotdzpjvhz`
3. Navigate to **SQL Editor** (left sidebar)
4. Click **"New query"** button (top right)

### Step 2: Paste the Migration SQL

1. Open the file: `supabase-add-destination-coordinates-migration.sql`
2. **Copy the entire contents** (everything between the BEGIN and COMMIT statements)
3. **Paste into the SQL Editor** in Supabase
4. Click **"Run"** button (or press `Ctrl+Enter` / `Cmd+Enter`)

### Step 3: Verify Migration Success

After running, execute these verification queries in the SQL Editor:

```sql
-- Check columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'trips' 
AND column_name IN ('destination_lat', 'destination_lng');
```

**Expected Result:**
- `destination_lat` - `double precision` - `YES` (nullable)
- `destination_lng` - `double precision` - `YES` (nullable)

```sql
-- Check index was created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'trips' 
AND indexname = 'idx_trips_destination_coords';
```

**Expected Result:** Should show the GIST index definition

```sql
-- Count trips with/without destination coordinates
SELECT 
  COUNT(*) as total_trips,
  COUNT(destination_lat) as trips_with_dest_lat,
  COUNT(destination_lng) as trips_with_dest_lng,
  COUNT(*) FILTER (WHERE destination_lat IS NOT NULL AND destination_lng IS NOT NULL) as trips_with_both_coords
FROM trips;
```

**Expected Result:** Shows current state of your trips table

### Step 4: RLS Policy Verification

If you have Row Level Security (RLS) enabled on the `trips` table:

1. Go to **Authentication** > **Policies** in Supabase Dashboard
2. Find policies for the `trips` table
3. **If policies use explicit column lists**, update them to include:
   - `destination_lat`
   - `destination_lng`
4. **If policies use `SELECT *` or no column list**, they should work automatically

### Step 5: Test Trip Creation

1. Create a new trip via Admin Dashboard
2. Verify both `pickup_lat/lng` AND `destination_lat/lng` are saved
3. Check the `trips` table in Supabase to confirm coordinates are present

### Troubleshooting

**Error: "column already exists"**
- The columns were already added - this is safe to ignore
- The migration uses `IF NOT EXISTS` so it won't break

**Error: "permission denied"**
- Ensure you're using a user with sufficient privileges
- Try running as the `postgres` role or service role

**RLS Policy Issues**
- If you can't read/write the new columns, check your RLS policies
- Update policies to explicitly include `destination_lat` and `destination_lng`

### Backfilling Existing Trips

If you have existing trips without destination coordinates:

1. They will have `NULL` values (safe - won't break the app)
2. To backfill, you'll need to:
   - Export trips without destination coordinates
   - Geocode their `destination_address` using Google Geocoding API
   - Update the database with the coordinates

**Example backfill query (customize for your needs):**
```sql
-- This is a template - you'll need to geocode addresses first
UPDATE trips 
SET destination_lat = <geocoded_lat>, 
    destination_lng = <geocoded_lng>
WHERE id = '<trip_id>' 
AND (destination_lat IS NULL OR destination_lng IS NULL);
```

## ✅ Migration Complete

Once verified, your system will:
- ✅ Require destination coordinates for all NEW trips
- ✅ Allow NULLs for existing trips (backward compatible)
- ✅ Support route visualization with complete coordinate data
- ✅ Prevent REQUEST_DENIED errors from geocoding






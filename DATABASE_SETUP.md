# Database Setup Guide

## Quick Start

1. **Run the Migration Script**
   - Open Supabase Dashboard → SQL Editor
   - Copy and paste the entire contents of `supabase-migration.sql`
   - Click "Run" to execute

2. **Create Your First Admin User**
   - Go to Supabase Dashboard → Authentication → Users
   - Click "Add User" → "Create new user"
   - Enter phone number (e.g., +972501234567)
   - Copy the User UUID that is generated
   - Go to SQL Editor and run:
   ```sql
   INSERT INTO profiles (id, phone, role, full_name, is_approved)
   VALUES (
     'PASTE_USER_UUID_HERE',
     '+972501234567',
     'admin',
     'Admin Name',
     true
   );
   ```

3. **Create Test Drivers (Optional)**
   - Create auth users in Authentication
   - For each user, insert a profile:
   ```sql
   INSERT INTO profiles (id, phone, role, full_name, is_approved)
   VALUES (
     'DRIVER_USER_UUID',
     '+972501234568',
     'driver',
     'Driver Name',
     true
   );
   ```

## Important Notes

- **Profiles require Auth Users**: The `profiles.id` must reference an existing `auth.users.id`
- **RLS Policies**: All tables have Row Level Security enabled
- **Realtime**: Tables are enabled for real-time subscriptions
- **Admin Permissions**: Only users with `role = 'admin'` can create/edit trips and zones

## Troubleshooting

### "relation 'profiles' does not exist"
- Run the migration script: `supabase-migration.sql`

### "Foreign key violation" when creating driver
- Ensure you've created the auth user first in Supabase Authentication
- Use the auth user's UUID as the profile ID

### "Permission denied" errors
- Check that your user has `role = 'admin'` in the profiles table
- Verify RLS policies are correctly applied









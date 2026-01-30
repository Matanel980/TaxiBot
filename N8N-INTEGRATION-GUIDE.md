# n8n Integration Guide: Trip Creation & Driver Discovery

## Overview

This guide explains how to integrate TaxiBot with n8n (or any automation platform) to:
1. Create trips via webhook
2. Automatically detect station_id from coordinates
3. Find nearest available drivers in clean JSON format

---

## Endpoints

### 1. Create Trip (Webhook)

**Endpoint:** `POST /api/webhooks/trips/create`

**Authentication:** API Key + Optional HMAC Signature

**Request:**
```json
{
  "customer_phone": "+972501234567",
  "pickup_address": "רחוב הרצל 1, עכו",
  "destination_address": "נמל עכו",
  "pickup_lat": 32.9234,
  "pickup_lng": 35.0812,
  "destination_lat": 32.9250,
  "destination_lng": 35.0820,
  "station_id": "optional-station-uuid", // If not provided, will be auto-detected
  "zone_id": "optional-zone-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "trip": {
    "id": "trip-uuid",
    "customer_phone": "+972501234567",
    "pickup_address": "רחוב הרצל 1, עכו",
    "destination_address": "נמל עכו",
    "status": "pending",
    "zone_id": "zone-uuid",
    "pickup_lat": 32.9234,
    "pickup_lng": 35.0812,
    "destination_lat": 32.9250,
    "destination_lng": 35.0820,
    "created_at": "2026-01-15T10:30:00Z"
  }
}
```

**n8n Configuration:**
- **Method:** POST
- **URL:** `https://your-domain.com/api/webhooks/trips/create`
- **Headers:**
  - `X-API-Key: your-api-key`
  - `Content-Type: application/json`
- **Body:** JSON (as shown above)

---

### 2. Find Nearest Drivers (REST API)

**Endpoint:** `POST /api/trips/find-drivers` or `GET /api/trips/find-drivers`

**Authentication:** Service Role Key (Bearer Token)

**Request (POST):**
```json
{
  "pickup_lat": 32.9234,
  "pickup_lng": 35.0812,
  "zone_id": "optional-zone-uuid",
  "station_id": "optional-station-uuid" // If not provided, auto-detected from coordinates
}
```

**Request (GET):**
```
GET /api/trips/find-drivers?pickup_lat=32.9234&pickup_lng=35.0812&zone_id=optional-uuid&station_id=optional-uuid
```

**Response (n8n-friendly JSON):**
```json
{
  "success": true,
  "station_id": "detected-or-provided-station-id",
  "pickup_location": {
    "latitude": 32.9234,
    "longitude": 35.0812
  },
  "drivers": [
    {
      "id": "driver-uuid-1",
      "full_name": "יוסי כהן",
      "phone": "+972501234567",
      "latitude": 32.9240,
      "longitude": 35.0815,
      "distance_meters": 234.56,
      "distance_km": 0.23,
      "station_id": "station-uuid",
      "vehicle_number": "123-45-678",
      "car_type": "Sedan"
    },
    {
      "id": "driver-uuid-2",
      "full_name": "דני לוי",
      "phone": "+972509876543",
      "latitude": 32.9250,
      "longitude": 35.0820,
      "distance_meters": 567.89,
      "distance_km": 0.57,
      "station_id": "station-uuid",
      "vehicle_number": "987-65-432",
      "car_type": "SUV"
    }
  ],
  "driver_count": 2
}
```

**n8n Configuration:**
- **Method:** POST or GET
- **URL:** `https://your-domain.com/api/trips/find-drivers`
- **Headers:**
  - `Authorization: Bearer your-service-role-key`
  - `Content-Type: application/json` (for POST)
- **Body/Query:** As shown above

---

## Automatic Station Detection

The system automatically detects `station_id` from pickup coordinates using PostGIS:

1. **Zone-Based Detection:** Checks which station's zone contains the pickup point
2. **Proximity Fallback:** If no zone match, finds nearest station by zone center distance

**How it works:**
- When `station_id` is not provided in the request, the system calls `detect_station_from_coordinates()`
- This function queries `zones_postgis` table to find which station's zone contains the point
- Returns the detected `station_id` or `null` if no match

**Benefits:**
- No manual station_id management needed
- Automatically routes trips to correct station
- Multi-tenant isolation maintained

---

## n8n Workflow Examples

### Example 1: Create Trip and Find Drivers

```json
{
  "nodes": [
    {
      "name": "Create Trip",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "https://your-domain.com/api/webhooks/trips/create",
        "headers": {
          "X-API-Key": "{{ $env.API_KEY }}",
          "Content-Type": "application/json"
        },
        "body": {
          "customer_phone": "{{ $json.phone }}",
          "pickup_address": "{{ $json.pickup }}",
          "destination_address": "{{ $json.destination }}",
          "pickup_lat": "{{ $json.pickup_lat }}",
          "pickup_lng": "{{ $json.pickup_lng }}",
          "destination_lat": "{{ $json.dest_lat }}",
          "destination_lng": "{{ $json.dest_lng }}"
        }
      }
    },
    {
      "name": "Find Nearest Drivers",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "https://your-domain.com/api/trips/find-drivers",
        "headers": {
          "Authorization": "Bearer {{ $env.SERVICE_ROLE_KEY }}",
          "Content-Type": "application/json"
        },
        "body": {
          "pickup_lat": "{{ $json.trip.pickup_lat }}",
          "pickup_lng": "{{ $json.trip.pickup_lng }}"
        }
      }
    },
    {
      "name": "Notify Driver",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "https://your-domain.com/api/trips/accept",
        "body": {
          "tripId": "{{ $('Create Trip').item.json.trip.id }}",
          "driverId": "{{ $json.drivers[0].id }}"
        }
      }
    }
  ]
}
```

### Example 2: Simple GET Request (n8n HTTP Request Node)

**URL:** `https://your-domain.com/api/trips/find-drivers?pickup_lat=32.9234&pickup_lng=35.0812`

**Headers:**
```
Authorization: Bearer your-service-role-key
```

**Response Parsing:**
- `{{ $json.drivers[0].id }}` - Nearest driver ID
- `{{ $json.drivers[0].distance_km }}` - Distance in kilometers
- `{{ $json.station_id }}` - Detected station ID

---

## Database Functions

### 1. `find_nearest_drivers_auto()`

**Purpose:** Main function for n8n integration - auto-detects station and returns drivers

**Parameters:**
- `pickup_lat` (DOUBLE PRECISION) - Required
- `pickup_lng` (DOUBLE PRECISION) - Required
- `zone_id_filter` (UUID) - Optional
- `station_id_override` (UUID) - Optional (if provided, skips auto-detection)

**Returns:** JSON object with drivers array

**Example SQL:**
```sql
SELECT find_nearest_drivers_auto(32.9234, 35.0812);
```

### 2. `detect_station_from_coordinates()`

**Purpose:** Automatically detects which station a coordinate belongs to

**Parameters:**
- `pickup_lat` (DOUBLE PRECISION)
- `pickup_lng` (DOUBLE PRECISION)

**Returns:** UUID (station_id) or NULL

**Example SQL:**
```sql
SELECT detect_station_from_coordinates(32.9234, 35.0812);
```

### 3. `find_nearest_driver()`

**Purpose:** Core PostGIS function for distance calculation

**Parameters:**
- `pickup_lat` (DOUBLE PRECISION)
- `pickup_lng` (DOUBLE PRECISION)
- `zone_id_filter` (UUID) - Optional
- `station_id_filter` (UUID) - Optional

**Returns:** Table with driver details and distance

**Example SQL:**
```sql
SELECT * FROM find_nearest_driver(32.9234, 35.0812, NULL, 'station-uuid');
```

---

## Setup Instructions

### 1. Run Database Migration

Execute in Supabase SQL Editor:
```sql
-- File: supabase-find-nearest-driver-function-enhanced.sql
```

This creates:
- Enhanced `find_nearest_driver()` function (with station_id support)
- `detect_station_from_coordinates()` function (auto station detection)
- `find_nearest_drivers_auto()` function (n8n-friendly JSON output)

### 2. Get Service Role Key

1. Go to Supabase Dashboard
2. Settings → API
3. Copy `service_role` key (keep it secret!)

### 3. Configure n8n

**Environment Variables:**
- `API_KEY` - Your webhook API key
- `SERVICE_ROLE_KEY` - Supabase service role key

**HTTP Request Node Settings:**
- Use POST for `/api/webhooks/trips/create`
- Use POST or GET for `/api/trips/find-drivers`
- Include Authorization header with service role key

---

## Response Format Details

### Driver Object Structure

```json
{
  "id": "uuid",              // Driver profile ID
  "full_name": "string",     // Driver full name
  "phone": "string",         // Driver phone (E.164 format)
  "latitude": 32.9234,       // Driver current latitude
  "longitude": 35.0812,      // Driver current longitude
  "distance_meters": 234.56, // Distance in meters (PostGIS calculated)
  "distance_km": 0.23,       // Distance in kilometers (rounded)
  "station_id": "uuid",      // Driver's station assignment
  "vehicle_number": "string", // Vehicle registration
  "car_type": "string"       // Vehicle type (Sedan, SUV, etc.)
}
```

### Response Metadata

```json
{
  "success": true,           // Operation success status
  "station_id": "uuid",     // Detected or provided station ID
  "pickup_location": {      // Requested pickup coordinates
    "latitude": 32.9234,
    "longitude": 35.0812
  },
  "drivers": [...],          // Array of driver objects (sorted by distance)
  "driver_count": 2          // Number of drivers found
}
```

---

## Error Handling

### Common Errors

**401 Unauthorized:**
```json
{
  "success": false,
  "error": "Missing or invalid authorization"
}
```
**Fix:** Include `Authorization: Bearer <service_role_key>` header

**400 Bad Request:**
```json
{
  "success": false,
  "error": "pickup_lat and pickup_lng are required"
}
```
**Fix:** Provide valid coordinates in request

**500 Internal Server Error:**
```json
{
  "success": false,
  "error": "Failed to find drivers",
  "details": "Error message here"
}
```
**Fix:** Check database function exists and PostGIS is enabled

---

## Testing

### Test Trip Creation

```bash
curl -X POST https://your-domain.com/api/webhooks/trips/create \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_phone": "+972501234567",
    "pickup_address": "רחוב הרצל 1, עכו",
    "destination_address": "נמל עכו",
    "pickup_lat": 32.9234,
    "pickup_lng": 35.0812,
    "destination_lat": 32.9250,
    "destination_lng": 35.0820
  }'
```

### Test Driver Discovery

```bash
curl -X POST https://your-domain.com/api/trips/find-drivers \
  -H "Authorization: Bearer your-service-role-key" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_lat": 32.9234,
    "pickup_lng": 35.0812
  }'
```

---

## Security Notes

1. **Service Role Key:** Never expose in client-side code or public repositories
2. **API Keys:** Store in n8n environment variables or secrets
3. **HTTPS Only:** Always use HTTPS in production
4. **Rate Limiting:** Consider implementing rate limits for webhook endpoints

---

## Support

For issues or questions:
1. Check Supabase logs for database function errors
2. Verify PostGIS extension is enabled
3. Ensure zones_postgis table has station_id populated
4. Test station detection function directly in SQL Editor

# TaxiBot API Documentation
**Version**: 1.0  
**Base URL**: `https://your-domain.com` (Replace with your production URL)  
**Last Updated**: 2025-01-18

---

## Table of Contents

1. [Authentication](#authentication)
2. [Creating a Trip](#creating-a-trip)
3. [Fetching Available Drivers](#fetching-available-drivers)
4. [Assigning a Trip to a Driver](#assigning-a-trip-to-a-driver)
5. [Additional Endpoints](#additional-endpoints)
6. [Error Handling](#error-handling)

---

## Authentication

### Webhook Authentication (for Automation Systems)

Webhook endpoints use **API Key** authentication with optional **HMAC signature** verification.

#### Headers Required

```http
X-API-Key: your-api-key-here
X-Signature: sha256=hmac-signature (optional if HMAC_SECRET not configured)
Content-Type: application/json
```

#### Environment Variables

Set these in your `.env.local`:
- `WEBHOOK_API_KEYS`: Comma-separated list of valid API keys
- `WEBHOOK_SECRET_KEY`: (Optional) HMAC secret for signature verification

#### Rate Limiting

- **Limit**: 100 requests per minute per API key
- **Window**: 60 seconds
- **Response**: `429 Too Many Requests` when exceeded

---

## Creating a Trip

### Endpoint

```
POST /api/webhooks/trips/create
```

### Authentication

Requires **Webhook Authentication** (API Key + optional HMAC signature).

### Request Body

```json
{
  "customer_phone": "+972501234567",
  "pickup_address": "רחוב הרצל 1, תל אביב",
  "destination_address": "נמל תל אביב",
  "pickup_lat": 32.0853,
  "pickup_lng": 34.7818,
  "destination_lat": 32.0833,
  "destination_lng": 34.7694,
  "station_id": "uuid-of-station",
  "zone_id": "uuid-of-zone (optional)",
  "metadata": {
    "source": "whatsapp",
    "conversation_id": "abc123"
  }
}
```

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `customer_phone` | `string` | E.164 format phone number | `"+972501234567"` |
| `pickup_address` | `string` | Human-readable pickup address | `"רחוב הרצל 1, תל אביב"` |
| `destination_address` | `string` | Human-readable destination address | `"נמל תל אביב"` |
| `station_id` | `string` (UUID) | **CRITICAL**: Station UUID for multi-tenant isolation | `"550e8400-e29b-41d4-a716-446655440000"` |

### Optional Fields

| Field | Type | Description | Notes |
|-------|------|-------------|-------|
| `pickup_lat` | `number` | Pickup latitude (-90 to 90) | Auto-geocoded if omitted |
| `pickup_lng` | `number` | Pickup longitude (-180 to 180) | Auto-geocoded if omitted |
| `destination_lat` | `number` | Destination latitude | Auto-geocoded if omitted |
| `destination_lng` | `number` | Destination longitude | Auto-geocoded if omitted |
| `zone_id` | `string` (UUID) | Zone UUID for automatic assignment | Auto-detected if omitted |
| `metadata` | `object` | Custom metadata for tracking | Stored for reference |

### Important Notes

1. **Coordinates**: If `pickup_lat`/`pickup_lng` or `destination_lat`/`destination_lng` are not provided, the system will automatically geocode the addresses. However, **providing coordinates is recommended** for accuracy.

2. **Phone Format**: Phone numbers **must** be in E.164 format: `+972XXXXXXXXX` (Israel country code + 9 digits).

3. **Station ID**: The `station_id` is **CRITICAL** for multi-tenant isolation. Each trip must be associated with a station. Ensure your automation system has the correct station UUID.

### Response (Success)

**Status Code**: `200 OK`

```json
{
  "success": true,
  "trip": {
    "id": "trip-uuid-here",
    "customer_phone": "+972501234567",
    "pickup_address": "רחוב הרצל 1, תל אביב",
    "destination_address": "נמל תל אביב",
    "status": "pending",
    "zone_id": "zone-uuid-or-null",
    "pickup_lat": 32.0853,
    "pickup_lng": 34.7818,
    "destination_lat": 32.0833,
    "destination_lng": 34.7694,
    "created_at": "2025-01-18T10:30:00.000Z"
  }
}
```

### Response (Error)

**Status Codes**: `400 Bad Request`, `401 Unauthorized`, `429 Too Many Requests`, `500 Internal Server Error`

```json
{
  "error": "Error message here",
  "details": "Additional error details (optional)"
}
```

### Example cURL Request

```bash
curl -X POST https://your-domain.com/api/webhooks/trips/create \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -H "X-Signature: sha256=hmac-signature-here" \
  -d '{
    "customer_phone": "+972501234567",
    "pickup_address": "רחוב הרצל 1, תל אביב",
    "destination_address": "נמל תל אביב",
    "pickup_lat": 32.0853,
    "pickup_lng": 34.7818,
    "destination_lat": 32.0833,
    "destination_lng": 34.7694,
    "station_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

### Example JavaScript/TypeScript

```typescript
const createTrip = async () => {
  const response = await fetch('https://your-domain.com/api/webhooks/trips/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'your-api-key-here',
      'X-Signature': 'sha256=hmac-signature-here', // Optional
    },
    body: JSON.stringify({
      customer_phone: '+972501234567',
      pickup_address: 'רחוב הרצל 1, תל אביב',
      destination_address: 'נמל תל אביב',
      pickup_lat: 32.0853,
      pickup_lng: 34.7818,
      destination_lat: 32.0833,
      destination_lng: 34.7694,
      station_id: '550e8400-e29b-41d4-a716-446655440000',
    }),
  });

  const data = await response.json();
  if (response.ok) {
    console.log('Trip created:', data.trip.id);
  } else {
    console.error('Error:', data.error);
  }
};
```

---

## Fetching Available Drivers

### Option 1: Direct Supabase Query (Recommended for Automation)

For automation systems with **Supabase Service Role Key**, query the `profiles` table directly:

#### Query Parameters

```sql
SELECT 
  id,
  phone,
  full_name,
  vehicle_number,
  car_type,
  current_zone,
  latitude,
  longitude,
  current_address,
  heading,
  is_online,
  is_approved,
  station_id,
  updated_at
FROM profiles
WHERE 
  role = 'driver'
  AND station_id = 'your-station-uuid'
  AND is_online = true
  AND is_approved = true
ORDER BY updated_at DESC
```

#### Using Supabase Client (TypeScript/JavaScript)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://your-project.supabase.co',
  'your-service-role-key' // Service role key bypasses RLS
);

const { data: drivers, error } = await supabase
  .from('profiles')
  .select('id, phone, full_name, vehicle_number, car_type, current_zone, latitude, longitude, current_address, heading, is_online, is_approved, station_id, updated_at')
  .eq('role', 'driver')
  .eq('station_id', 'your-station-uuid')
  .eq('is_online', true)
  .eq('is_approved', true)
  .order('updated_at', { ascending: false });

if (error) {
  console.error('Error fetching drivers:', error);
} else {
  console.log('Available drivers:', drivers);
}
```

### Option 2: REST API Endpoint (Requires Admin Authentication)

**Note**: This endpoint requires Supabase authentication with an admin user account. For automation systems, **Option 1** is recommended.

```
GET /api/zones (Returns driver data as part of zone information)
```

**Authentication**: Supabase Session Cookie or Bearer Token

---

## Assigning a Trip to a Driver

### Option 1: Direct Database Update (Recommended for Automation)

For automation systems with **Supabase Service Role Key**, update the `trips` table directly:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://your-project.supabase.co',
  'your-service-role-key'
);

// Assign trip to driver
const { data, error } = await supabase
  .from('trips')
  .update({
    driver_id: 'driver-uuid-here',
    status: 'active',
    accepted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .eq('id', 'trip-uuid-here')
  .eq('status', 'pending') // Critical: Only update if still pending
  .select()
  .single();

if (error) {
  console.error('Error assigning trip:', error);
} else {
  console.log('Trip assigned:', data);
}
```

### Option 2: REST API Endpoint (Driver Self-Accept)

**Note**: This endpoint requires the **driver** to be authenticated. The driver must accept the trip themselves. For automation systems that need to assign trips directly, use **Option 1**.

```
POST /api/trips/accept
```

**Authentication**: Supabase Session Cookie or Bearer Token (Driver account)

#### Request Body

```json
{
  "tripId": "trip-uuid-here"
}
```

#### Response (Success)

```json
{
  "success": true,
  "trip": {
    "id": "trip-uuid-here",
    "customer_phone": "+972501234567",
    "pickup_address": "רחוב הרצל 1, תל אביב",
    "destination_address": "נמל תל אביב",
    "status": "active",
    "driver_id": "driver-uuid-here",
    "accepted_at": "2025-01-18T10:35:00.000Z",
    ...
  }
}
```

### Important Notes for Trip Assignment

1. **Race Condition Prevention**: Always use `.eq('status', 'pending')` when updating to prevent assigning trips that have already been accepted.

2. **Station Isolation**: Ensure the `driver_id` belongs to the same `station_id` as the trip. The system enforces this, but it's good practice to verify.

3. **Driver Status**: The driver must be `is_online = true` and `is_approved = true` for assignment to be meaningful.

---

## Additional Endpoints

### Update Trip Status

```
POST /api/trips/update-status
```

**Authentication**: Driver authentication required

**Request Body**:
```json
{
  "tripId": "trip-uuid",
  "status": "active" | "completed"
}
```

### Get Trip History

```
GET /api/trips/history
```

**Authentication**: Driver or Admin authentication required

**Query Parameters**:
- `limit`: Number of trips to return (default: 50)
- `offset`: Pagination offset

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| `200` | OK | Request successful |
| `400` | Bad Request | Invalid request body or parameters |
| `401` | Unauthorized | Missing or invalid API key/authentication |
| `403` | Forbidden | Insufficient permissions |
| `404` | Not Found | Resource not found |
| `409` | Conflict | Resource conflict (e.g., trip already assigned) |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Server error |

### Error Response Format

```json
{
  "error": "Human-readable error message",
  "details": "Technical details (optional)",
  "code": "ERROR_CODE (optional)"
}
```

### Common Errors

#### Invalid Phone Format

```json
{
  "error": "customer_phone must be in E.164 format (+972XXXXXXXXX)"
}
```

#### Missing Station ID

```json
{
  "error": "station_id is required. Provide it in the webhook payload or ensure the authenticated user has a station_id assigned."
}
```

#### Trip Already Assigned

```json
{
  "error": "Trip is no longer available",
  "code": "CONFLICT",
  "currentStatus": "active"
}
```

#### Rate Limit Exceeded

```json
{
  "error": "Rate limit exceeded"
}
```

---

## Integration Examples

### Complete WhatsApp Integration Flow

```typescript
// 1. Create trip from WhatsApp message
const tripResponse = await fetch('https://your-domain.com/api/webhooks/trips/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.WEBHOOK_API_KEY,
  },
  body: JSON.stringify({
    customer_phone: '+972' + whatsappPhoneNumber,
    pickup_address: extractedPickupAddress,
    destination_address: extractedDestinationAddress,
    station_id: process.env.STATION_ID,
    metadata: {
      source: 'whatsapp',
      conversation_id: whatsappConversationId,
    },
  }),
});

const { trip } = await tripResponse.json();

// 2. Find available drivers
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: drivers } = await supabase
  .from('profiles')
  .select('id, full_name, phone')
  .eq('role', 'driver')
  .eq('station_id', process.env.STATION_ID)
  .eq('is_online', true)
  .eq('is_approved', true);

// 3. Assign to nearest/best driver (your logic here)
const selectedDriver = selectBestDriver(drivers, trip);

// 4. Assign trip to driver
await supabase
  .from('trips')
  .update({
    driver_id: selectedDriver.id,
    status: 'active',
    accepted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .eq('id', trip.id)
  .eq('status', 'pending');
```

### AI Voice Integration Flow

```typescript
// 1. Extract trip details from voice transcription
const tripDetails = await parseVoiceTranscription(audioTranscript);

// 2. Create trip
const trip = await createTrip({
  customer_phone: callMetadata.phoneNumber,
  pickup_address: tripDetails.pickup,
  destination_address: tripDetails.destination,
  station_id: getStationFromPhoneNumber(callMetadata.phoneNumber),
});

// 3. Notify driver via push notification (if configured)
// The system handles driver notification automatically
```

---

## Data Models

### Trip Object

```typescript
interface Trip {
  id: string; // UUID
  customer_phone: string; // E.164 format
  pickup_address: string;
  destination_address: string;
  status: 'pending' | 'active' | 'completed';
  driver_id: string | null; // UUID, null if unassigned
  zone_id: string | null; // UUID
  station_id: string; // UUID (CRITICAL)
  pickup_lat: number;
  pickup_lng: number;
  destination_lat: number;
  destination_lng: number;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  accepted_at: string | null; // ISO 8601
}
```

### Driver (Profile) Object

```typescript
interface Driver {
  id: string; // UUID
  phone: string; // E.164 format
  full_name: string;
  vehicle_number: string | null;
  car_type: string | null;
  current_zone: string | null; // UUID
  latitude: number | null;
  longitude: number | null;
  current_address: string | null;
  heading: number | null; // 0-360 degrees
  is_online: boolean;
  is_approved: boolean;
  station_id: string; // UUID (CRITICAL)
  updated_at: string; // ISO 8601
}
```

---

## Security Best Practices

1. **Never expose Service Role Key** in client-side code or public repositories.

2. **Use API Keys** for webhook endpoints instead of Service Role Key when possible.

3. **Validate Input**: Always validate phone numbers, coordinates, and UUIDs before sending requests.

4. **Station Isolation**: Always verify `station_id` matches between trips and drivers.

5. **Rate Limiting**: Respect rate limits to avoid `429` errors.

6. **Error Handling**: Always handle errors gracefully and log them for debugging.

---

## Support & Troubleshooting

### Common Issues

**Issue**: "Invalid API key"  
**Solution**: Check that `WEBHOOK_API_KEYS` environment variable contains your API key.

**Issue**: "station_id is required"  
**Solution**: Ensure `station_id` is provided in the request body or the authenticated user has a `station_id` assigned.

**Issue**: "Geocoding failed"  
**Solution**: Ensure addresses are in Hebrew or English and are valid. Consider providing coordinates directly.

**Issue**: Trip creation succeeds but driver assignment fails  
**Solution**: Verify the driver's `is_online` and `is_approved` status, and ensure they belong to the same `station_id`.

---

## Changelog

### v1.0 (2025-01-18)
- Initial API documentation
- Webhook authentication support
- Trip creation endpoint
- Driver fetching via Supabase
- Trip assignment via direct database update

---

**For technical support or questions**, please contact your system administrator or refer to the main repository documentation.


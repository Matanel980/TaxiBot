# n8n Automation Workflows - Zone-Based Actions

## 🤖 Overview
This guide provides ready-to-use n8n workflows for the PostGIS Zone Management System.

---

## Workflow 1: Driver Zone Entry Notification

### Trigger: When driver enters a specific zone
### Action: Send SMS notification

```json
{
  "name": "Driver Zone Entry Alert",
  "nodes": [
    {
      "name": "Webhook - Driver Location Update",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "driver-location",
        "responseMode": "onReceived",
        "method": "POST"
      }
    },
    {
      "name": "Check Zone",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "https://your-app.com/api/zones/check-point",
        "sendBody": true,
        "bodyParameters": {
          "lat": "={{$json.latitude}}",
          "lng": "={{$json.longitude}}"
        }
      }
    },
    {
      "name": "Filter - In Target Zone",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "boolean": [
            {
              "value1": "={{$json.in_zone}}",
              "value2": true
            },
            {
              "value1": "={{$json.zone.name}}",
              "value2": "עכו העתיקה"
            }
          ]
        }
      }
    },
    {
      "name": "Send SMS",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "https://sms-api.com/send",
        "bodyParameters": {
          "to": "={{$json.driver_phone}}",
          "message": "נכנסת לאזור: {{$json.zone.name}}"
        }
      }
    }
  ]
}
```

---

## Workflow 2: Zone Occupancy Monitor

### Trigger: Every 5 minutes
### Action: Update zone statistics

```javascript
// n8n Code Node
const zones = await $http.get('https://your-app.com/api/zones')

for (const feature of zones.features) {
  const zoneId = feature.id
  const zoneName = feature.properties.name
  const driverCount = feature.properties.driverCount
  
  // Log to database or dashboard
  await $http.post('https://your-app.com/api/analytics', {
    zone_id: zoneId,
    zone_name: zoneName,
    driver_count: driverCount,
    timestamp: new Date().toISOString()
  })
  
  // Alert if zone is empty
  if (driverCount === 0) {
    await $http.post('https://your-app.com/api/alerts', {
      type: 'zone_empty',
      zone_name: zoneName,
      message: `אזור ${zoneName} ריק מנהגים!`
    })
  }
}
```

---

## Workflow 3: Dynamic Zone Assignment

### Trigger: New trip request
### Action: Find nearest available driver in zone

```javascript
// n8n Code Node
const tripLocation = {
  lat: $json.pickup_latitude,
  lng: $json.pickup_longitude
}

// Check which zone the trip is in
const zoneCheck = await $http.post(
  'https://your-app.com/api/zones/check-point',
  tripLocation
)

if (!zoneCheck.in_zone) {
  return { error: 'Trip location is outside all zones' }
}

// Get drivers in that zone
const drivers = await $http.get(
  `https://your-app.com/api/drivers?zone_id=${zoneCheck.zone.id}&status=available`
)

if (drivers.length === 0) {
  // No drivers in zone, expand search
  const allDrivers = await $http.get(
    'https://your-app.com/api/drivers?status=available'
  )
  
  // Find nearest driver
  let nearestDriver = null
  let minDistance = Infinity
  
  for (const driver of allDrivers) {
    const distance = calculateDistance(
      tripLocation,
      { lat: driver.latitude, lng: driver.longitude }
    )
    if (distance < minDistance) {
      minDistance = distance
      nearestDriver = driver
    }
  }
  
  return { driver: nearestDriver, in_zone: false, distance: minDistance }
}

// Return first available driver in zone
return { driver: drivers[0], in_zone: true, zone: zoneCheck.zone }
```

---

## Workflow 4: Zone-Based Pricing

### Trigger: Trip fare calculation
### Action: Apply zone-specific multipliers

```javascript
// n8n Code Node
const pickupZone = await $http.post(
  'https://your-app.com/api/zones/check-point',
  { lat: $json.pickup_lat, lng: $json.pickup_lng }
)

const dropoffZone = await $http.post(
  'https://your-app.com/api/zones/check-point',
  { lat: $json.dropoff_lat, lng: $json.dropoff_lng }
)

let baseFare = $json.base_fare
let multiplier = 1.0

// Apply zone-specific pricing
const pricingRules = {
  'עכו העתיקה': 1.2,    // Old Acre: +20%
  'מזרח עכו': 1.0,      // East Acre: standard
  'מרכז עכו': 1.1       // Center: +10%
}

if (pickupZone.in_zone) {
  multiplier *= pricingRules[pickupZone.zone.name] || 1.0
}

if (dropoffZone.in_zone && dropoffZone.zone.name !== pickupZone.zone.name) {
  // Cross-zone trip: additional charge
  multiplier += 0.15
}

const finalFare = baseFare * multiplier

return {
  base_fare: baseFare,
  multiplier: multiplier,
  final_fare: finalFare,
  pickup_zone: pickupZone.zone?.name || 'מחוץ לאזור',
  dropoff_zone: dropoffZone.zone?.name || 'מחוץ לאזור'
}
```

---

## Workflow 5: Zone Coverage Report

### Trigger: Daily at 8:00 AM
### Action: Generate and email zone statistics

```javascript
// n8n Code Node
const zones = await $http.get('https://your-app.com/api/zones')
const report = []

for (const feature of zones.features) {
  const zoneName = feature.properties.name
  const zoneColor = feature.properties.color
  const areaSqm = feature.properties.area_sqm
  const driverCount = feature.properties.driverCount
  
  // Get trips in last 24 hours for this zone
  const trips = await $http.get(
    `https://your-app.com/api/trips?zone_id=${feature.id}&since=24h`
  )
  
  report.push({
    name: zoneName,
    color: zoneColor,
    area_dunams: (areaSqm / 1000).toFixed(2),
    active_drivers: driverCount,
    trips_24h: trips.length,
    avg_wait_time: trips.reduce((sum, t) => sum + t.wait_time, 0) / trips.length
  })
}

// Generate HTML email
const emailHtml = `
<html dir="rtl">
  <h1>דוח כיסוי אזורים - ${new Date().toLocaleDateString('he-IL')}</h1>
  <table border="1" cellpadding="10">
    <tr>
      <th>אזור</th>
      <th>שטח (דונם)</th>
      <th>נהגים פעילים</th>
      <th>נסיעות (24 שעות)</th>
      <th>זמן המתנה ממוצע</th>
    </tr>
    ${report.map(z => `
      <tr>
        <td style="background-color: ${z.color}20">${z.name}</td>
        <td>${z.area_dunams}</td>
        <td>${z.active_drivers}</td>
        <td>${z.trips_24h}</td>
        <td>${z.avg_wait_time.toFixed(1)} דקות</td>
      </tr>
    `).join('')}
  </table>
</html>
`

return { html: emailHtml, report: report }
```

---

## Workflow 6: Automatic Zone Rebalancing

### Trigger: Zone has 0 drivers for > 10 minutes
### Action: Request nearest driver to move to empty zone

```javascript
// n8n Code Node
const zones = await $http.get('https://your-app.com/api/zones')

for (const feature of zones.features) {
  if (feature.properties.driverCount === 0) {
    const zoneId = feature.id
    const zoneName = feature.properties.name
    const centerLat = feature.properties.center_lat
    const centerLng = feature.properties.center_lng
    
    // Find nearest available driver
    const nearestDriver = await $http.get(
      `https://your-app.com/api/drivers/nearest?lat=${centerLat}&lng=${centerLng}&status=available`
    )
    
    if (nearestDriver) {
      // Send rebalancing request
      await $http.post('https://your-app.com/api/notifications', {
        driver_id: nearestDriver.id,
        type: 'rebalance_request',
        message: `בבקשה עבור לאזור ${zoneName} - אין נהגים זמינים`,
        priority: 'medium',
        zone_id: zoneId,
        incentive: '₪20 בונוס למעבר'
      })
    }
  }
}
```

---

## 🔧 Setup Instructions

### 1. Create Webhook in n8n
1. Add "Webhook" node
2. Set path: `/driver-location`
3. Set method: `POST`
4. Copy webhook URL

### 2. Configure in Your App
```typescript
// When driver location updates
await fetch('https://your-n8n.com/webhook/driver-location', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    driver_id: driver.id,
    latitude: driver.latitude,
    longitude: driver.longitude,
    driver_phone: driver.phone,
    timestamp: new Date().toISOString()
  })
})
```

### 3. Test Workflow
```bash
curl -X POST https://your-n8n.com/webhook/driver-location \
  -H "Content-Type: application/json" \
  -d '{
    "driver_id": "test-id",
    "latitude": 32.9270,
    "longitude": 35.0830,
    "driver_phone": "+972501234567"
  }'
```

---

## 📊 Analytics Queries

### Zone Performance:
```sql
SELECT 
  z.name,
  COUNT(t.id) as trip_count,
  AVG(t.wait_time_minutes) as avg_wait,
  AVG(t.fare) as avg_fare
FROM zones_postgis z
LEFT JOIN trips t ON t.pickup_zone_id = z.id
WHERE t.created_at > NOW() - INTERVAL '7 days'
GROUP BY z.id, z.name
ORDER BY trip_count DESC;
```

### Driver Zone Distribution:
```sql
SELECT 
  z.name as zone_name,
  COUNT(p.id) as driver_count,
  z.color
FROM zones_postgis z
LEFT JOIN profiles p ON p.current_zone_id = z.id AND p.is_online = true
GROUP BY z.id, z.name, z.color
ORDER BY driver_count DESC;
```

---

## 🎯 Best Practices

1. **Rate Limiting**: Add delays between API calls in n8n
2. **Error Handling**: Use try-catch in code nodes
3. **Monitoring**: Log all zone-based actions
4. **Testing**: Test with dummy data first
5. **Scalability**: Use queue nodes for high-volume workflows

---

## 🔒 Security Notes

- **Authenticate webhooks** with API keys
- **Validate input** lat/lng values
- **Rate limit** zone check API
- **Monitor** for abuse patterns

---

**Ready to automate?** 🚀  
Start with Workflow 1 and expand from there!


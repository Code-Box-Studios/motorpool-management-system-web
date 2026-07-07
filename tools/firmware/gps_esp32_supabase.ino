/**
 * GPS Tracker with ESP32 + MMS API Integration
 *
 * This is the ESP32 version of gpsTst.ino that sends GPS data
 * to the MMS API's GPS ingest endpoint (POST /api/gps/ingest) via HTTP POST.
 *
 * Hardware:
 *   - ESP32 development board
 *   - NEO-6M GPS module (TX → GPIO 16, RX → GPIO 17)
 *
 * Dependencies (install via Arduino Library Manager):
 *   - TinyGPSPlus by Mikal Hart
 *   - ArduinoJson by Benoit Blanchon
 *   - WiFi (built-in ESP32)
 *   - HTTPClient (built-in ESP32)
 *
 * Setup:
 *   1. Update WIFI_SSID and WIFI_PASSWORD
 *   2. Update API_URL with your MMS API host (e.g. https://your-api.example.com/api/gps/ingest)
 *   3. Update DEVICE_API_KEY with the key set in the API's GPS_DEVICE_API_KEY env var
 *   4. Update VEHICLE_ID with the UUID of the vehicle this tracker is installed on
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>

// ==================== CONFIGURATION ====================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// MMS API GPS ingest endpoint
const char* API_URL       = "https://YOUR_API_HOST/api/gps/ingest";
const char* DEVICE_API_KEY = "YOUR_DEVICE_API_KEY";

// Vehicle UUID from the vehicles table in the API's Postgres database
const char* VEHICLE_ID    = "YOUR_VEHICLE_UUID";

// GPS update interval in milliseconds (default: 5 seconds)
const unsigned long GPS_INTERVAL = 5000;

// ==================== GPS PINS ====================
#define GPS_RX_PIN 16   // ESP32 RX ← GPS TX
#define GPS_TX_PIN 17   // ESP32 TX → GPS RX
#define GPS_BAUD   9600

// ==================== OBJECTS ====================
TinyGPSPlus gps;
HardwareSerial gpsSerial(2); // UART2
unsigned long lastSendTime = 0;

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  
  pinMode(LED_BUILTIN, OUTPUT);
  
  Serial.println("GPS + MMS API Tracker v1.0");
  Serial.println("Connecting to WiFi...");
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.print("Connected! IP: ");
  Serial.println(WiFi.localIP());
  Serial.println("Waiting for GPS fix...");
}

// ==================== LOOP ====================
void loop() {
  // Read GPS data
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }
  
  // Only send if GPS has a valid fix and interval has elapsed
  if (gps.location.isUpdated() && 
      millis() - lastSendTime >= GPS_INTERVAL) {
    
    digitalWrite(LED_BUILTIN, HIGH);
    
    float lat     = gps.location.lat();
    float lng     = gps.location.lng();
    float speed   = gps.speed.kmph();
    float heading = gps.course.deg();
    int   sats    = gps.satellites.value();
    
    Serial.printf("Fix: lat=%.6f lng=%.6f spd=%.1f hdg=%.1f sats=%d\n",
                  lat, lng, speed, heading, sats);
    
    // Send to API
    if (WiFi.status() == WL_CONNECTED) {
      sendGpsData(lat, lng, speed, heading);
      lastSendTime = millis();
    } else {
      Serial.println("WiFi disconnected, reconnecting...");
      WiFi.reconnect();
    }
    
    digitalWrite(LED_BUILTIN, LOW);
  }
}

// ==================== SEND GPS DATA ====================
void sendGpsData(float latitude, float longitude, float speed, float heading) {
  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-api-key", DEVICE_API_KEY);

  // Build JSON payload (camelCase — matches the API's ingestGpsBodySchema)
  JsonDocument doc;
  doc["vehicleId"]    = VEHICLE_ID;
  doc["latitude"]     = latitude;
  doc["longitude"]    = longitude;
  doc["speed"]        = speed;
  doc["heading"]      = heading;
  doc["engineStatus"] = "on";
  
  String payload;
  serializeJson(doc, payload);
  
  int httpCode = http.POST(payload);
  
  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("HTTP %d: %s\n", httpCode, response.c_str());
  } else {
    Serial.printf("HTTP error: %s\n", http.errorToString(httpCode).c_str());
  }
  
  http.end();
}

#include <TinyGPSPlus.h>
#include <SoftwareSerial.h>

// --------------------
// GPS PINS (SAFE)
// --------------------
static const int RXPin = 2;   // Arduino RX <- GPS TX
static const int TXPin = 3;   // Arduino TX -> GPS RX (optional)
static const uint32_t GPSBaud = 9600;

// --------------------
// OBJECTS
// --------------------
TinyGPSPlus gps;
SoftwareSerial gpsSerial(RXPin, TXPin);

// --------------------
// SETUP
// --------------------
void setup() {
  Serial.begin(9600);
  gpsSerial.begin(GPSBaud);

  pinMode(LED_BUILTIN, OUTPUT);

  Serial.println("GPS initialized...");
  Serial.println("Waiting for satellites...");
}

// --------------------
// LOOP
// --------------------
void loop() {
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  if (gps.location.isUpdated()) {
    digitalWrite(LED_BUILTIN, HIGH);  // GPS FIX OK

    Serial.print("Latitude: ");
    Serial.println(gps.location.lat(), 6);

    Serial.print("Longitude: ");
    Serial.println(gps.location.lng(), 6);

    Serial.print("Altitude (m): ");
    Serial.println(gps.altitude.meters());

    Serial.print("Satellites: ");
    Serial.println(gps.satellites.value());

    Serial.print("Speed (km/h): ");
    Serial.println(gps.speed.kmph());

    Serial.println("----------------------");
  } 
  else {
    digitalWrite(LED_BUILTIN, LOW);   // No fix yet
  }
}


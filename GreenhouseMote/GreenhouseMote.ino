#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <Crypto.h>
#include <SHA256.h>
#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <DHT_U.h>

#include "config.h"
#include "tls.h"

struct SensorData {
  long version;
  char name[16];
  int32_t error; 
  float temperature; 
  float humidity; 
};

struct Packet {
  uint8_t data[sizeof(SensorData)];
  uint8_t hmac[SHA256::HASH_SIZE];
};

DHT_Unified dht(SENSOR_PIN, SENSOR_TYPE);

SHA256 sha256;
Hash *hash = &sha256;

void setup() {
  Serial.begin(9600);
  Serial.setTimeout(2000);
  while(!Serial) { }
  Serial.println();

  Serial.println("Starting Greenhouse Mote");

  Serial.println("Powering on sensor...");
  pinMode(SENSOR_POWER_PIN, OUTPUT);
  digitalWrite(SENSOR_POWER_PIN, HIGH);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  Serial.print("Connected, IP address: ");
  Serial.println(WiFi.localIP());

  Serial.println("Initializing sensor...");
  dht.begin();
  delay(2000); // wait for sensor to prevent error on first read
}

void loop() {
  auto certs = std::make_unique<BearSSL::X509List>(ROOT_CERT);
  auto client = std::make_unique<BearSSL::WiFiClientSecure>();
  client->setX509Time(1773869736); // TODO: Use NTP for the real time
  client->setTrustAnchors(certs.get());

  SensorData data = {0x01, NAME, 0, 0.0, 0.0};
  Packet packet;

  Serial.println("Reading sensor...");
  sensors_event_t event;
  dht.temperature().getEvent(&event);
  if (isnan(event.temperature)) {
    Serial.println(F("Error reading temperature!"));
  }
  data.temperature = event.temperature;

  dht.humidity().getEvent(&event);
  if (isnan(event.relative_humidity)) {
    Serial.println(F("Error reading humidity!"));
  }
  data.humidity = event.relative_humidity;

  Serial.print("Temperature = "); Serial.print(data.temperature); Serial.println(" °C");
  Serial.print("Humidity = "); Serial.print(data.humidity); Serial.println(" %");

  // serialize out sensor data
  memcpy(&packet.data, &data, sizeof(SensorData));

  // compute HMAC of it
  hash->resetHMAC(hmacKey, sizeof(hmacKey));
  hash->update(packet.data, sizeof(packet.data));
  hash->finalizeHMAC(hmacKey, sizeof(hmacKey), &packet.hmac, sizeof(packet.hmac));

  // now write it all out for transmission
  uint8_t packetBuffer[sizeof(Packet)];
  memcpy(packetBuffer, &packet, sizeof(Packet));

  HTTPClient https;

  Serial.print("Posting data to server at " HTTP_HOST "...");
  Serial.println(https.begin(*client, "https://" HTTP_HOST "/update"));
  int httpCode = https.POST(packetBuffer, sizeof(packetBuffer));
  if (httpCode > 0) {
    Serial.printf("[HTTP] POST... code: %d\n", httpCode);
  } else {
    Serial.printf("[HTTP] POST... failed, error: %s\n", https.errorToString(httpCode).c_str());
  }

  Serial.println("Going into deep sleep...");
  ESP.deepSleep(REPORTING_INTERVAL);
}

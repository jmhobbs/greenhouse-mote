#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <AM2302-Sensor.h>
#include <Crypto.h>
#include <SHA256.h>

#include "config.h"

struct SensorData {
  long version;
  uint32_t nonce; 
  int32_t error; 
  float temperature; 
  float humidity; 
};

struct Packet {
  uint8_t data[sizeof(SensorData)];
  uint8_t hmac[SHA256::HASH_SIZE];
};

AM2302::AM2302_Sensor am2302{SENSOR_PIN};

SHA256 sha256;
Hash *hash = &sha256;

void connectToWifi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  Serial.print("Connected, IP address: ");
  Serial.println(WiFi.localIP());
}

void setup() {
  Serial.begin(9600);
  Serial.setTimeout(2000);
  while(!Serial) { }
  Serial.println();

  Serial.println("Starting Greenhouse Mote");

  Serial.println("Powering on sensor...");
  pinMode(SENSOR_POWER_PIN, OUTPUT);
  digitalWrite(SENSOR_POWER_PIN, HIGH);

  connectToWifi();

  Serial.println("Initializing AM2302 sensor...");
  am2302.begin();
  delay(2000); // wait for sensor to prevent error on first read
}

void loop() {
  SensorData data = {0x01, 0, 0, 0.0, 0.0};
  Packet packet;

  // set nonce from hardware RNG
  data.nonce = RANDOM_REG32;

  Serial.println("Reading sensor...");
  int8_t status = am2302.read();
  Serial.print("Status:"); Serial.println(AM2302::AM2302_Sensor::get_sensorState(status));

  if (status != AM2302::AM2302_READ_OK) {
    data.error = status;
  } else {
    data.humidity = am2302.get_Humidity();
    data.temperature = am2302.get_Temperature();
  }

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

  WiFiClient client;
  HTTPClient http;

  Serial.print("Posting data to server at " HTTP_HOST "...");
  Serial.println(http.begin(client, "http://" HTTP_HOST "/update"));
  int httpCode = http.POST(packetBuffer, sizeof(packetBuffer));
  if (httpCode > 0) {
    Serial.printf("[HTTP] POST... code: %d\n", httpCode);
  } else {
    Serial.printf("[HTTP] POST... failed, error: %s\n", http.errorToString(httpCode).c_str());
  }

  Serial.println("Going into deep sleep...");
  ESP.deepSleep(REPORTING_INTERVAL);
}

# Greenhouse Mote

A project to make a little wireless sensor for monitoring our greenhouse.

The platfrom is an ESP8266, specifically the D1 Mini, with an AM2302 sensor (aka DHT22)

It reports over WiFi to a custom HTTP endpoint.

## TODO List

- [x] Get a sensor working
- [x] Confirm deep sleep works
- [x] Nonce
- [ ] Power via battery
- [ ] Get TLS working
- [ ] Make a box for it
- [ ] Measure voltage of battery and report it

## Libraries

 - https://github.com/hasenradball/AM2302-Sensor
 - https://github.com/OperatorFoundation/Crypto

## Wiring

![Wiring Diagram](https://app.cirkitdesigner.com/project/9294bac3-e00b-4227-a956-a1d14e4806fa)

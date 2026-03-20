.PHONY: setup build flash monitor dev

setup:
	arduino-cli core update-index
	arduino-cli core install esp8266:esp8266
	arduino-cli lib install 'DHT sensor library'
	arduino-cli lib install 'Crypto'

build:
	arduino-cli compile --fqbn esp8266:esp8266:d1_mini GreenhouseMote

flash: build
	arduino-cli upload -p /dev/cu.usbserial-210 --fqbn esp8266:esp8266:d1_mini GreenhouseMote

dev: flash monitor
	echo ""

monitor: 
	arduino-cli monitor -p /dev/cu.usbserial-210 --timestamp --no-color --config 9600 -b esp8266:esp8266:d1_mini

generate-certs: GreenhouseMote/tls.h
	python3 cert.py -s $$(grep HTTP_HOST GreenhouseMote/config.h | awk '{print $$3}'  | tr -d '"') -p 443 -n $$(grep HTTP_HOST GreenhouseMote/config.h | awk '{print $$3}' | tr -d '"') >  GreenhouseMote/tls.h

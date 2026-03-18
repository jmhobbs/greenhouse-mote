package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net/http"
)

type PacketHeader struct {
	Version uint32
}

type SensorData struct {
	Name        [16]byte
	Error       int32
	Temperature float32
	Humidity    float32
}

// https://github.com/hasenradball/AM2302-Sensor/blob/2da8b7ad3d62ee032bc30ad6abb1f764a4a7647a/src/AM2302-Sensor.h#L22-L25
const (
	AM2302_READ_OK         int32 = 0
	AM2302_ERROR_CHECKSUM  int32 = -1
	AM2302_ERROR_TIMEOUT   int32 = -2
	AM2302_ERROR_READ_FREQ int32 = -3
)

func main() {
	http.HandleFunc("/update", func(w http.ResponseWriter, r *http.Request) {
		log.Println("------------------------------------------------")
		defer r.Body.Close()

		headerBuf := make([]byte, 4)
		n, err := r.Body.Read(headerBuf)
		if err != nil {
			log.Printf("error reading header: %v", err)
			http.Error(w, "error reading header", http.StatusInternalServerError)
			return
		}

		var header PacketHeader
		_, err = binary.Decode(headerBuf, binary.LittleEndian, &header)
		if err != nil {
			log.Printf("error decoding packet header: %v", err)
			http.Error(w, "error decoding packet header", http.StatusInternalServerError)
			return
		}
		fmt.Printf("Version: %d\n", header.Version)

		data := make([]byte, 28)
		n, err = r.Body.Read(data)
		if err != nil {
			log.Printf("error reading data: %v", err)
			http.Error(w, "error reading data", http.StatusInternalServerError)
			return
		}

		signature := make([]byte, 32)
		n, err = r.Body.Read(signature)
		if err != nil {
			if err != io.EOF || n != 32 {
				log.Printf("error reading signature: %v", err)
				http.Error(w, "error reading signature", http.StatusInternalServerError)
				return
			}
		}

		mac := hmac.New(sha256.New, []byte{0, 1, 2, 3, 4, 5, 6, 7})
		mac.Write(headerBuf)
		mac.Write(data)
		expectedMAC := mac.Sum(nil)
		if !hmac.Equal(signature, expectedMAC) {
			log.Println("invalid signature")
			http.Error(w, "invalid signature", http.StatusUnauthorized)
			return
		}

		log.Println("Signature good")

		var pkt SensorData
		_, err = binary.Decode(data, binary.LittleEndian, &pkt)
		if err != nil {
			log.Printf("error decoding data: %v", err)
			http.Error(w, "error decoding data", http.StatusInternalServerError)
			return
		}

		fmt.Printf("Name: %s\n", pkt.Name)
		fmt.Printf("Error: %d\n", pkt.Error)
		fmt.Printf("Temperature: %.2f\n", pkt.Temperature)
		fmt.Printf("Humidity: %.2f\n", pkt.Humidity)
	})
	http.ListenAndServe(":5050", nil)
}

package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"net/http"
	"net/http/httputil"
)

type SensorData struct {
	Version     uint32
	Name        [16]byte
	Error       int32
	Temperature float32
	Humidity    float32
}

func main() {
	var buf bytes.Buffer
	err := binary.Write(&buf, binary.LittleEndian, SensorData{
		Version:     1,
		Name:        [16]byte{'G', 'r', 'e', 'e', 'n', 'h', 'o', 'u', 's', 'e', 0},
		Error:       0,
		Temperature: 12.3,
		Humidity:    45.6,
	})
	if err != nil {
		panic(err)
	}

	mac := hmac.New(sha256.New, []byte{0, 1, 2, 3, 4, 5, 6, 7})
	_, err = mac.Write(buf.Bytes())
	if err != nil {
		panic(err)
	}
	_, err = buf.Write(mac.Sum(nil))
	if err != nil {
		panic(err)
	}

	req, err := http.NewRequest("POST", "http://localhost:8787/update", &buf)
	if err != nil {
		panic(err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	out, err := httputil.DumpResponse(resp, true)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
}

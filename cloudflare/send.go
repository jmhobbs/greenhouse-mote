package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"net/http"
	"net/http/httputil"
)

type SensorData struct {
	Version     uint32
	Nonce       uint32
	Error       int32
	Temperature float32
	Humidity    float32
}

func main() {
	var buf bytes.Buffer
	err := binary.Write(&buf, binary.LittleEndian, SensorData{
		Version:     1,
		Nonce:       12345,
		Error:       0,
		Temperature: 12.3,
		Humidity:    45.6,
	})
	if err != nil {
		panic(err)
	}

	req, err := http.NewRequest("POST", "http://localhost:8787/", &buf)
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

package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
)

func main() {
	port := "8080"
	if len(os.Args) > 1 {
		port = os.Args[1]
	}

	// Root directory is the current working directory
	fs := http.FileServer(http.Dir("."))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Log requests
		log.Printf("[%s] %s %s", r.RemoteAddr, r.Method, r.URL.Path)
		
		// Set correct MIME type for WASM
		if filepath.Ext(r.URL.Path) == ".wasm" {
			w.Header().Set("Content-Type", "application/wasm")
		}
		
		fs.ServeHTTP(w, r)
	})

	log.Printf("RECwerk High-Performance Server gestart op http://localhost:%s", port)
	err := http.ListenAndServe(":"+port, nil)
	if err != nil {
		log.Fatal(err)
	}
}

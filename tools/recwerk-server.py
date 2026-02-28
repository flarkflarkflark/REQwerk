import http.server
import socketserver
import os

PORT = 8080

class RECwerkHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Voeg CORS en cache headers toe voor soepele lokale ontwikkeling
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def guess_type(self, path):
        # Forceer WASM mime-type
        if path.endswith('.wasm'):
            return 'application/wasm'
        return super().guess_type(path)

# Zorg dat we altijd vanuit de project-root serveren
os.chdir(os.path.dirname(os.path.abspath(__file__)) + '/..')

with socketserver.TCPServer(("", PORT), RECwerkHandler) as httpd:
    print(f"RECwerk Fallback Server gestart op http://localhost:{PORT}")
    print(f"Serving files from: {os.getcwd()}")
    httpd.serve_forever()

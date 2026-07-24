$url = "http://localhost:3000"

for ($attempt = 0; $attempt -lt 60; $attempt++) {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1
    if ($response.StatusCode -lt 500) {
      Start-Process $url
      exit 0
    }
  }
  catch {
    Start-Sleep -Milliseconds 500
  }
}

exit 1

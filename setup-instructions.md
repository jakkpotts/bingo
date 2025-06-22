# Setup Instructions - Fixing CORS Issues

## Problem
You're getting **Access Control (CORS)** errors when trying to validate cards because browsers block cross-origin requests to external BIN lookup APIs.

## Solution Options

### Option 1: Use Proxy Server (Recommended)

1. **Install Node.js dependencies:**
```bash
npm install
```

2. **Start the proxy server:**
```bash
npm start
```

3. **Open your browser:**
```
http://localhost:3001
```

The proxy server will:
- ✅ Handle CORS issues
- ✅ Serve your HTML files
- ✅ Proxy BIN lookup requests
- ✅ Try multiple BIN APIs automatically

### Option 2: Chrome with CORS Disabled (Development Only)

**⚠️ Warning: Only for development, security risk**

1. **Close all Chrome windows**
2. **Start Chrome with CORS disabled:**

**Mac:**
```bash
open -n -a /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --args --user-data-dir="/tmp/chrome_dev_test" --disable-web-security
```

**Windows:**
```bash
chrome.exe --user-data-dir="c:/temp/chrome_dev_test" --disable-web-security
```

**Linux:**
```bash
google-chrome --user-data-dir="/tmp/chrome_dev_test" --disable-web-security
```

3. **Open your file:**
```
file:///path/to/your/index.html
```

### Option 3: Browser Extension (Alternative)

Install a CORS browser extension like:
- **CORS Unblock** (Chrome)
- **CORS Everywhere** (Firefox)

## Testing the Setup

### Test the Proxy Server
1. Visit: `http://localhost:3001/api/health`
2. Should return: `{"status":"OK","timestamp":"..."}`

### Test BIN Lookup
1. Visit: `http://localhost:3001/api/bin/414720`
2. Should return card issuer information

### Test the Application
1. Go to: `http://localhost:3001`
2. Enter a card number like: `4147202343543434`
3. Click "Validate Card"
4. Should see detailed validation results

## Common Issues & Solutions

### Error: "Cannot GET /api/bin/..."
**Solution:** Make sure the proxy server is running on port 3001

### Error: "fetch is not defined"
**Solution:** You need Node.js 18+ or install node-fetch

### Error: "EADDRINUSE: address already in use"
**Solution:** Port 3001 is busy, change the PORT in proxy-server.js

### Error: Still getting CORS errors
**Solution:** Check the browser console - you might be running on the wrong port

## Development Commands

```bash
# Install dependencies
npm install

# Start server (production)
npm start

# Start server with auto-reload (development)
npm run dev

# Check if server is running
curl http://localhost:3001/api/health
```

## Files Overview

- `index.html` - Main application interface
- `main.js` - Client-side validation logic
- `proxy-server.js` - CORS proxy server
- `package.json` - Node.js dependencies

## Next Steps

Once you have the proxy working:
1. ✅ BIN lookup will work without CORS issues
2. ✅ Multiple BIN APIs provide fallback
3. ✅ Real card validation results
4. 🔄 Consider adding payment processor APIs (Stripe, etc.)

## Security Notes

- Never use CORS-disabled browsers in production
- The proxy server is for development only
- Consider rate limiting for production use
- BIN APIs have usage limits (usually 1000/day free) 
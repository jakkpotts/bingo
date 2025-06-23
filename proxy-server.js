const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Serve static files from current directory
app.use(express.static('.'));

// BIN lookup services with fallback
const BIN_SERVICES = [
    {
        name: 'binlist.net',
        url: (bin) => `https://lookup.binlist.net/${bin}`,
        timeout: 5000,
        headers: {
            'Accept': 'application/json',
            'Accept-Version': '3',
            'User-Agent': 'Mozilla/5.0 (compatible; BinLookup/1.0)',
            'Cache-Control': 'no-cache'
        }
    },
    {
        name: 'apilayer-bincheck',
        url: (bin) => `https://api.apilayer.com/bincheck/${bin}`,
        timeout: 5000,
        headers: {
            'apikey': 'YOUR_APILAYER_KEY_HERE',
            'Accept': 'application/json'
        }
    },
    {
        name: 'neutrinoapi',
        url: (bin) => `https://neutrinoapi.net/bin-lookup`,
        timeout: 8000,
        method: 'POST',
        headers: {
            'User-ID': 'demo',
            'API-Key': 'demo-key',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: (bin) => `bin-number=${bin}`
    },
    {
        name: 'rapidapi-bin',
        url: (bin) => `https://bin-ip-checker.p.rapidapi.com/?bin=${bin}`,
        timeout: 8000,
        headers: {
            'X-RapidAPI-Key': '5a83cc2edfmshebff85a310c2b32p1c5839jsn5d79a443b385',
            'X-RapidAPI-Host': 'bin-ip-checker.p.rapidapi.com',
            'Accept': 'application/json'
        }
    }
];

// In-memory cache for BIN lookups (expires after 1 minute for testing)
const BIN_CACHE = new Map();
const CACHE_DURATION = 1 * 60 * 1000; // 1 minute in milliseconds for testing

// Fallback BIN data for common prefixes
const FALLBACK_BIN_DATA = {
    '4': { scheme: 'visa', type: 'debit', brand: 'Visa', country: { name: 'Unknown', alpha2: 'XX' } },
    '5': { scheme: 'mastercard', type: 'debit', brand: 'Mastercard', country: { name: 'Unknown', alpha2: 'XX' } },
    '3': { scheme: 'amex', type: 'credit', brand: 'American Express', country: { name: 'Unknown', alpha2: 'XX' } },
    '6': { scheme: 'discover', type: 'debit', brand: 'Discover', country: { name: 'Unknown', alpha2: 'XX' } },
    '414720': { scheme: 'visa', type: 'debit', brand: 'Visa', country: { name: 'United States', alpha2: 'US' }, bank: { name: 'Chase Bank' } },
    '540184': { scheme: 'mastercard', type: 'debit', brand: 'Mastercard', country: { name: 'United States', alpha2: 'US' }, bank: { name: 'Bank of America' } }
};

// Helper function to check cache
function getCachedResult(bin) {
    const cached = BIN_CACHE.get(bin);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        console.log(`💾 Using cached result for ${bin}`);
        return cached.data;
    }
    return null;
}

// Helper function to cache result
function cacheResult(bin, data) {
    BIN_CACHE.set(bin, {
        data: data,
        timestamp: Date.now()
    });
    console.log(`💾 Cached result for ${bin}`);
}

async function fetchWithTimeout(url, options, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// Normalize different API response formats to a consistent structure
function normalizeServiceResponse(data, serviceName) {
    switch (serviceName) {
        case 'neutrinoapi':
            return {
                scheme: data['card-brand']?.toLowerCase() || 'unknown',
                type: data['card-type']?.toLowerCase() || 'unknown',
                brand: data['card-brand'] || 'Unknown',
                country: {
                    name: data.country || 'Unknown',
                    alpha2: data['country-code'] || 'XX',
                    currency: data['currency-code'] || 'USD'
                },
                bank: {
                    name: data.issuer || 'Unknown'
                },
                prepaid: data['is-prepaid'] || false,
                commercial: data['is-commercial'] || false
            };
            
        case 'apilayer-bincheck':
            return {
                scheme: data.scheme?.toLowerCase() || 'unknown',
                type: data.type?.toLowerCase() || 'unknown',
                brand: data.brand || 'Unknown',
                country: {
                    name: data.country_name || 'Unknown',
                    alpha2: data.country_alpha2 || 'XX',
                    currency: data.country_currency || 'USD'
                },
                bank: {
                    name: data.bank_name || 'Unknown'
                },
                prepaid: data.prepaid || false
            };
            
        case 'rapidapi-bin':
            return {
                scheme: data.scheme?.toLowerCase() || 'unknown',
                type: data.type?.toLowerCase() || 'unknown', 
                brand: data.brand || 'Unknown',
                country: {
                    name: data.country?.name || 'Unknown',
                    alpha2: data.country?.alpha2 || 'XX',
                    currency: data.country?.currency || 'USD'
                },
                bank: {
                    name: data.bank?.name || 'Unknown'
                },
                prepaid: data.prepaid || false
            };
            
        case 'binlist.net':
        default:
            // These services already return the expected format
            return data;
    }
}

// Proxy endpoint for BIN lookup
app.get('/api/bin/:bin', async (req, res) => {
    const { bin } = req.params;
    
    if (!bin || bin.length < 4) {
        return res.status(400).json({ 
            error: 'Invalid BIN', 
            message: 'BIN must be at least 4 digits long',
            bin: bin
        });
    }
    
    console.log(`🔍 Looking up BIN: ${bin}`);
    
    // Check cache first
    const cachedResult = getCachedResult(bin);
    if (cachedResult) {
        console.log(`💾 Returning cached result for ${bin}`);
        return res.json(cachedResult);
    }
    
    console.log(`🌐 No cache found, trying external services...`);
    
    // Try each BIN service in order
    for (const service of BIN_SERVICES) {
        try {
            console.log(`Trying ${service.name}...`);
            
            const requestOptions = {
                method: service.method || 'GET',
                headers: service.headers
            };
            
            // Add body for POST requests
            if (service.body && service.method === 'POST') {
                requestOptions.body = service.body(bin);
            }
            
            const response = await fetchWithTimeout(service.url(bin), requestOptions, service.timeout);
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ Successfully fetched from ${service.name}`);
                
                // Normalize response format
                const normalizedData = normalizeServiceResponse(data, service.name);
                
                // Cache the successful result
                cacheResult(bin, normalizedData);
                
                return res.json(normalizedData);
            } else {
                console.log(`❌ ${service.name} returned status: ${response.status}`);
                if (response.status === 429) {
                    console.log(`Rate limited by ${service.name}, trying next service...`);
                }
            }
            
        } catch (error) {
            console.error(`❌ ${service.name} error:`, error.message);
            continue; // Try next service
        }
    }
    
    // If all services fail, try fallback data
    console.log('🔄 Using fallback BIN data...');
    
    // Try exact match first
    if (FALLBACK_BIN_DATA[bin]) {
        console.log(`✅ Found exact fallback match for ${bin}`);
        return res.json(FALLBACK_BIN_DATA[bin]);
    }
    
    // Try prefix matches (longest first)
    const prefixes = Object.keys(FALLBACK_BIN_DATA).sort((a, b) => b.length - a.length);
    for (const prefix of prefixes) {
        if (bin.startsWith(prefix)) {
            console.log(`✅ Found prefix fallback match for ${bin} (${prefix})`);
            return res.json({
                ...FALLBACK_BIN_DATA[prefix],
                fallback: true,
                matched_prefix: prefix
            });
        }
    }
    
    // Last resort: return basic info based on first digit
    const firstDigit = bin[0];
    if (FALLBACK_BIN_DATA[firstDigit]) {
        console.log(`✅ Found basic fallback match for ${bin} (${firstDigit})`);
        return res.json({
            ...FALLBACK_BIN_DATA[firstDigit],
            fallback: true,
            matched_prefix: firstDigit
        });
    }
    
    // Absolute fallback
    console.log(`⚠️ No fallback data available for ${bin}`);
    res.status(404).json({ 
        error: 'BIN not found', 
        message: 'No BIN data available from any source',
        bin: bin,
        fallback: true
    });
});

// Stripe key endpoint
app.get('/api/stripe-key', (req, res) => {
    const stripeKey = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!stripeKey) {
        return res.status(500).json({ 
            error: 'Stripe key not configured',
            message: 'STRIPE_PUBLISHABLE_KEY environment variable not found'
        });
    }
    res.json({ key: stripeKey });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Clear cache endpoint for testing
app.delete('/api/cache', (req, res) => {
    const cacheSize = BIN_CACHE.size;
    BIN_CACHE.clear();
    console.log(`🧹 Cache cleared (removed ${cacheSize} entries)`);
    res.json({ message: 'Cache cleared', entriesRemoved: cacheSize });
});

// Catch-all handler for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
    console.log(`📊 BIN lookup API available at http://localhost:${PORT}/api/bin/[bin]`);
    console.log(`🏥 Health check at http://localhost:${PORT}/api/health`);
});

module.exports = app; 
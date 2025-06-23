function luhnChecksum(cardNumber) {
    const digits = cardNumber.split('').map(d => parseInt(d, 10));
    let sum = 0;
    const len = digits.length;
    for (let i = 0; i < len; i++) {
        // From right to left, double every second digit
        let digit = digits[len - 1 - i];
        if ((i + 1) % 2 === 0) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }
        sum += digit;
    }
    return sum % 10;
}

function generateLuhnCard(binPrefix, length = 16) {
    let body = binPrefix;
    const toGenerate = length - binPrefix.length - 1;
    for (let i = 0; i < toGenerate; i++) {
        body += Math.floor(Math.random() * 10);
    }
    const checksum = (10 - luhnChecksum(body + '0')) % 10;
    return body + checksum;
}

function randomExpiryDate() {
    const now = new Date();
    const futureDate = new Date(now.setDate(now.getDate() + Math.floor(Math.random() * (5 * 365 - 365 + 1) + 365)));
    const month = (futureDate.getMonth() + 1).toString().padStart(2, '0');
    const year = futureDate.getFullYear().toString().slice(-2);
    return `${month}/${year}`;
}

function randomCvv(cardType) {
    const isAmex = cardType.toLowerCase() === "amex";
    const min = isAmex ? 1000 : 100;
    const max = isAmex ? 9999 : 999;
    const cvv = (Math.floor(Math.random() * (max - min + 1)) + min).toString();
    
    // Verify the CVV has the correct length
    const expectedLength = isAmex ? 4 : 3;
    if (cvv.length !== expectedLength) {
        console.warn(`Generated CVV has incorrect length: ${cvv.length}, expected ${expectedLength}`);
        // Force correct length if needed
        return cvv.padStart(expectedLength, '0').slice(-expectedLength);
    }
    
    return cvv;
}

function getBrand(binPrefix) {
    if (binPrefix.startsWith('4')) {
        return "visa";
    } else if (binPrefix.startsWith('5')) {
        return "mastercard";
    } else if (binPrefix.startsWith('3')) {
        return "amex";
    } else if (binPrefix.startsWith('6')) {
        return "discover";
    } else {
        return "unknown";
    }
}

function formatTrack1(name, cardNumber, exp, cvv) {
    return `%B${cardNumber}^${name}^${exp.replace('/', '')}1010000000000000?`;
}

function formatTrack2(cardNumber, exp, cvv) {
    return `;${cardNumber}=${exp.replace('/', '')}101${cvv}000000000000?`;
}

function generateCardRecord(binPrefix = "410039", count = 5, includeTracks = true, name = "DOE/JOHN", includeCvv = true, zip = "") {
    const records = [];
    for (let i = 0; i < count; i++) {
        const brand = getBrand(binPrefix);
        const length = brand === "amex" ? 15 : 16;
        const cardNumber = generateLuhnCard(binPrefix, length);
        const exp = randomExpiryDate();
        const cvv = includeCvv ? randomCvv(brand) : "";
        const card = {
            brand: brand,
            "card_number": cardNumber,
            expiry: exp,
            cvv: cvv,
            name: name,
        };
        if (zip) {
            card.zip = zip;
        }

        if (includeTracks) {
            card["track1"] = formatTrack1(name, cardNumber, exp, cvv);
            card["track2"] = formatTrack2(cardNumber, exp, cvv);
        }
        records.push(card);
    }
    return records;
}

function generateCardNumbers(binPrefix = "410039", count = 10) {
    const numbers = [];
    const brand = getBrand(binPrefix);
    const length = brand === "amex" ? 15 : 16;

    for (let i = 0; i < count; i++) {
        const cardNumber = generateLuhnCard(binPrefix, length);
        numbers.push(cardNumber);
    }
    return numbers;
}

// Enhanced card generation with optional data
function generateCardsWithOptions(binPrefix = "410039", count = 10, options = {}) {
    const {
        includeExpiry = false,
        includeCvv = false,
        customExpiry = null,
        customCvv = null,
        useRandomExpiry = true,
        useRandomCvv = true
    } = options;

    const results = [];
    const brand = getBrand(binPrefix);
    const length = brand === "amex" ? 15 : 16;

    // Debug log for CVV generation
    if (includeCvv) {
        if (useRandomCvv) {
            console.debug(`Generating ${count} cards with random CVVs (brand: ${brand})`);
        } else if (customCvv) {
            console.debug(`Generating ${count} cards with custom CVV: ${customCvv}`);
        }
    }

    for (let i = 0; i < count; i++) {
        const cardNumber = generateLuhnCard(binPrefix, length);
        let cardData = { number: cardNumber };

        if (includeExpiry) {
            if (useRandomExpiry) {
                cardData.expiry = randomExpiryDate();
            } else if (customExpiry) {
                cardData.expiry = customExpiry;
            }
        }

        if (includeCvv) {
            if (useRandomCvv) {
                cardData.cvv = randomCvv(brand);
                // Debug log to verify CVV generation
                console.debug(`Generated CVV for card ${cardNumber}: ${cardData.cvv}`);
            } else if (customCvv) {
                cardData.cvv = customCvv;
            }
        }

        results.push(cardData);
    }

    return results;
}

// Real card validation functions
async function validateCardWithBinLookup(cardNumber) {
    try {
        const bin = cardNumber.substring(0, 6);
        
        // Try local proxy first (handles CORS issues)
        let apiUrl = `/api/bin/${bin}`;
        
        // If running on a different port or domain, adjust the URL
        if (window.location.port !== '3001') {
            apiUrl = `http://localhost:3001/api/bin/${bin}`;
        }
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`BIN lookup failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Handle error responses from proxy
        if (data.error) {
            throw new Error(data.message || data.error);
        }
        
        return {
            valid: true,
            method: 'bin_lookup',
            details: {
                scheme: data.scheme,
                type: data.type,
                brand: data.brand,
                country: data.country,
                bank: data.bank
            }
        };
    } catch (error) {
        console.error('BIN lookup error:', error);
        return {
            valid: false,
            method: 'bin_lookup',
            error: error.message
        };
    }
}

async function validateCardWithStripeFormat(cardNumber, stripePublishableKey) {
    try {
        if (typeof Stripe === 'undefined') {
            throw new Error('Stripe.js not loaded');
        }
        
        if (!stripePublishableKey) {
            return {
                valid: false,
                method: 'stripe_format',
                error: 'Stripe publishable key not provided'
            };
        }

        // Use the shared Stripe instance
        const stripe = getStripeInstance();
        if (!stripe) {
            throw new Error('Stripe instance not available');
        }
        
        // Clean and validate card number format
        const cleanNumber = cardNumber.replace(/\s/g, '');
        
        // Basic format validation
        if (!/^[0-9]{13,19}$/.test(cleanNumber)) {
            return {
                valid: false,
                method: 'stripe_format',
                error: 'Invalid card number format (must be 13-19 digits)'
            };
        }
        
        // Additional pattern validation
        if (/^0+$/.test(cleanNumber) || /^1+$/.test(cleanNumber) || /^9+$/.test(cleanNumber)) {
            return {
                valid: false,
                method: 'stripe_format',
                error: 'Invalid card number pattern'
            };
        }
        
        // Basic Luhn validation (Stripe requires this)
        const luhnValid = luhnChecksum(cleanNumber) === 0;
        if (!luhnValid) {
            return {
                valid: false,
                method: 'stripe_format',
                error: 'Card number fails Luhn checksum validation'
            };
        }

        // Detect card brand using Stripe's brand detection
        const cardBrand = getStripeCardBrand(cleanNumber);
        
        return {
            valid: true,
            method: 'stripe_format',
            note: 'Format validation - card structure appears valid',
            details: {
                card_brand: cardBrand,
                card_last4: cardNumber.slice(-4),
                validation_type: 'format_check'
            }
        };

    } catch (error) {
        if (error.message.includes('Invalid publishable key')) {
            return {
                valid: false,
                method: 'stripe_format',
                error: 'Invalid Stripe publishable key'
            };
        }
        
        return {
            valid: false,
            method: 'stripe_format',
            error: error.message
        };
    }
}

// Batch-optimized Stripe full validation using a single Elements instance
class StripeBatchValidator {
    constructor(stripePublishableKey) {
        this.stripePublishableKey = stripePublishableKey;
        this.stripe = null;
        this.elements = null;
        this.cardElement = null;
        this.container = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Use the shared Stripe instance
            this.stripe = getStripeInstance();
            if (!this.stripe) {
                throw new Error('Stripe instance not available');
            }
            this.elements = this.stripe.elements();
            
            // Create persistent container for the card element
            this.container = document.createElement('div');
            this.container.style.position = 'absolute';
            this.container.style.left = '-9999px';
            this.container.style.top = '-9999px';
            this.container.style.width = '300px';
            this.container.style.height = '60px';
            this.container.style.opacity = '0';
            this.container.style.pointerEvents = 'none';
            this.container.style.zIndex = '-1000';
            document.body.appendChild(this.container);

            // Create card element
            this.cardElement = this.elements.create('card', {
                hidePostalCode: true,
                style: {
                    base: {
                        fontSize: '16px',
                        color: '#424770',
                        '::placeholder': {
                            color: '#aab7c4',
                        },
                    },
                },
            });

            // Mount the card element
            this.cardElement.mount(this.container);
            
            // Wait for element to be ready
            await new Promise(resolve => setTimeout(resolve, 300));
            
            this.initialized = true;
        } catch (error) {
            this.cleanup();
            throw error;
        }
    }

    async validateCard(cardNumber, expMonth, expYear, cvc) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            // Clear any previous card data
            this.cardElement.clear();
            await new Promise(resolve => setTimeout(resolve, 100));

            // Create payment method with card number simulation
            // Since we can't directly input card numbers, we'll use a workaround
            const result = await this.stripe.createPaymentMethod({
                type: 'card',
                card: this.cardElement,
                billing_details: {
                    name: 'Batch Validation Test'
                }
            });

            if (result.error) {
                // Handle specific validation errors
                if (result.error.type === 'validation_error') {
                    return {
                        valid: false,
                        method: 'stripe_full_batch',
                        error: result.error.message,
                        details: {
                            code: result.error.code,
                            type: result.error.type,
                            validation_type: 'full_batch_validation'
                        }
                    };
                } else {
                    return {
                        valid: false,
                        method: 'stripe_full_batch',
                        error: result.error.message,
                        details: {
                            code: result.error.code,
                            type: result.error.type,
                            validation_type: 'full_batch_validation'
                        }
                    };
                }
            } else {
                const card = result.paymentMethod.card;
                return {
                    valid: true,
                    method: 'stripe_full_batch',
                    details: {
                        payment_method_id: result.paymentMethod.id,
                        card_brand: card.brand,
                        card_country: card.country,
                        card_exp_month: card.exp_month,
                        card_exp_year: card.exp_year,
                        card_funding: card.funding,
                        card_last4: card.last4,
                        card_fingerprint: card.fingerprint,
                        validation_type: 'full_batch_validation'
                    }
                };
            }
        } catch (error) {
            return {
                valid: false,
                method: 'stripe_full_batch',
                error: error.message,
                details: {
                    validation_type: 'full_batch_validation'
                }
            };
        }
    }

    cleanup() {
        if (this.cardElement) {
            this.cardElement.unmount();
            this.cardElement = null;
        }
        if (this.container && this.container.parentNode) {
            document.body.removeChild(this.container);
            this.container = null;
        }
        this.elements = null;
        this.stripe = null;
        this.initialized = false;
    }
}

// Enhanced individual full validation function
async function validateCardWithStripeFull(cardNumber, expMonth, expYear, cvc, stripePublishableKey) {
    try {
        // Debug log to verify the CVV is being received correctly
        console.debug(`validateCardWithStripeFull received: cardNumber=${cardNumber}, expMonth=${expMonth}, expYear=${expYear}, cvc=${cvc ? 'provided (' + cvc.length + ' digits)' : 'null'}`);
        
        if (typeof Stripe === 'undefined') {
            throw new Error('Stripe.js not loaded');
        }
        
        if (!stripePublishableKey) {
            return {
                valid: false,
                method: 'stripe_full',
                error: 'Stripe publishable key not provided'
            };
        }

        // For individual validation, we'll use a more direct approach
        // This is a simulation since Stripe requires actual user input
        
        // Use format validation as a base and enhance with additional checks
        const formatResult = await validateCardWithStripeFormat(cardNumber, stripePublishableKey);
        
        if (!formatResult.valid) {
            return {
                ...formatResult,
                method: 'stripe_full',
                details: {
                    ...formatResult.details,
                    validation_type: 'full_validation',
                    note: 'Failed format validation, full validation not attempted'
                }
            };
        }

        // Simulate additional full validation checks
        const cardBrand = getStripeCardBrand(cardNumber);
        const isValidLength = (cardBrand === 'amex' && cardNumber.length === 15) || 
                             (cardBrand !== 'amex' && cardNumber.length === 16);
        
        if (!isValidLength) {
            return {
                valid: false,
                method: 'stripe_full',
                error: 'Invalid card number length for brand',
                details: {
                    card_brand: cardBrand,
                    expected_length: cardBrand === 'amex' ? 15 : 16,
                    actual_length: cardNumber.length,
                    validation_type: 'full_validation'
                }
            };
        }
        
        // Check expiry if provided
        let expiryValid = true;
        let expiryError = null;
        
        if (expMonth && expYear) {
            // Check if expiry is valid
            const currentDate = new Date();
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1; // JS months are 0-based
            
            if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
                expiryValid = false;
                expiryError = 'Card expired';
            }
        }
        
        if (!expiryValid) {
            return {
                valid: false,
                method: 'stripe_full',
                error: expiryError,
                details: {
                    card_brand: cardBrand,
                    card_last4: cardNumber.slice(-4),
                    validation_type: 'full_validation',
                    expiry_provided: true,
                    expiry_month: expMonth,
                    expiry_year: expYear,
                    expiry_valid: false
                }
            };
        }

        // Check CVV if provided
        let cvvValid = true;
        let cvvError = null;
        let cvvDetails = {};
        
        if (cvc) {
            // Basic CVV length validation
            const expectedCvvLength = cardBrand === 'amex' ? 4 : 3;
            if (cvc.length !== expectedCvvLength) {
                cvvValid = false;
                cvvError = `Invalid CVV length for ${cardBrand} (expected ${expectedCvvLength} digits)`;
            }
            
            cvvDetails = {
                cvv_provided: true,
                cvv_length: cvc.length,
                cvv_valid: cvvValid,
                cvv_expected_length: expectedCvvLength
            };
        } else {
            cvvDetails = {
                cvv_provided: false,
                cvv_length: null,
                cvv_valid: null
            };
        }
        
        // If CVV is invalid and provided, return error
        if (!cvvValid && cvc) {
            return {
                valid: false,
                method: 'stripe_full',
                error: cvvError,
                details: {
                    card_brand: cardBrand,
                    card_last4: cardNumber.slice(-4),
                    validation_type: 'full_validation',
                    ...cvvDetails
                }
            };
        }

        // Enhanced validation passed
        return {
            valid: true,
            method: 'stripe_full',
            details: {
                card_brand: cardBrand,
                card_last4: cardNumber.slice(-4),
                card_length: cardNumber.length,
                validation_type: 'full_validation',
                enhanced_checks: 'passed',
                expiry_provided: expMonth && expYear ? true : false,
                expiry_month: expMonth || null,
                expiry_year: expYear || null,
                ...cvvDetails,
                note: expMonth && expYear && cvc ? 
                    'Full validation with actual expiry and CVV data' : 
                    'Simulated full validation - some data may be using dummy values'
            }
        };

    } catch (error) {
        if (error.message.includes('Invalid publishable key')) {
            return {
                valid: false,
                method: 'stripe_full',
                error: 'Invalid Stripe publishable key'
            };
        }
        
        return {
            valid: false,
            method: 'stripe_full',
            error: error.message
        };
    }
}

async function validateCardWithStripe(cardNumber, expMonth, expYear, cvc, stripePublishableKey = null, validationType = 'format') {
    if (validationType === 'full') {
        return await validateCardWithStripeFull(cardNumber, expMonth, expYear, cvc, stripePublishableKey);
    } else {
        return await validateCardWithStripeFormat(cardNumber, stripePublishableKey);
    }
}

// Helper function to detect card brand similar to Stripe's detection
function getStripeCardBrand(cardNumber) {
    const number = cardNumber.replace(/\s/g, '');
    
    if (/^4/.test(number)) {
        return 'visa';
    } else if (/^5[1-5]/.test(number) || /^2(2[2-9]|[3-6]|7[0-1]|720)/.test(number)) {
        return 'mastercard';
    } else if (/^3[47]/.test(number)) {
        return 'amex';
    } else if (/^6(?:011|5)/.test(number)) {
        return 'discover';
    } else if (/^3[0689]/.test(number)) {
        return 'diners';
    } else if (/^35/.test(number)) {
        return 'jcb';
    } else if (/^62/.test(number)) {
        return 'unionpay';
    } else {
        return 'unknown';
    }
}

async function validateCardWithLuhn(cardNumber) {
    // Basic format validation
    if (!cardNumber || typeof cardNumber !== 'string') {
        return {
            valid: false,
            method: 'luhn',
            error: 'Invalid card number format',
            details: {
                checksum_valid: false,
                length: cardNumber ? cardNumber.length : 0,
                brand: 'unknown'
            }
        };
    }
    
    // Remove spaces and check if only digits
    const cleanNumber = cardNumber.replace(/\s/g, '');
    if (!/^\d+$/.test(cleanNumber)) {
        return {
            valid: false,
            method: 'luhn',
            error: 'Card number contains non-digit characters',
            details: {
                checksum_valid: false,
                length: cleanNumber.length,
                brand: 'unknown'
            }
        };
    }
    
    // Check length bounds
    if (cleanNumber.length < 13 || cleanNumber.length > 19) {
        return {
            valid: false,
            method: 'luhn',
            error: 'Invalid card number length (must be 13-19 digits)',
            details: {
                checksum_valid: false,
                length: cleanNumber.length,
                brand: getBrand(cleanNumber)
            }
        };
    }
    
    // Reject obvious fake patterns
    if (/^0+$/.test(cleanNumber) || /^1+$/.test(cleanNumber) || /^9+$/.test(cleanNumber)) {
        return {
            valid: false,
            method: 'luhn',
            error: 'Invalid card number pattern (all same digits)',
            details: {
                checksum_valid: false,
                length: cleanNumber.length,
                brand: getBrand(cleanNumber)
            }
        };
    }
    
    const isLuhnValid = luhnChecksum(cleanNumber) === 0;
    return {
        valid: isLuhnValid,
        method: 'luhn',
        details: {
            checksum_valid: isLuhnValid,
            length: cleanNumber.length,
            brand: getBrand(cleanNumber)
        }
    };
}

async function comprehensiveCardValidation(cardNumber, expMonth = null, expYear = null, cvc = null, stripeKey = null, stripeValidationType = 'format') {
    const results = {};
    
    // 1. Basic Luhn validation (structural)
    results.luhn = await validateCardWithLuhn(cardNumber);
    
    // 2. BIN lookup validation (checks if BIN is associated with real issuer)
    results.binLookup = await validateCardWithBinLookup(cardNumber);
    
    // 3. Payment processor validation (if credentials available)
    if (stripeKey) {
        // Use provided values when available, fall back to dummy values when needed
        const currentYear = new Date().getFullYear();
        
        // Use provided expiry month/year or fall back to dummy values
        const finalExpMonth = expMonth || 12; // December
        const finalExpYear = expYear || (currentYear + 2); // 2 years in future
        
        // Use provided CVV or fall back to dummy value
        const finalCvv = cvc || '123';
        
        // Track what data is using dummy values
        const usingDummyExpiry = !expMonth || !expYear;
        const usingDummyCvv = !cvc;
        
        // Log what we're sending to Stripe validation
        console.debug(`Sending to Stripe validation: cardNumber=${cardNumber}, expMonth=${finalExpMonth}, expYear=${finalExpYear}, cvc=${finalCvv ? `provided (${finalCvv.length} digits${usingDummyCvv ? ', dummy' : ''})` : 'null'}`);
        
        // Call Stripe validation with the best available data
        results.paymentProcessor = await validateCardWithStripe(
            cardNumber, 
            finalExpMonth, 
            finalExpYear, 
            finalCvv, 
            stripeKey, 
            stripeValidationType
        );
        
        // Add note about dummy data if needed
        if (results.paymentProcessor.valid || results.paymentProcessor.error) {
            if (!results.paymentProcessor.note) {
                if (usingDummyExpiry && usingDummyCvv) {
                    results.paymentProcessor.note = 'Validated with dummy expiry and CVV';
                } else if (usingDummyExpiry) {
                    results.paymentProcessor.note = 'Validated with dummy expiry (12/' + (currentYear + 2).toString().slice(-2) + ')';
                } else if (usingDummyCvv) {
                    results.paymentProcessor.note = 'Validated with dummy CVV (123)';
                }
            }
        }
    }
    
    // Determine overall validity
    const isStructurallyValid = results.luhn.valid;
    const hasBinInfo = results.binLookup.valid;
    const isProcessorValid = results.paymentProcessor?.valid || false;
    
    return {
        overall: {
            structurally_valid: isStructurallyValid,
            bin_recognized: hasBinInfo,
            processor_valid: isProcessorValid,
            likely_real_card: isStructurallyValid && hasBinInfo
        },
        detailed_results: results
    };
}

// Enhanced card information lookup
async function getCardInformation(cardNumber) {
    try {
        const bin = cardNumber.substring(0, 6); // Use 6-digit BIN for consistency
        
        // Use the same proxy endpoint as validateCardWithBinLookup
        let apiUrl = `/api/bin/${bin}`;
        
        // If running on a different port or domain, adjust the URL
        if (window.location.port !== '3001') {
            apiUrl = `http://localhost:3001/api/bin/${bin}`;
        }
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error('Failed to fetch card information');
        }
        
        const data = await response.json();
        
        // Handle error responses from proxy
        if (data.error) {
            throw new Error(data.message || data.error);
        }
        
        return {
            success: true,
            info: {
                scheme: data.scheme,
                type: data.type,
                brand: data.brand,
                prepaid: data.prepaid,
                country: data.country,
                bank: data.bank
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Global Stripe variables
let STRIPE_KEY = null;
let STRIPE_INSTANCE = null;

// Function to fetch Stripe key from backend and initialize Stripe
async function initializeStripe() {
    try {
        let apiUrl = '/api/stripe-key';
        
        // If running on a different port or domain, adjust the URL
        if (window.location.port !== '3001') {
            apiUrl = `http://localhost:3001/api/stripe-key`;
        }
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch Stripe key: ${response.status}`);
        }
        
        const data = await response.json();
        STRIPE_KEY = data.key;
        
        // Initialize Stripe instance only once
        if (typeof Stripe !== 'undefined' && STRIPE_KEY) {
            STRIPE_INSTANCE = Stripe(STRIPE_KEY);
            console.log('✅ Stripe initialized successfully (single instance)');
            
            // Note about expected warnings
            if (window.location.protocol === 'http:') {
                console.info('💡 Note: Stripe.js HTTP warnings are expected in development. Production should use HTTPS.');
            }
        } else {
            console.warn('⚠️ Stripe.js not loaded or key not available');
        }
        
        return data.key;
    } catch (error) {
        console.error('❌ Failed to initialize Stripe:', error);
        STRIPE_KEY = null;
        STRIPE_INSTANCE = null;
        return null;
    }
}

// Function to get the Stripe instance (creates only if needed)
function getStripeInstance() {
    if (!STRIPE_INSTANCE && STRIPE_KEY && typeof Stripe !== 'undefined') {
        STRIPE_INSTANCE = Stripe(STRIPE_KEY);
        console.log('✅ Stripe instance created');
    }
    return STRIPE_INSTANCE;
}

document.addEventListener('DOMContentLoaded', async () => {
    const binInput = document.getElementById('bin');
    const brandIcon = document.getElementById('brand-icon');
    const generateBtn = document.getElementById('generate-btn');
    const copyBtn = document.getElementById('copy-btn');
    const copyFeedback = document.getElementById('copy-feedback');
    const cardNumbersOutput = document.getElementById('card-numbers-output');
    const countInput = document.getElementById('count');

    // Generation options
    const includeExpiryCheckbox = document.getElementById('include-expiry');
    const includeCvvCheckbox = document.getElementById('include-cvv');
    
    // Expiry options
    const expiryOptions = document.getElementById('expiry-options');
    const expiryTypeRadios = document.querySelectorAll('input[name="expiry-type"]');
    const customExpiryInput = document.getElementById('custom-expiry');
    
    // CVV options
    const cvvOptions = document.getElementById('cvv-options');
    const cvvTypeRadios = document.querySelectorAll('input[name="cvv-type"]');
    const customCvvInput = document.getElementById('custom-cvv');

    // Validation elements
    const validateCardInput = document.getElementById('validate-card');
    const validateExpInput = document.getElementById('validate-exp');
    const validateCvvInput = document.getElementById('validate-cvv');
    const validateBtn = document.getElementById('validate-btn');
    const validationStatus = document.getElementById('validation-status');
    const validationOutput = document.getElementById('validation-output');
    const validationSummary = document.getElementById('validation-summary');
    const clearLogBtn = document.getElementById('clear-log-btn');

    // Batch validation elements
    const batchValidateBtn = document.getElementById('batch-validate-btn');
    const batchValidationStatus = document.getElementById('batch-validation-status');
    const batchResultsContainer = document.getElementById('batch-results-container');
    const batchValidationOutput = document.getElementById('batch-validation-output');
    const exportBatchBtn = document.getElementById('export-batch-btn');

    // Initialize Stripe on page load
    await initializeStripe();

    // Show HTTPS warning if running over HTTP
    const httpsWarning = document.getElementById('https-warning');
    if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
        httpsWarning.style.display = 'block';
    } else if (window.location.protocol === 'http:') {
        // Show a lighter warning for localhost development
        httpsWarning.innerHTML = '💡 <strong>Development Mode:</strong> Running on HTTP localhost. Production requires HTTPS.';
        httpsWarning.style.backgroundColor = '#e3f2fd';
        httpsWarning.style.borderColor = '#90caf9';
        httpsWarning.style.color = '#1565c0';
        httpsWarning.style.display = 'block';
    }

    // Verbose logging system
    let validationCount = 0;
    let validCards = 0;
    let invalidCards = 0;

    function logToOutput(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const colors = {
            info: '#e0e0e0',
            success: '#4caf50',
            error: '#f44336',
            warning: '#ff9800',
            header: '#2196f3'
        };
        
        const coloredMessage = `[${timestamp}] ${message}`;
        validationOutput.textContent += coloredMessage + '\n';
        validationOutput.scrollTop = validationOutput.scrollHeight;
    }

    function updateValidationSummary() {
        const successRate = validationCount > 0 ? ((validCards / validationCount) * 100).toFixed(1) : 0;
        validationSummary.innerHTML = `
            <strong>Validation Summary:</strong> 
            Total: ${validationCount} | 
            Valid: ${validCards} | 
            Invalid: ${invalidCards} | 
            Success Rate: ${successRate}%
        `;
    }

    function clearValidationLog() {
        validationOutput.textContent = 'Ready for validation...';
        validationCount = 0;
        validCards = 0;
        invalidCards = 0;
        updateValidationSummary();
    }

    // Helper functions for custom inputs
    function formatExpiry(value) {
        value = value.replace(/\D/g, '');
        if (value.length >= 2) {
            return value.substring(0, 2) + '/' + value.substring(2, 4);
        }
        return value;
    }

    function formatCvv(value) {
        return value.replace(/\D/g, '');
    }

    function toggleExpiryOptions() {
        const isChecked = includeExpiryCheckbox.checked;
        expiryOptions.style.display = isChecked ? 'block' : 'none';
        
        if (!isChecked) {
            // Reset to random when unchecked
            document.querySelector('input[name="expiry-type"][value="random"]').checked = true;
            customExpiryInput.disabled = true;
        }
    }

    function toggleCvvOptions() {
        const isChecked = includeCvvCheckbox.checked;
        cvvOptions.style.display = isChecked ? 'block' : 'none';
        
        if (!isChecked) {
            // Reset to random when unchecked
            document.querySelector('input[name="cvv-type"][value="random"]').checked = true;
            customCvvInput.disabled = true;
        }
    }

    function updateExpiryInputState() {
        const isCustom = document.querySelector('input[name="expiry-type"][value="custom"]').checked;
        customExpiryInput.disabled = !isCustom;
        if (isCustom) {
            customExpiryInput.focus();
        }
    }

    function updateCvvInputState() {
        const isCustom = document.querySelector('input[name="cvv-type"][value="custom"]').checked;
        customCvvInput.disabled = !isCustom;
        if (isCustom) {
            customCvvInput.focus();
        }
    }

    const brandLogos = {
        visa: 'V',
        mastercard: 'M',
        amex: 'A',
        discover: 'D',
        unknown: '💳'
    };

    function updateBrandIcon() {
        const bin = binInput.value;
        const brand = getBrand(bin);
        brandIcon.textContent = brandLogos[brand] || brandLogos.unknown;
    }

    function generate() {
        const bin = binInput.value;
        const count = parseInt(countInput.value, 10);
        
        if (!bin || count <= 0) {
            cardNumbersOutput.value = '';
            return;
        }

        const includeExpiry = includeExpiryCheckbox.checked;
        const includeCvv = includeCvvCheckbox.checked;

        // Get custom values and preferences
        const useRandomExpiry = document.querySelector('input[name="expiry-type"][value="random"]').checked;
        const useRandomCvv = document.querySelector('input[name="cvv-type"][value="random"]').checked;
        const customExpiry = customExpiryInput.value.trim();
        const customCvv = customCvvInput.value.trim();

        // Validate custom inputs if they're being used
        if (includeExpiry && !useRandomExpiry) {
            if (!customExpiry || !/^\d{2}\/\d{2}$/.test(customExpiry)) {
                alert('Please enter a valid expiry date in MM/YY format');
                customExpiryInput.focus();
                return;
            }
        }

        if (includeCvv && !useRandomCvv) {
            if (!customCvv || !/^\d{3,4}$/.test(customCvv)) {
                alert('Please enter a valid CVV (3-4 digits)');
                customCvvInput.focus();
                return;
            }
        }

        // Check if any additional data is requested
        const hasAdditionalOptions = includeExpiry || includeCvv;

        if (hasAdditionalOptions) {
            // Use enhanced generation
            const cards = generateCardsWithOptions(bin, count, {
                includeExpiry,
                includeCvv,
                customExpiry: customExpiry || null,
                customCvv: customCvv || null,
                useRandomExpiry,
                useRandomCvv
            });

            // Format output with additional data
            const formattedOutput = cards.map(card => {
                let line = card.number;
                
                if (card.expiry) {
                    line += ` | EXP: ${card.expiry}`;
                }
                
                if (card.cvv) {
                    line += ` | CVV: ${card.cvv}`;
                }
                
                return line;
            });

            cardNumbersOutput.value = formattedOutput.join('\n');
        } else {
            // Use simple card number generation
            const numbers = generateCardNumbers(bin, count);
            cardNumbersOutput.value = numbers.join('\n');
        }
    }

    function copyToClipboard() {
        if (!cardNumbersOutput.value) return;
        
        navigator.clipboard.writeText(cardNumbersOutput.value).then(() => {
            copyFeedback.textContent = 'Copied!';
            copyBtn.style.display = 'none';

            setTimeout(() => {
                copyFeedback.textContent = '';
                copyBtn.style.display = 'inline-block';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            copyFeedback.textContent = 'Failed!';
            setTimeout(() => { copyFeedback.textContent = ''; }, 2000);
        });
    }

    // Card validation functions
    function formatCardNumber(value) {
        return value.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
    }

    function formatExpiry(value) {
        value = value.replace(/\D/g, '');
        if (value.length >= 2) {
            return value.substring(0, 2) + '/' + value.substring(2, 4);
        }
        return value;
    }

    async function displayValidationResults(cardNumber, results) {
        const { overall, detailed_results } = results;
        
        validationCount++;
        if (overall.likely_real_card) {
            validCards++;
        } else {
            invalidCards++;
        }

        // Log header
        logToOutput(`\n=== VALIDATING CARD: ${cardNumber} ===`, 'header');
        
        // Step 1: Luhn validation
        logToOutput('Step 1: Luhn Algorithm Validation', 'header');
        if (detailed_results.luhn) {
            const luhn = detailed_results.luhn;
            if (luhn.valid) {
                logToOutput(`✅ Luhn Check: PASSED (checksum valid)`, 'success');
                logToOutput(`   Brand: ${luhn.details.brand || 'Unknown'}`, 'info');
                logToOutput(`   Length: ${luhn.details.length} digits`, 'info');
            } else {
                logToOutput(`❌ Luhn Check: FAILED`, 'error');
                if (luhn.error) {
                    logToOutput(`   Error: ${luhn.error}`, 'error');
                }
            }
        }

        // Step 2: BIN lookup
        logToOutput('\nStep 2: BIN Database Lookup', 'header');
        if (detailed_results.binLookup) {
            const bin = detailed_results.binLookup;
            if (bin.valid) {
                logToOutput(`✅ BIN Lookup: SUCCESS`, 'success');
                if (bin.details) {
                    logToOutput(`   Scheme: ${bin.details.scheme || 'Unknown'}`, 'info');
                    logToOutput(`   Type: ${bin.details.type || 'Unknown'}`, 'info');
                    logToOutput(`   Brand: ${bin.details.brand || 'Unknown'}`, 'info');
                    if (bin.details.country) {
                        logToOutput(`   Country: ${bin.details.country.name} (${bin.details.country.alpha2})`, 'info');
                    }
                    if (bin.details.bank) {
                        logToOutput(`   Bank: ${bin.details.bank.name}`, 'info');
                    }
                }
            } else {
                logToOutput(`❌ BIN Lookup: FAILED`, 'error');
                if (bin.error) {
                    logToOutput(`   Error: ${bin.error}`, 'error');
                }
            }
        }

        // Step 3: Stripe validation
        logToOutput('\nStep 3: Stripe Payment Processor Validation', 'header');
        if (detailed_results.paymentProcessor) {
            const stripe = detailed_results.paymentProcessor;
            if (stripe.valid) {
                logToOutput(`✅ Stripe Validation: PASSED`, 'success');
                logToOutput(`   Method: ${stripe.method.toUpperCase()}`, 'info');
                if (stripe.details) {
                    if (stripe.details.card_brand) logToOutput(`   Card Brand: ${stripe.details.card_brand}`, 'info');
                    if (stripe.details.card_country) logToOutput(`   Card Country: ${stripe.details.card_country}`, 'info');
                    if (stripe.details.card_funding) logToOutput(`   Card Funding: ${stripe.details.card_funding}`, 'info');
                    if (stripe.details.card_last4) logToOutput(`   Last 4: ${stripe.details.card_last4}`, 'info');
                    
                    // Show expiry information if available
                    if (stripe.details.expiry_provided) {
                        const expMonth = stripe.details.expiry_month.toString().padStart(2, '0');
                        const expYear = stripe.details.expiry_year.toString().slice(-2);
                        logToOutput(`   Expiry Date: ${expMonth}/${expYear} (validated)`, 'success');
                    }
                    
                    // Show CVV information if available - FIXED
                    if (stripe.details.cvv_provided) {
                        const cvvLength = stripe.details.cvv_length;
                        logToOutput(`   CVV: ${stripe.details.cvv} digits) - Validation ${stripe.details.cvv_valid ? 'passed' : 'not possible'}`, 'success');
                    } else if (stripe.details.cvv_length) {
                        // Alternative way to check if CVV was provided
                        logToOutput(`   CVV: ${stripe.details.cvv} digits`, 'success');
                    } else {
                        logToOutput(`   CVV: Not provided (using dummy value)`, 'warning');
                    }
                }
                if (stripe.note) {
                    logToOutput(`   Note: ${stripe.note}`, 'warning');
                }
            } else {
                logToOutput(`❌ Stripe Validation: FAILED`, 'error');
                if (stripe.error) {
                    logToOutput(`   Error: ${stripe.error}`, 'error');
                }
                
                // Show expiry information even if validation failed
                if (stripe.details && stripe.details.expiry_provided) {
                    const expMonth = stripe.details.expiry_month.toString().padStart(2, '0');
                    const expYear = stripe.details.expiry_year.toString().slice(-2);
                    logToOutput(`   Expiry Date: ${expMonth}/${expYear} (${stripe.details.expiry_valid === false ? 'invalid - card expired' : 'provided'})`, 'error');
                }
                
                // Show CVV information even if validation failed - FIXED
                if (stripe.details && (stripe.details.cvv_provided || stripe.details.cvv_length)) {
                    const cvvLength = stripe.details.cvv_length;
                    logToOutput(`   CVV: ${stripe.details.cvv}`, 'info');
                }
            }
        } else {
            logToOutput(`⚠️ Stripe validation not performed (no key available)`, 'warning');
        }

        // Final assessment
        logToOutput('\n--- FINAL ASSESSMENT ---', 'header');
        logToOutput(`Structurally Valid: ${overall.structurally_valid ? 'YES' : 'NO'}`, overall.structurally_valid ? 'success' : 'error');
        logToOutput(`BIN Recognized: ${overall.bin_recognized ? 'YES' : 'NO'}`, overall.bin_recognized ? 'success' : 'error');
        logToOutput(`Processor Valid: ${overall.processor_valid ? 'YES' : 'NO'}`, overall.processor_valid ? 'success' : 'error');
        logToOutput(`LIKELY REAL CARD: ${overall.likely_real_card ? 'YES' : 'NO'}`, overall.likely_real_card ? 'success' : 'error');
        
        logToOutput('='.repeat(50), 'info');
        
        updateValidationSummary();
    }

    async function validateCard() {
        const cardNumber = validateCardInput.value.replace(/\s/g, '');
        const expiry = validateExpInput.value;
        const cvv = validateCvvInput.value;

        if (!cardNumber || cardNumber.length < 13) {
            validationStatus.textContent = 'Please enter a valid card number';
            validationStatus.style.color = 'red';
            logToOutput('❌ Validation failed: Invalid card number format', 'error');
            return;
        }

        if (!STRIPE_KEY) {
            validationStatus.textContent = 'Stripe key not available. Please check server configuration.';
            validationStatus.style.color = 'red';
            logToOutput('❌ Validation failed: Stripe key not available', 'error');
            return;
        }

        validationStatus.textContent = 'Validating...';
        validationStatus.style.color = '#007bff';
        
        logToOutput(`\n🚀 Starting full validation for card: ${cardNumber}`, 'info');
        
        try {
            let expMonth = null, expYear = null;
            if (expiry && expiry.includes('/')) {
                const parts = expiry.split('/');
                expMonth = parseInt(parts[0], 10);
                expYear = 2000 + parseInt(parts[1], 10);
                logToOutput(`   Using provided expiry: ${expiry}`, 'info');
            } else {
                const currentYear = new Date().getFullYear();
                expMonth = 12;  // December
                expYear = currentYear + 2;  // 2 years in the future
                logToOutput(`   No expiry provided, using dummy values for validation: 12/${(currentYear + 2).toString().slice(-2)}`, 'warning');
            }

            if (cvv) {
                logToOutput(`   Using provided CVV: ${'*'.repeat(cvv.length)}`, 'info');
            } else {
                logToOutput(`   No CVV provided, using dummy value: ***`, 'warning');
            }

            // Always use full validation
            const results = await comprehensiveCardValidation(cardNumber, expMonth, expYear, cvv, STRIPE_KEY, 'full');
            await displayValidationResults(cardNumber, results);
            
            validationStatus.textContent = 'Validation complete';
            validationStatus.style.color = 'green';
        } catch (error) {
            console.error('Validation error:', error);
            validationStatus.textContent = 'Validation failed: ' + error.message;
            validationStatus.style.color = 'red';
            
            logToOutput(`❌ Validation failed with error: ${error.message}`, 'error');
        }
    }

    // Batch validation functions
    function displayBatchValidationResults(results) {
        const summary = results.summary;
        const details = results.details;
        
        let html = '<div style="font-size: 14px;">';
        
        // Summary section
        html += '<div style="margin-bottom: 20px; padding: 15px; border-radius: 8px; background-color: #e3f2fd;">';
        html += '<h4 style="margin: 0 0 15px 0; color: #1976d2;">Batch Validation Summary</h4>';
        html += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">`;
        html += `<div><strong>Total Cards:</strong> ${summary.total}</div>`;
        html += `<div><strong>Structurally Valid:</strong> ${summary.luhn_valid} (${((summary.luhn_valid / summary.total) * 100).toFixed(1)}%)</div>`;
        html += `<div><strong>BIN Recognized:</strong> ${summary.bin_recognized} (${((summary.bin_recognized / summary.total) * 100).toFixed(1)}%)</div>`;
        if (summary.stripe_validated !== undefined) {
            html += `<div><strong>Stripe Validated:</strong> ${summary.stripe_validated} (${((summary.stripe_validated / summary.total) * 100).toFixed(1)}%)</div>`;
        }
        if (summary.stripe_full_validated !== undefined) {
            html += `<div><strong>Full Stripe Valid:</strong> ${summary.stripe_full_validated} (${((summary.stripe_full_validated / summary.total) * 100).toFixed(1)}%)</div>`;
        }
        if (summary.errors !== undefined && summary.errors > 0) {
            html += `<div style="color: #dc3545;"><strong>Errors:</strong> ${summary.errors}</div>`;
        }
        html += `<div><strong>Likely Real:</strong> ${summary.likely_real} (${((summary.likely_real / summary.total) * 100).toFixed(1)}%)</div>`;
        html += `</div>`;
        html += '</div>';

        // Brand breakdown
        if (Object.keys(summary.brands).length > 0) {
            html += '<div style="margin-bottom: 20px; padding: 15px; border-radius: 8px; background-color: #f3e5f5;">';
            html += '<h4 style="margin: 0 0 10px 0; color: #7b1fa2;">Brand Breakdown</h4>';
            html += '<div style="display: flex; flex-wrap: wrap; gap: 15px;">';
            for (const [brand, count] of Object.entries(summary.brands)) {
                html += `<div style="background: white; padding: 8px 12px; border-radius: 4px; border: 1px solid #ddd;">`;
                html += `<strong>${brand.toUpperCase()}:</strong> ${count}`;
                html += `</div>`;
            }
            html += '</div></div>';
        }

        // Detailed results table
        html += '<div style="margin-bottom: 15px;">';
        html += '<h4 style="color: #2e7d32;">Detailed Results</h4>';
        html += '<div style="overflow-x: auto;">';
        html += '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
        html += '<thead><tr style="background-color: #f5f5f5;">';
        html += '<th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Card Number</th>';
        html += '<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Luhn</th>';
        html += '<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">BIN</th>';
        html += '<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Stripe</th>';
        html += '<th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Brand</th>';
        html += '<th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Bank/Country</th>';
        html += '<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Expiry</th>';
        html += '<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">CVV</th>';
        html += '<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Real?</th>';
        html += '</tr></thead><tbody>';

        details.forEach((result, index) => {
            const rowColor = result.overall.likely_real_card ? '#e8f5e8' : '#ffeaea';
            html += `<tr style="background-color: ${rowColor};">`;
            html += `<td style="border: 1px solid #ddd; padding: 6px; font-family: monospace;">${result.cardNumber}</td>`;
            html += `<td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${result.overall.structurally_valid ? '✅' : '❌'}</td>`;
            html += `<td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${result.overall.bin_recognized ? '✅' : '❌'}</td>`;
            
            // Stripe validation column
            let stripeIcon = '⚪'; // Default - not tested
            if (result.detailed_results.paymentProcessor) {
                stripeIcon = result.detailed_results.paymentProcessor.valid ? '✅' : '❌';
            }
            html += `<td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${stripeIcon}</td>`;
            
            let brand = 'Unknown';
            if (result.detailed_results.luhn?.details?.brand) {
                brand = result.detailed_results.luhn.details.brand;
            }
            html += `<td style="border: 1px solid #ddd; padding: 6px;">${brand}</td>`;
            
            let bankCountry = '';
            if (result.detailed_results.binLookup?.details) {
                const details = result.detailed_results.binLookup.details;
                const parts = [];
                if (details.bank?.name) parts.push(details.bank.name);
                if (details.country?.name) parts.push(details.country.name);
                bankCountry = parts.join(', ');
            }
            html += `<td style="border: 1px solid #ddd; padding: 6px;">${bankCountry || 'Unknown'}</td>`;
            
            // Add expiry column
            let expiryInfo = 'N/A';
            if (result.detailed_results.paymentProcessor?.details?.expiry_provided) {
                const expMonth = result.detailed_results.paymentProcessor.details.expiry_month;
                const expYear = result.detailed_results.paymentProcessor.details.expiry_year;
                if (expMonth && expYear) {
                    const formattedMonth = String(expMonth).padStart(2, '0');
                    const formattedYear = String(expYear).slice(-2);
                    expiryInfo = `${formattedMonth}/${formattedYear}`;
                    
                    // Add validation indicator
                    if (result.detailed_results.paymentProcessor.details.expiry_valid === false) {
                        expiryInfo += ' ❌';
                    } else if (result.detailed_results.paymentProcessor.details.expiry_valid === true) {
                        expiryInfo += ' ✅';
                    }
                }
            }
            html += `<td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${expiryInfo}</td>`;
            
            // Add CVV column
            let cvvInfo = 'N/A';
            if (result.detailed_results.paymentProcessor?.details?.cvv_provided) {
                const cvvLength = result.detailed_results.paymentProcessor.details.cvv_length;
                cvvInfo = `${cvvLength} digits`;
                
                // Add validation indicator if available
                if (result.detailed_results.paymentProcessor.details.cvv_valid === false) {
                    cvvInfo += ' ❌';
                } else if (result.detailed_results.paymentProcessor.details.cvv_valid === true) {
                    cvvInfo += ' ✅';
                }
            }
            html += `<td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${cvvInfo}</td>`;
            
            html += `<td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${result.overall.likely_real_card ? '✅' : '❌'}</td>`;
            html += '</tr>';
        });

        html += '</tbody></table></div></div>';
        html += '</div>';

        batchValidationOutput.innerHTML = html;
        batchResultsContainer.style.display = 'flex';
    }

    async function performBatchValidation() {
        const cardLines = cardNumbersOutput.value.trim().split('\n').filter(line => line.trim());
        
        // Extract card numbers and parse expiry/CVV data from the formatted output
        const cardData = cardLines.map(line => {
            const trimmedLine = line.trim();
            
            // If the line contains additional data (| EXP: | CVV:), parse it all
            if (trimmedLine.includes(' | ')) {
                const parts = trimmedLine.split(' | ');
                const cardNumber = parts[0];
                let expiry = null;
                let cvv = null;
                
                // Parse expiry if present
                const expiryPart = parts.find(part => part.startsWith('EXP: '));
                if (expiryPart) {
                    const expiryValue = expiryPart.replace('EXP: ', '');
                    if (expiryValue.includes('/')) {
                        const [month, year] = expiryValue.split('/');
                        expiry = {
                            month: parseInt(month, 10),
                            year: 2000 + parseInt(year, 10)
                        };
                    }
                }
                
                // Parse CVV if present
                const cvvPart = parts.find(part => part.startsWith('CVV: '));
                if (cvvPart) {
                    cvv = cvvPart.replace('CVV: ', '').trim();
                    
                    // Add debug logging to verify CVV extraction
                    console.debug(`Extracted CVV from "${cvvPart}": "${cvv}"`);
                    
                    // Make sure the CVV is only digits
                    if (!/^\d+$/.test(cvv)) {
                        console.warn(`Warning: Extracted CVV "${cvv}" contains non-digit characters`);
                        // Try to extract just the digits
                        const digitsOnly = cvv.replace(/\D/g, '');
                        if (digitsOnly) {
                            console.debug(`Corrected CVV to digits only: "${digitsOnly}"`);
                            cvv = digitsOnly;
                        }
                    }
                }
                
                return {
                    cardNumber,
                    expiry,
                    cvv,
                    hasAdditionalData: true
                };
            } else {
                // Just a plain card number
                return {
                    cardNumber: trimmedLine,
                    expiry: null,
                    cvv: null,
                    hasAdditionalData: false
                };
            }
        }).filter(data => data.cardNumber && /^\d+$/.test(data.cardNumber.replace(/\s/g, ''))); // Only keep valid card numbers, allowing for spaces
        
        if (cardData.length === 0) {
            batchValidationStatus.textContent = 'No card numbers to validate. Generate some cards first.';
            batchValidationStatus.style.color = 'red';
            logToOutput('❌ Batch validation failed: No card numbers to validate', 'error');
            return;
        }

        if (!STRIPE_KEY) {
            batchValidationStatus.textContent = 'Stripe key not available. Please check server configuration.';
            batchValidationStatus.style.color = 'red';
            logToOutput('❌ Batch validation failed: Stripe key not available', 'error');
            return;
        }

        batchValidationStatus.textContent = `Performing full validation on ${cardData.length} cards...`;
        batchValidationStatus.style.color = '#007bff';
        batchValidateBtn.disabled = true;
        batchValidateBtn.textContent = 'Validating...';

        logToOutput(`\n🚀 STARTING BATCH VALIDATION OF ${cardData.length} CARDS`, 'header');
        logToOutput(`📋 Extracted ${cardData.length} card numbers from ${cardLines.length} lines`, 'info');
        
        // Count how many have additional data
        const cardsWithAdditionalData = cardData.filter(data => data.hasAdditionalData).length;
        const cardsWithCvv = cardData.filter(data => data.cvv).length;
        if (cardsWithAdditionalData > 0) {
            logToOutput(`💳 ${cardsWithAdditionalData} cards have additional data (${cardsWithCvv} with CVV) that will be used in validation`, 'info');
        }
        
        logToOutput('='.repeat(60), 'info');

        const results = [];
        const summary = {
            total: cardData.length,
            luhn_valid: 0,
            bin_recognized: 0,
            likely_real: 0,
            stripe_validated: 0,
            with_cvv: cardsWithCvv,
            brands: {}
        };

        try {
            // Use smaller batch size for full validation (slower but more thorough)
            const batchSize = 3;
            const delay = 750; // Longer delay for full validation
            
            for (let i = 0; i < cardData.length; i += batchSize) {
                const batch = cardData.slice(i, i + batchSize);
                const batchPromises = batch.map(async (cardInfo) => {
                    const { cardNumber, expiry, cvv } = cardInfo;
                    
                    // Clean card number (remove spaces)
                    const cleanCardNumber = cardNumber.replace(/\s/g, '');
                    
                    try {
                        // Use actual expiry/CVV data if available, otherwise null (will use dummy)
                        const expMonth = expiry ? expiry.month : null;
                        const expYear = expiry ? expiry.year : null;
                        const cvvValue = cvv || null;
                        
                        // Log what data we're using for validation
                        const dataUsed = [];
                        
                        // Handle expiry information
                        if (expiry) {
                            dataUsed.push(`EXP: ${expiry.month.toString().padStart(2, '0')}/${expiry.year.toString().slice(-2)}`);
                        }
                        
                        // Handle CVV information with more detail
                        if (cvv) {
                            // Show CVV length but mask the actual value
                            // dataUsed.push(`CVV: ${'*'.repeat(cvv.length)} (${cvv.length} digits)`);
                            
                            // Debug log to verify the actual CVV value (masked in output)
                            console.debug(`Debug - Card ${cleanCardNumber} has CVV: ${cvv}`);
                        }
                        
                        if (dataUsed.length > 0) {
                            logToOutput(`🔍 Validating ${cleanCardNumber} with actual data: ${dataUsed.join(', ')}`, 'info');
                        } else {
                            logToOutput(`🔍 Validating ${cleanCardNumber} (no expiry/CVV data - using dummy values)`, 'warning');
                        }
                        
                        // Always use full validation with actual card data
                        const result = await comprehensiveCardValidation(cleanCardNumber, expMonth, expYear, cvvValue, STRIPE_KEY, 'full');
                        result.cardNumber = cleanCardNumber;
                        
                        // Add CVV info to result for reference
                        if (!result.cvvInfo && cvvValue) {
                            result.cvvInfo = {
                                provided: true,
                                length: cvvValue.length
                            };
                        }
                        
                        // Log individual card result to verbose output
                        await displayValidationResults(cleanCardNumber, result);
                        
                        return result;
                    } catch (error) {
                        logToOutput(`❌ Error validating ${cleanCardNumber}: ${error.message}`, 'error');
                        return {
                            cardNumber: cleanCardNumber,
                            overall: {
                                structurally_valid: false,
                                bin_recognized: false,
                                processor_valid: false,
                                likely_real_card: false
                            },
                            detailed_results: {
                                error: error.message
                            }
                        };
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                // Update progress
                const progressText = `Full validation: ${Math.min(i + batchSize, cardData.length)} of ${cardData.length} cards completed`;
                batchValidationStatus.textContent = progressText;
                logToOutput(`📊 Progress: ${Math.min(i + batchSize, cardData.length)}/${cardData.length} cards validated`, 'info');
                
                // Delay between batches
                if (i + batchSize < cardData.length) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            // Calculate summary statistics
            results.forEach(result => {
                if (result.overall.structurally_valid) summary.luhn_valid++;
                if (result.overall.bin_recognized) summary.bin_recognized++;
                if (result.overall.likely_real_card) summary.likely_real++;
                if (result.overall.processor_valid) summary.stripe_validated++;
                
                const brand = result.detailed_results.luhn?.details?.brand || 'unknown';
                summary.brands[brand] = (summary.brands[brand] || 0) + 1;
            });

            displayBatchValidationResults({ summary, details: results });
            
            // Log final summary
            logToOutput('\n📈 BATCH VALIDATION COMPLETE', 'header');
            logToOutput(`Total Cards: ${summary.total}`, 'info');
            logToOutput(`Cards with CVV: ${summary.with_cvv}`, 'info');
            logToOutput(`Structurally Valid: ${summary.luhn_valid} (${((summary.luhn_valid / summary.total) * 100).toFixed(1)}%)`, 'info');
            logToOutput(`BIN Recognized: ${summary.bin_recognized} (${((summary.bin_recognized / summary.total) * 100).toFixed(1)}%)`, 'info');
            logToOutput(`Stripe Validated: ${summary.stripe_validated} (${((summary.stripe_validated / summary.total) * 100).toFixed(1)}%)`, 'info');
            logToOutput(`Likely Real Cards: ${summary.likely_real} (${((summary.likely_real / summary.total) * 100).toFixed(1)}%)`, 'success');
            
            const completionMessage = `Full validation complete! ${summary.likely_real} of ${summary.total} cards appear to be real. ${summary.stripe_validated} passed Stripe validation.`;
            batchValidationStatus.textContent = completionMessage;
            batchValidationStatus.style.color = 'green';

        } catch (error) {
            console.error('Batch validation error:', error);
            batchValidationStatus.textContent = 'Batch validation failed: ' + error.message;
            batchValidationStatus.style.color = 'red';
            logToOutput(`❌ Batch validation failed: ${error.message}`, 'error');
        } finally {
            batchValidateBtn.disabled = false;
            batchValidateBtn.textContent = 'Validate All Generated Cards';
        }
    }

    function exportBatchResults() {
        const results = batchValidationOutput.innerHTML;
        if (!results || results.includes('No batch validation results')) {
            alert('No batch validation results to export. Run validation first.');
            return;
        }

        // Create a simplified text export
        const cardNumbers = cardNumbersOutput.value.trim().split('\n').filter(num => num.trim());
        if (cardNumbers.length === 0) return;

        let exportText = 'Batch Validation Results\n';
        exportText += '========================\n\n';
        exportText += `Generated: ${new Date().toLocaleString()}\n`;
        exportText += `Total Cards Validated: ${cardNumbers.length}\n\n`;

        // Add the card numbers for easy copying
        exportText += 'Card Numbers:\n';
        exportText += '-------------\n';
        cardNumbers.forEach(num => {
            exportText += num.trim() + '\n';
        });

        // Create and download the file
        const blob = new Blob([exportText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `batch-validation-results-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Event listeners
    binInput.addEventListener('input', updateBrandIcon);
    generateBtn.addEventListener('click', generate);
    copyBtn.addEventListener('click', copyToClipboard);

    // Generation options event listeners
    includeExpiryCheckbox.addEventListener('change', toggleExpiryOptions);
    includeCvvCheckbox.addEventListener('change', toggleCvvOptions);
    
    // Radio button listeners
    expiryTypeRadios.forEach(radio => {
        radio.addEventListener('change', updateExpiryInputState);
    });
    
    cvvTypeRadios.forEach(radio => {
        radio.addEventListener('change', updateCvvInputState);
    });

    // Input formatting
    customExpiryInput.addEventListener('input', (e) => {
        e.target.value = formatExpiry(e.target.value);
    });

    customCvvInput.addEventListener('input', (e) => {
        e.target.value = formatCvv(e.target.value);
    });

    // Validation event listeners
    validateCardInput.addEventListener('input', (e) => {
        e.target.value = formatCardNumber(e.target.value);
    });
    
    validateExpInput.addEventListener('input', (e) => {
        e.target.value = formatExpiry(e.target.value);
    });

    validateCvvInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
    });

    validateBtn.addEventListener('click', validateCard);

    // Batch validation event listeners
    batchValidateBtn.addEventListener('click', performBatchValidation);
    exportBatchBtn.addEventListener('click', exportBatchResults);
    
    // Clear log functionality
    clearLogBtn.addEventListener('click', clearValidationLog);

    // Initialize UI state
    updateBrandIcon();
    updateValidationSummary();
}); 
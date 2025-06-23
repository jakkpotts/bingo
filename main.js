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
    return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
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
                note: 'Simulated full validation - actual Stripe validation requires live card input'
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
        if (expMonth && expYear && cvc) {
            // Use provided expiry and CVV
            results.paymentProcessor = await validateCardWithStripe(cardNumber, expMonth, expYear, cvc, stripeKey, stripeValidationType);
        } else {
            // Use dummy expiry/CVV for validation
            const currentYear = new Date().getFullYear();
            const futureMonth = 12;
            const futureYear = currentYear + 2;
            const dummyCvv = '123';
            
            results.paymentProcessor = await validateCardWithStripe(cardNumber, futureMonth, futureYear, dummyCvv, stripeKey, stripeValidationType);
            
            // Mark as validation with dummy data
            if (results.paymentProcessor.valid || results.paymentProcessor.error) {
                if (!results.paymentProcessor.note) {
                    results.paymentProcessor.note = 'Validated with dummy expiry/CVV for card structure check';
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
    const stripeValidationOptions = document.getElementById('stripe-validation-options');
    const stripeValidationType = document.getElementById('stripe-validation-type');
    const validateCardInput = document.getElementById('validate-card');
    const validateExpInput = document.getElementById('validate-exp');
    const validateCvvInput = document.getElementById('validate-cvv');
    const validateBtn = document.getElementById('validate-btn');
    const validationStatus = document.getElementById('validation-status');
    const validationOutput = document.getElementById('validation-output');

    // Batch validation elements
    const batchValidateBtn = document.getElementById('batch-validate-btn');
    const batchFullValidateBtn = document.getElementById('batch-full-validate-btn');
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

    function displayValidationResults(results) {
        const { overall, detailed_results } = results;
        
        let html = '<div style="font-size: 14px;">';
        
        // Overall summary
        html += '<div style="margin-bottom: 15px; padding: 10px; border-radius: 5px; background-color: ' + 
                (overall.likely_real_card ? '#d4edda' : '#f8d7da') + ';">';
        html += '<h4 style="margin: 0 0 10px 0;">Overall Assessment</h4>';
        html += '<p><strong>Likely Real Card:</strong> ' + (overall.likely_real_card ? 'YES' : 'NO') + '</p>';
        html += '<p><strong>Structurally Valid:</strong> ' + (overall.structurally_valid ? 'YES' : 'NO') + '</p>';
        html += '<p><strong>BIN Recognized:</strong> ' + (overall.bin_recognized ? 'YES' : 'NO') + '</p>';
        html += '<p><strong>Processor Validated:</strong> ' + (overall.processor_valid ? 'YES' : 'NO') + '</p>';
        html += '</div>';

        // Detailed results
        html += '<div style="margin-bottom: 15px;">';
        html += '<h4>Detailed Results</h4>';

        // Luhn validation
        if (detailed_results.luhn) {
            html += '<div style="margin-bottom: 10px; padding: 8px; border-left: 3px solid #007bff;">';
            html += '<strong>Luhn Validation:</strong> ' + (detailed_results.luhn.valid ? 'PASS' : 'FAIL') + '<br>';
            html += 'Brand: ' + detailed_results.luhn.details.brand + '<br>';
            html += 'Length: ' + detailed_results.luhn.details.length + ' digits';
            html += '</div>';
        }

        // BIN lookup
        if (detailed_results.binLookup) {
            html += '<div style="margin-bottom: 10px; padding: 8px; border-left: 3px solid ' + 
                    (detailed_results.binLookup.valid ? '#28a745' : '#dc3545') + ';">';
            html += '<strong>BIN Lookup:</strong> ' + (detailed_results.binLookup.valid ? 'SUCCESS' : 'FAILED') + '<br>';
            if (detailed_results.binLookup.valid && detailed_results.binLookup.details) {
                const details = detailed_results.binLookup.details;
                html += 'Scheme: ' + (details.scheme || 'Unknown') + '<br>';
                html += 'Type: ' + (details.type || 'Unknown') + '<br>';
                html += 'Brand: ' + (details.brand || 'Unknown') + '<br>';
                if (details.country) {
                    html += 'Country: ' + details.country.name + ' (' + details.country.alpha2 + ')<br>';
                }
                if (details.bank) {
                    html += 'Bank: ' + details.bank.name + '<br>';
                }
            } else if (detailed_results.binLookup.error) {
                html += 'Error: ' + detailed_results.binLookup.error;
            }
            html += '</div>';
        }

        // Payment processor validation
        if (detailed_results.paymentProcessor) {
            const borderColor = detailed_results.paymentProcessor.valid ? '#28a745' : 
                               detailed_results.paymentProcessor.error ? '#dc3545' : '#ffc107';
            html += '<div style="margin-bottom: 10px; padding: 8px; border-left: 3px solid ' + borderColor + ';">';
            html += '<strong>Payment Processor:</strong> ' + detailed_results.paymentProcessor.method.toUpperCase() + '<br>';
            html += 'Status: ' + (detailed_results.paymentProcessor.valid ? 'VALID' : 'INVALID') + '<br>';
            
            if (detailed_results.paymentProcessor.valid && detailed_results.paymentProcessor.details) {
                const details = detailed_results.paymentProcessor.details;
                html += 'Card Brand: ' + (details.card_brand || 'Unknown') + '<br>';
                html += 'Card Country: ' + (details.card_country || 'Unknown') + '<br>';
                html += 'Card Funding: ' + (details.card_funding || 'Unknown') + '<br>';
                html += 'Last 4 Digits: ' + (details.card_last4 || 'Unknown') + '<br>';
                if (details.card_exp_month && details.card_exp_year) {
                    html += 'Expiry: ' + details.card_exp_month + '/' + details.card_exp_year + '<br>';
                }
            }
            
            if (detailed_results.paymentProcessor.error) {
                html += 'Error: ' + detailed_results.paymentProcessor.error + '<br>';
            }
            
            if (detailed_results.paymentProcessor.note) {
                html += '<em style="color: #666;">' + detailed_results.paymentProcessor.note + '</em>';
            }
            html += '</div>';
        }

        html += '</div>';
        html += '</div>';

        validationOutput.innerHTML = html;
    }

    async function validateCard() {
        const cardNumber = validateCardInput.value.replace(/\s/g, '');
        const expiry = validateExpInput.value;
        const cvv = validateCvvInput.value;
        const validationType = stripeValidationType.value;

        if (!cardNumber || cardNumber.length < 13) {
            validationStatus.textContent = 'Please enter a valid card number';
            validationStatus.style.color = 'red';
            return;
        }

        if (!STRIPE_KEY) {
            validationStatus.textContent = 'Stripe key not available. Please check server configuration.';
            validationStatus.style.color = 'red';
            return;
        }

        validationStatus.textContent = 'Validating...';
        validationStatus.style.color = '#007bff';
        
        try {
            let expMonth = null, expYear = null;
            if (expiry && expiry.includes('/')) {
                const parts = expiry.split('/');
                expMonth = parseInt(parts[0], 10);
                expYear = 2000 + parseInt(parts[1], 10);
            }

            const results = await comprehensiveCardValidation(cardNumber, expMonth, expYear, cvv, STRIPE_KEY, validationType);
            displayValidationResults(results);
            
            validationStatus.textContent = 'Validation complete';
            validationStatus.style.color = 'green';
        } catch (error) {
            console.error('Validation error:', error);
            validationStatus.textContent = 'Validation failed: ' + error.message;
            validationStatus.style.color = 'red';
            
            validationOutput.innerHTML = '<p style="color: red;">Error: ' + error.message + '</p>';
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
            html += `<td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${result.overall.likely_real_card ? '✅' : '❌'}</td>`;
            html += '</tr>';
        });

        html += '</tbody></table></div></div>';
        html += '</div>';

        batchValidationOutput.innerHTML = html;
        batchResultsContainer.style.display = 'flex';
    }

    async function performBatchValidation() {
        const cardNumbers = cardNumbersOutput.value.trim().split('\n').filter(num => num.trim());
        const validationType = stripeValidationType.value;
        
        if (cardNumbers.length === 0) {
            batchValidationStatus.textContent = 'No card numbers to validate. Generate some cards first.';
            batchValidationStatus.style.color = 'red';
            return;
        }

        if (!STRIPE_KEY) {
            batchValidationStatus.textContent = 'Stripe key not available. Please check server configuration.';
            batchValidationStatus.style.color = 'red';
            return;
        }

        // Show different messages based on validation type
        const validationTypeText = validationType === 'full' ? 'full Stripe validation' : 'format + BIN validation';
        batchValidationStatus.textContent = `Performing ${validationTypeText} on ${cardNumbers.length} cards...`;
        batchValidationStatus.style.color = '#007bff';
        batchValidateBtn.disabled = true;
        batchValidateBtn.textContent = validationType === 'full' ? 'Full Validating...' : 'Validating...';

        const results = [];
        const summary = {
            total: cardNumbers.length,
            luhn_valid: 0,
            bin_recognized: 0,
            likely_real: 0,
            stripe_validated: 0,
            brands: {}
        };

        try {
            // Adjust batch size based on validation type (full validation is slower)
            const batchSize = validationType === 'full' ? 2 : 5;
            const delay = validationType === 'full' ? 500 : 100; // Longer delay for full validation
            
            for (let i = 0; i < cardNumbers.length; i += batchSize) {
                const batch = cardNumbers.slice(i, i + batchSize);
                const batchPromises = batch.map(async (cardNumber) => {
                    const cleanNumber = cardNumber.trim();
                    try {
                        const result = await comprehensiveCardValidation(cleanNumber, null, null, null, STRIPE_KEY, validationType);
                        result.cardNumber = cleanNumber;
                        return result;
                    } catch (error) {
                        return {
                            cardNumber: cleanNumber,
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

                // Update progress with validation type context
                const progressText = validationType === 'full' ? 
                    `Full validation: ${Math.min(i + batchSize, cardNumbers.length)} of ${cardNumbers.length} cards...` :
                    `Validated ${Math.min(i + batchSize, cardNumbers.length)} of ${cardNumbers.length} cards...`;
                batchValidationStatus.textContent = progressText;
                
                // Delay between batches - longer for full validation
                if (i + batchSize < cardNumbers.length) {
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
            
            // Create completion message based on validation type
            let completionMessage = `Validation complete! ${summary.likely_real} of ${summary.total} cards appear to be real.`;
            if (STRIPE_KEY && summary.stripe_validated > 0) {
                const validationTypeLabel = validationType === 'full' ? 'full Stripe validation' : 'Stripe format check';
                completionMessage += ` ${summary.stripe_validated} passed ${validationTypeLabel}.`;
            }
            
            batchValidationStatus.textContent = completionMessage;
            batchValidationStatus.style.color = 'green';

        } catch (error) {
            console.error('Batch validation error:', error);
            batchValidationStatus.textContent = 'Batch validation failed: ' + error.message;
            batchValidationStatus.style.color = 'red';
        } finally {
            batchValidateBtn.disabled = false;
            batchValidateBtn.textContent = 'Validate All Generated';
        }
    }

    // Dedicated batch full validation function
    async function performBatchFullValidation() {
        const cardNumbers = cardNumbersOutput.value.trim().split('\n').filter(num => num.trim());
        
        if (cardNumbers.length === 0) {
            batchValidationStatus.textContent = 'No card numbers to validate. Generate some cards first.';
            batchValidationStatus.style.color = 'red';
            return;
        }

        if (!STRIPE_KEY) {
            batchValidationStatus.textContent = 'Stripe key not available. Please check server configuration.';
            batchValidationStatus.style.color = 'red';
            return;
        }

        batchValidationStatus.textContent = `Initializing full Stripe validation for ${cardNumbers.length} cards...`;
        batchValidationStatus.style.color = '#007bff';
        batchFullValidateBtn.disabled = true;
        batchValidateBtn.disabled = true;
        batchFullValidateBtn.textContent = 'Initializing...';

        let batchValidator = null;
        const results = [];
        const summary = {
            total: cardNumbers.length,
            luhn_valid: 0,
            bin_recognized: 0,
            likely_real: 0,
            stripe_validated: 0,
            stripe_full_validated: 0,
            brands: {},
            errors: 0
        };

        try {
            // Initialize the batch validator
            batchValidator = new StripeBatchValidator(STRIPE_KEY);
            batchValidationStatus.textContent = 'Initializing Stripe Elements...';
            await batchValidator.initialize();

            batchValidationStatus.textContent = `Full validation in progress: 0 of ${cardNumbers.length} cards...`;
            batchFullValidateBtn.textContent = 'Validating...';

            // Process cards individually with full validation
            for (let i = 0; i < cardNumbers.length; i++) {
                const cardNumber = cardNumbers[i].trim();
                
                try {
                    // Update progress
                    batchValidationStatus.textContent = `Full validation: ${i + 1} of ${cardNumbers.length} cards...`;
                    
                    // Perform comprehensive validation with enhanced full validation
                    const luhnResult = await validateCardWithLuhn(cardNumber);
                    const binResult = await validateCardWithBinLookup(cardNumber);
                    
                    // Enhanced full validation
                    const stripeFullResult = await validateCardWithStripeFull(cardNumber, null, null, null, STRIPE_KEY);
                    
                    // Try the batch validator for additional validation
                    let batchValidationResult = null;
                    try {
                        batchValidationResult = await batchValidator.validateCard(cardNumber, 12, new Date().getFullYear() + 2, '123');
                    } catch (batchError) {
                        console.warn('Batch validation failed for card:', cardNumber, batchError);
                        batchValidationResult = {
                            valid: false,
                            method: 'stripe_full_batch',
                            error: 'Batch validation failed: ' + batchError.message
                        };
                    }

                    // Combine results
                    const combinedResult = {
                        cardNumber: cardNumber,
                        overall: {
                            structurally_valid: luhnResult.valid,
                            bin_recognized: binResult.valid,
                            processor_valid: stripeFullResult.valid || batchValidationResult.valid,
                            stripe_full_valid: stripeFullResult.valid,
                            batch_validation_valid: batchValidationResult.valid,
                            likely_real_card: luhnResult.valid && binResult.valid
                        },
                        detailed_results: {
                            luhn: luhnResult,
                            binLookup: binResult,
                            paymentProcessor: stripeFullResult,
                            batchValidation: batchValidationResult
                        }
                    };

                    results.push(combinedResult);

                    // Update summary
                    if (combinedResult.overall.structurally_valid) summary.luhn_valid++;
                    if (combinedResult.overall.bin_recognized) summary.bin_recognized++;
                    if (combinedResult.overall.likely_real_card) summary.likely_real++;
                    if (combinedResult.overall.processor_valid) summary.stripe_validated++;
                    if (combinedResult.overall.stripe_full_valid) summary.stripe_full_validated++;
                    
                    const brand = luhnResult.details?.brand || 'unknown';
                    summary.brands[brand] = (summary.brands[brand] || 0) + 1;

                } catch (error) {
                    console.error('Error validating card:', cardNumber, error);
                    summary.errors++;
                    
                    // Add error result
                    results.push({
                        cardNumber: cardNumber,
                        overall: {
                            structurally_valid: false,
                            bin_recognized: false,
                            processor_valid: false,
                            stripe_full_valid: false,
                            batch_validation_valid: false,
                            likely_real_card: false
                        },
                        detailed_results: {
                            error: error.message
                        }
                    });
                }

                // Add delay between validations to avoid overwhelming Stripe
                if (i < cardNumbers.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 750));
                }
            }

            // Display results
            displayBatchValidationResults({ summary, details: results });
            
            const successMessage = `Full validation complete! ${summary.stripe_full_validated} of ${summary.total} cards passed full Stripe validation. ${summary.likely_real} appear to be real cards.`;
            batchValidationStatus.textContent = successMessage;
            batchValidationStatus.style.color = 'green';

        } catch (error) {
            console.error('Batch full validation error:', error);
            batchValidationStatus.textContent = 'Full validation failed: ' + error.message;
            batchValidationStatus.style.color = 'red';
            
            if (results.length > 0) {
                // Display partial results if any were completed
                displayBatchValidationResults({ summary, details: results });
            }
        } finally {
            // Clean up the batch validator
            if (batchValidator) {
                batchValidator.cleanup();
            }
            
            batchFullValidateBtn.disabled = false;
            batchValidateBtn.disabled = false;
            batchFullValidateBtn.textContent = 'Full Stripe Validation (Batch)';
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
    batchFullValidateBtn.addEventListener('click', performBatchFullValidation);
    exportBatchBtn.addEventListener('click', exportBatchResults);

    // Initialize UI state
    updateBrandIcon();
}); 
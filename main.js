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

async function validateCardWithStripe(cardNumber, expMonth, expYear, cvc) {
    // Note: This requires Stripe.js to be loaded and configured
    // This is a placeholder for Stripe validation
    try {
        if (typeof Stripe === 'undefined') {
            throw new Error('Stripe.js not loaded');
        }
        
        // Create card element and validate
        const cardElement = {
            number: cardNumber,
            exp_month: expMonth,
            exp_year: expYear,
            cvc: cvc
        };
        
        // This would require actual Stripe API integration
        // For now, return a placeholder response
        return {
            valid: false,
            method: 'stripe',
            error: 'Stripe integration not configured'
        };
    } catch (error) {
        return {
            valid: false,
            method: 'stripe',
            error: error.message
        };
    }
}

async function validateCardWithLuhn(cardNumber) {
    const isLuhnValid = luhnChecksum(cardNumber) === 0;
    return {
        valid: isLuhnValid,
        method: 'luhn',
        details: {
            checksum_valid: isLuhnValid,
            length: cardNumber.length,
            brand: getBrand(cardNumber)
        }
    };
}

async function comprehensiveCardValidation(cardNumber, expMonth = null, expYear = null, cvc = null) {
    const results = {};
    
    // 1. Basic Luhn validation (structural)
    results.luhn = await validateCardWithLuhn(cardNumber);
    
    // 2. BIN lookup validation (checks if BIN is associated with real issuer)
    results.binLookup = await validateCardWithBinLookup(cardNumber);
    
    // 3. Payment processor validation (if credentials available)
    if (expMonth && expYear && cvc) {
        results.paymentProcessor = await validateCardWithStripe(cardNumber, expMonth, expYear, cvc);
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

document.addEventListener('DOMContentLoaded', () => {
    const binInput = document.getElementById('bin');
    const brandIcon = document.getElementById('brand-icon');
    const generateBtn = document.getElementById('generate-btn');
    const copyBtn = document.getElementById('copy-btn');
    const copyFeedback = document.getElementById('copy-feedback');
    const cardNumbersOutput = document.getElementById('card-numbers-output');
    const countInput = document.getElementById('count');

    // Validation elements
    const validateCardInput = document.getElementById('validate-card');
    const validateExpInput = document.getElementById('validate-exp');
    const validateCvvInput = document.getElementById('validate-cvv');
    const validateBtn = document.getElementById('validate-btn');
    const validationStatus = document.getElementById('validation-status');
    const validationOutput = document.getElementById('validation-output');

    // Batch validation elements
    const batchValidateBtn = document.getElementById('batch-validate-btn');
    const batchValidationStatus = document.getElementById('batch-validation-status');
    const batchResultsContainer = document.getElementById('batch-results-container');
    const batchValidationOutput = document.getElementById('batch-validation-output');
    const exportBatchBtn = document.getElementById('export-batch-btn');

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
        if (bin && count > 0) {
            const numbers = generateCardNumbers(bin, count);
            cardNumbersOutput.value = numbers.join('\n');
        } else {
            cardNumbersOutput.value = '';
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
            html += '<div style="margin-bottom: 10px; padding: 8px; border-left: 3px solid #ffc107;">';
            html += '<strong>Payment Processor:</strong> ' + detailed_results.paymentProcessor.method.toUpperCase() + '<br>';
            html += 'Status: ' + (detailed_results.paymentProcessor.valid ? 'VALID' : 'INVALID') + '<br>';
            if (detailed_results.paymentProcessor.error) {
                html += 'Note: ' + detailed_results.paymentProcessor.error;
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

        if (!cardNumber || cardNumber.length < 13) {
            validationStatus.textContent = 'Please enter a valid card number';
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

            const results = await comprehensiveCardValidation(cardNumber, expMonth, expYear, cvv);
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
        
        if (cardNumbers.length === 0) {
            batchValidationStatus.textContent = 'No card numbers to validate. Generate some cards first.';
            batchValidationStatus.style.color = 'red';
            return;
        }

        batchValidationStatus.textContent = `Validating ${cardNumbers.length} cards...`;
        batchValidationStatus.style.color = '#007bff';
        batchValidateBtn.disabled = true;
        batchValidateBtn.textContent = 'Validating...';

        const results = [];
        const summary = {
            total: cardNumbers.length,
            luhn_valid: 0,
            bin_recognized: 0,
            likely_real: 0,
            brands: {}
        };

        try {
            // Process cards in batches to avoid overwhelming the API
            const batchSize = 5;
            for (let i = 0; i < cardNumbers.length; i += batchSize) {
                const batch = cardNumbers.slice(i, i + batchSize);
                const batchPromises = batch.map(async (cardNumber) => {
                    const cleanNumber = cardNumber.trim();
                    try {
                        const result = await comprehensiveCardValidation(cleanNumber);
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

                // Update progress
                batchValidationStatus.textContent = `Validated ${Math.min(i + batchSize, cardNumbers.length)} of ${cardNumbers.length} cards...`;
                
                // Small delay between batches to be respectful to the API
                if (i + batchSize < cardNumbers.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            // Calculate summary statistics
            results.forEach(result => {
                if (result.overall.structurally_valid) summary.luhn_valid++;
                if (result.overall.bin_recognized) summary.bin_recognized++;
                if (result.overall.likely_real_card) summary.likely_real++;
                
                const brand = result.detailed_results.luhn?.details?.brand || 'unknown';
                summary.brands[brand] = (summary.brands[brand] || 0) + 1;
            });

            displayBatchValidationResults({ summary, details: results });
            
            batchValidationStatus.textContent = `Validation complete! ${summary.likely_real} of ${summary.total} cards appear to be real.`;
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

    updateBrandIcon();
}); 
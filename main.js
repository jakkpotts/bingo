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

function generateCardRecord(binPrefix = "414720", count = 5, includeTracks = true, name = "DOE/JOHN", includeCvv = true, zip = "") {
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

function generateCardNumbers(binPrefix = "414720", count = 10) {
    const numbers = [];
    const brand = getBrand(binPrefix);
    const length = brand === "amex" ? 15 : 16;

    for (let i = 0; i < count; i++) {
        const cardNumber = generateLuhnCard(binPrefix, length);
        numbers.push(cardNumber);
    }
    return numbers;
}

document.addEventListener('DOMContentLoaded', () => {
    const binInput = document.getElementById('bin');
    const brandIcon = document.getElementById('brand-icon');
    const generateBtn = document.getElementById('generate-btn');
    const copyBtn = document.getElementById('copy-btn');
    const copyFeedback = document.getElementById('copy-feedback');
    const cardNumbersOutput = document.getElementById('card-numbers-output');
    const countInput = document.getElementById('count');

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

    binInput.addEventListener('input', updateBrandIcon);
    generateBtn.addEventListener('click', generate);
    copyBtn.addEventListener('click', copyToClipboard);

    updateBrandIcon();
}); 
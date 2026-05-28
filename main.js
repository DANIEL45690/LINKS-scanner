const https = require('https');
const http = require('http');
const url = require('url');
const fs = require('fs');

const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('Usage: node scanner.js <url> [output_file]');
    process.exit(1);
}

const startUrl = args[0];
const outputFile = args[1] || 'scan_results.txt';
const visited = new Set();
const toVisit = [startUrl];
const allLinks = new Set();

console.log('    _  _ ____   ____ ____                  ____     ___   _   _');
console.log(' ||  || \\\\// || \\\\ ||    || \\\\ ||    || ||\\ || || // (( \\    || \\\\   // \\\\  \\\\ //');
console.log(' ||==||  )/  ||_// ||==  ||_// ||    || ||\\\\|| ||<<   \\\\     ||  )) ((   ))  )X( ');
console.log(' ||  || //   ||    ||___ || \\\\ ||| ||  \\ || \\\\ \\_))    ||_//   \\\\_//  // \\\\');
console.log('');

console.log(`Scanning: ${startUrl}\n`);

function getPageContent(pageUrl, callback) {
    const parsedUrl = url.parse(pageUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.path,
        port: parsedUrl.port,
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    };

    const req = protocol.get(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let redirectUrl = res.headers.location;
            if (redirectUrl.startsWith('/')) {
                redirectUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}${redirectUrl}`;
            }
            getPageContent(redirectUrl, callback);
            return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => callback(null, data));
    });

    req.on('error', (err) => callback(err, null));
    req.end();
}

function extractLinks(html, baseUrl) {
    const links = new Set();
    const regex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
        let link = match[2];

        if (link.startsWith('#') || link.startsWith('javascript:') || link.startsWith('mailto:') || link.startsWith('tel:')) {
            continue;
        }

        try {
            const resolved = url.resolve(baseUrl, link);
            const parsed = url.parse(resolved);

            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                const cleanUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname || ''}`;
                if (!cleanUrl.includes('#') && !cleanUrl.includes('?')) {
                    links.add(cleanUrl);
                }
            }
        } catch (e) {}
    }

    return links;
}

function normalizeUrl(urlStr) {
    const parsed = url.parse(urlStr);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname || ''}`.replace(/\/$/, '');
}

async function scan() {
    while (toVisit.length > 0) {
        const currentUrl = toVisit.shift();
        const normalized = normalizeUrl(currentUrl);

        if (visited.has(normalized)) {
            continue;
        }

        visited.add(normalized);
        console.log(`[${visited.size}] Scanning: ${normalized}`);

        await new Promise((resolve) => {
            getPageContent(normalized, (err, html) => {
                if (err) {
                    console.log(`  ERROR: ${err.message}`);
                    resolve();
                    return;
                }

                const links = extractLinks(html, normalized);
                console.log(`  Found ${links.size} links`);

                links.forEach(link => {
                    allLinks.add(link);
                    const normalizedLink = normalizeUrl(link);
                    if (!visited.has(normalizedLink) && !toVisit.includes(normalizedLink)) {
                        if (normalizedLink.startsWith(normalizeUrl(startUrl))) {
                            toVisit.push(link);
                        }
                    }
                });

                resolve();
            });
        });

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n' + '='.repeat(60));
    console.log(`SCAN COMPLETE`);
    console.log(`Total pages visited: ${visited.size}`);
    console.log(`Total unique links found: ${allLinks.size}`);
    console.log('='.repeat(60) + '\n');

    const results = Array.from(allLinks).sort();
    results.forEach(link => console.log(link));

    fs.writeFileSync(outputFile, results.join('\n'));
    console.log(`\nResults saved to: ${outputFile}`);
}

scan().catch(console.error);

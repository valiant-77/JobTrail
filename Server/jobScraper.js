const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const axios = require('axios');

class JobScraper {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
        this.timeout = 30000;
    }

    // Main scraping function that determines the best method
    async scrapeJobDetails(url) {
        try {
            console.log(`Starting to scrape: ${url}`);
            
            // First, try to identify the platform
            const platform = this.identifyPlatform(url);
            console.log(`Detected platform: ${platform}`);

            // Try static scraping first (faster)
            let jobData = await this.tryStaticScraping(url, platform);
            
            // If static scraping fails or returns incomplete data, try dynamic scraping
            if (!jobData || !this.isDataComplete(jobData)) {
                console.log('Static scraping incomplete, trying dynamic scraping...');
                jobData = await this.tryDynamicScraping(url, platform);
            }

            // Clean and validate the data
            return this.cleanJobData(jobData, url, platform);
            
        } catch (error) {
            console.error('Scraping failed:', error);
            return this.createFallbackData(url);
        }
    }

    // Identify the job platform from URL
    identifyPlatform(url) {
        const urlLower = url.toLowerCase();
        
        if (urlLower.includes('linkedin.com')) return 'LinkedIn';
        if (urlLower.includes('indeed.com')) return 'Indeed';
        if (urlLower.includes('glassdoor.com')) return 'Glassdoor';
        if (urlLower.includes('naukri.com')) return 'Naukri';
        if (urlLower.includes('monster.com')) return 'Monster';
        if (urlLower.includes('jobs.google.com')) return 'Google Jobs';
        if (urlLower.includes('stackoverflow.com')) return 'Stack Overflow';
        if (urlLower.includes('angel.co') || urlLower.includes('wellfound.com')) return 'AngelList';
        if (urlLower.includes('dice.com')) return 'Dice';
        if (urlLower.includes('ziprecruiter.com')) return 'ZipRecruiter';
        if (urlLower.includes('careerbuilder.com')) return 'CareerBuilder';
        if (urlLower.includes('simplyhired.com')) return 'SimplyHired';
        if (urlLower.includes('flexjobs.com')) return 'FlexJobs';
        if (urlLower.includes('upwork.com')) return 'Upwork';
        if (urlLower.includes('freelancer.com')) return 'Freelancer';
        
        // Check for company career pages
        if (urlLower.includes('/careers') || urlLower.includes('/jobs')) return 'Career Page';
        
        return 'Unknown';
    }

    // Try static scraping using axios and cheerio
    async tryStaticScraping(url, platform) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                },
                timeout: this.timeout
            });

            const $ = cheerio.load(response.data);
            return this.extractJobDataFromHTML($, platform);
            
        } catch (error) {
            console.log('Static scraping failed:', error.message);
            return null;
        }
    }

    // Try dynamic scraping using puppeteer
    async tryDynamicScraping(url, platform) {
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        
        // Set user agent and viewport
        await page.setUserAgent(this.userAgent);
        await page.setViewport({ width: 1366, height: 768 });

        // Block images, fonts, and other resources to speed up loading
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (resourceType === 'image' || resourceType === 'font' || resourceType === 'stylesheet') {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Navigate to the page
        await page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: this.timeout 
        });

        // FIXED: Wait for potential dynamic content
        // Option 1: Use the Promise-based approach (most compatible)
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Alternative option for newer Puppeteer versions:
        // await page.waitForDelay(3000);

        // Better approach: Wait for specific content based on platform
        try {
            const selectors = this.getSelectors(platform);
            await page.waitForSelector(`${selectors.role}, ${selectors.company}, h1`, { 
                timeout: 5000 
            });
        } catch (error) {
            console.log('Specific selectors not found, but continuing with scraping...');
        }

        // Get the HTML content
        const html = await page.content();
        const $ = cheerio.load(html);
        
        return this.extractJobDataFromHTML($, platform);
        
    } catch (error) {
        console.log('Dynamic scraping failed:', error.message);
        return null;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

    // Extract job data from HTML using multiple selectors
    extractJobDataFromHTML($, platform) {
        const jobData = {
            company: '',
            role: '',
            location: '',
            description: '',
            requirements: '',
            salary: ''
        };

        // Platform-specific selectors
        const selectors = this.getSelectors(platform);

        // Extract company name
        jobData.company = this.extractText($, selectors.company) || 
                          this.extractFromMeta($, ['og:site_name', 'twitter:site']) ||
                          this.extractFromTitle($, 'company');

        // Extract job title/role
        jobData.role = this.extractText($, selectors.role) || 
                       this.extractFromMeta($, ['og:title', 'twitter:title']) ||
                       this.extractFromTitle($, 'job');

        // Extract location
        jobData.location = this.extractText($, selectors.location) ||
                          this.extractFromMeta($, ['og:locality', 'twitter:data1']);

        // Extract job description
        jobData.description = this.extractText($, selectors.description, true);

        // Extract requirements
        jobData.requirements = this.extractText($, selectors.requirements, true);

        // Extract salary if available
        jobData.salary = this.extractText($, selectors.salary);

        // Use generic selectors if platform-specific ones didn't work
        if (!jobData.company || !jobData.role) {
            const genericData = this.useGenericSelectors($);
            jobData.company = jobData.company || genericData.company;
            jobData.role = jobData.role || genericData.role;
            jobData.location = jobData.location || genericData.location;
        }

        return jobData;
    }

    // Get platform-specific selectors
    getSelectors(platform) {
        const selectorMap = {
            'LinkedIn': {
                company: '.job-details-jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name a, .job-details-jobs-unified-top-card__company-name',
                role: '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1',
                location: '.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet',
                description: '.job-details-jobs-unified-top-card__job-description, .jobs-description__content',
                requirements: '.job-details-jobs-unified-top-card__job-description, .jobs-description__content',
                salary: '.job-details-jobs-unified-top-card__job-insight'
            },
            'Indeed': {
                company: '[data-testid="inlineHeader-companyName"] a, .jobsearch-InlineCompanyRating a, .jobsearch-CompanyInfoContainer a',
                role: '[data-testid="jobsearch-JobInfoHeader-title"], .jobsearch-JobInfoHeader-title, h1',
                location: '[data-testid="job-location"], .jobsearch-JobInfoHeader-subtitle',
                description: '#jobDescriptionText, .jobsearch-jobDescriptionText',
                requirements: '#jobDescriptionText, .jobsearch-jobDescriptionText',
                salary: '.jobsearch-JobMetadataHeader-item'
            },
            'Glassdoor': {
                company: '.employer-name, [data-test="employer-name"]',
                role: '.job-title, [data-test="job-title"], h1',
                location: '.job-location, [data-test="job-location"]',
                description: '.job-description, [data-test="job-description"]',
                requirements: '.job-description, [data-test="job-description"]',
                salary: '.salary-estimate'
            },
            'Naukri': {
                company: '.jd-header-comp-name, .comp-name',
                role: '.jd-header-title, .job-title, h1',
                location: '.jd-header-comp-loc, .job-location',
                description: '.dang-inner-html, .job-description',
                requirements: '.dang-inner-html, .job-description',
                salary: '.salary'
            }
        };

        return selectorMap[platform] || this.getGenericSelectors();
    }

    // Generic selectors for unknown platforms
    getGenericSelectors() {
        return {
            company: '.company, .company-name, .employer, .organization, [class*="company"], [class*="employer"]',
            role: '.job-title, .title, .position, .role, h1, h2, [class*="title"], [class*="job"]',
            location: '.location, .address, .city, .place, [class*="location"], [class*="address"]',
            description: '.description, .job-description, .content, .details, [class*="description"]',
            requirements: '.requirements, .qualifications, .skills, [class*="requirement"], [class*="qualification"]',
            salary: '.salary, .compensation, .pay, .wage, [class*="salary"], [class*="pay"]'
        };
    }

    // Use generic AI-powered selectors
    useGenericSelectors($) {
        const result = {
            company: '',
            role: '',
            location: ''
        };

        // Try to find company name using various patterns
        const companyPatterns = [
            'h1, h2, h3',
            '[class*="company"], [class*="employer"], [class*="organization"]',
            'a[href*="company"], a[href*="employer"]'
        ];

        // Try to find job title using various patterns
        const titlePatterns = [
            'h1, h2',
            '[class*="title"], [class*="job"], [class*="position"], [class*="role"]'
        ];

        // Try to find location using various patterns
        const locationPatterns = [
            '[class*="location"], [class*="address"], [class*="city"]',
            'span:contains("Remote"), span:contains("Hybrid")'
        ];

        // Extract using patterns
        for (const pattern of companyPatterns) {
            const text = this.extractText($, pattern);
            if (text && this.looksLikeCompany(text)) {
                result.company = text;
                break;
            }
        }

        for (const pattern of titlePatterns) {
            const text = this.extractText($, pattern);
            if (text && this.looksLikeJobTitle(text)) {
                result.role = text;
                break;
            }
        }

        for (const pattern of locationPatterns) {
            const text = this.extractText($, pattern);
            if (text && this.looksLikeLocation(text)) {
                result.location = text;
                break;
            }
        }

        return result;
    }

    // Helper function to extract text using selectors
    extractText($, selectors, fullText = false) {
        if (!selectors) return '';
        
        const selectorArray = selectors.split(', ');
        for (const selector of selectorArray) {
            const element = $(selector).first();
            if (element.length > 0) {
                const text = fullText ? element.text() : element.text().trim();
                if (text) return this.cleanText(text);
            }
        }
        return '';
    }

    // Extract from meta tags
    extractFromMeta($, properties) {
        for (const prop of properties) {
            const content = $(`meta[property="${prop}"]`).attr('content') ||
                           $(`meta[name="${prop}"]`).attr('content');
            if (content) return this.cleanText(content);
        }
        return '';
    }

    // Extract from page title
    extractFromTitle($, type) {
        const title = $('title').text();
        if (!title) return '';

        if (type === 'company') {
            // Look for company indicators in title
            const parts = title.split(/[-|@]/).map(part => part.trim());
            return parts[parts.length - 1] || '';
        } else if (type === 'job') {
            // Job title is usually the first part
            const parts = title.split(/[-|@]/).map(part => part.trim());
            return parts[0] || '';
        }
        
        return '';
    }

    // Validation functions
    looksLikeCompany(text) {
        const companyIndicators = ['inc', 'ltd', 'llc', 'corp', 'company', 'technologies', 'solutions'];
        const lowerText = text.toLowerCase();
        return companyIndicators.some(indicator => lowerText.includes(indicator)) ||
               (text.length > 2 && text.length < 50 && /^[A-Z]/.test(text));
    }

    looksLikeJobTitle(text) {
        const jobIndicators = ['developer', 'engineer', 'manager', 'analyst', 'specialist', 'coordinator', 'lead', 'senior', 'junior'];
        const lowerText = text.toLowerCase();
        return jobIndicators.some(indicator => lowerText.includes(indicator)) ||
               (text.length > 5 && text.length < 100);
    }

    looksLikeLocation(text) {
        const locationIndicators = ['remote', 'hybrid', 'on-site', 'city', 'state', 'country'];
        const lowerText = text.toLowerCase();
        return locationIndicators.some(indicator => lowerText.includes(indicator)) ||
               /\b[A-Z][a-z]+,\s*[A-Z]{2}\b/.test(text) || // City, State pattern
               (text.length > 2 && text.length < 50);
    }

    // Clean extracted text
    cleanText(text) {
        return text
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, ' ')
            .trim()
            .substring(0, 500); // Limit length
    }

    // Check if extracted data is complete
    isDataComplete(jobData) {
        return jobData && 
               jobData.company && 
               jobData.role && 
               jobData.company.length > 2 && 
               jobData.role.length > 5;
    }

    // Clean and validate final job data
    cleanJobData(jobData, url, platform) {
        if (!jobData) {
            return this.createFallbackData(url, platform);
        }

        return {
            company: jobData.company || 'Unknown Company',
            platform: platform,
            jobLink: url,
            role: jobData.role || 'Role',
            location: jobData.location || 'Location',
            status: 'applied',
            notes: '',
            description: jobData.description || '',
            requirements: jobData.requirements || '',
            salary: jobData.salary || ''
        };
    }

    // Create fallback data when scraping fails
    createFallbackData(url, platform = 'Unknown') {
        const domain = new URL(url).hostname.replace('www.', '');
        
        return {
            company: `Company from ${domain}`,
            platform: platform,
            jobLink: url,
            role: 'Role',
            location: 'Location',
            status: 'applied',
            notes: ''
        };
    }
}

module.exports = JobScraper;
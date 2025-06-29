/**************************************************************************
                          Import Modules 
 **************************************************************************/
require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();
const nodemailer = require('nodemailer');
const PORT = process.env.PORT;
const JobScraper = require('./jobScraper');

// Initialize the scraper
const jobScraper = new JobScraper();


const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
});

/******************************************************************************
                       Serve Static Files 
******************************************************************************/
app.use(express.static(path.join(__dirname, '../Client')));

/******************************************************************************
 * Connect to MongoDB
 ******************************************************************************/
const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI)
.then(() => console.log('Connected to MongoDB'))
.catch((err) => console.error('Failed to connect to MongoDB:', err));

/*****************************************************************************
                       Database Schemas & Models
 *****************************************************************************/

// User Schema (you'll need this for authentication)
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Job Application Schema
const jobApplicationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    company: {
        type: String,
        required: true,
        trim: true
    },
    platform: {
        type: String,
        trim: true,
        default: 'Platform'
    },
    jobLink: {
        type: String,
        trim: true
    },
    role: {
        type: String,
        required: true,
        trim: true
    },
    location: {
        type: String,
        trim: true,
        default: 'Location'
    },
    status: {
        type: String,
        enum: ['applied', 'round1', 'round2', 'interview', 'offer', 'rejected'],
        default: 'applied'
    },
    notes: {
        type: String,
        trim: true
    },
    dateAdded: {
        type: Date,
        default: Date.now
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

// Custom Status Schema (for user-defined statuses)
const customStatusSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    statusName: {
        type: String,
        required: true,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create Models
const User = mongoose.model('User', userSchema);
const JobApplication = mongoose.model('JobApplication', jobApplicationSchema);
const CustomStatus = mongoose.model('CustomStatus', customStatusSchema);

/*****************************************************************************
                       Middleware to parse JSON
 *****************************************************************************/
app.use(express.json());

/******************************************************************************
                       Authentication Middleware
 ******************************************************************************/
const JWT_SECRET = process.env.JWT_SECRET;

const authenticate = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(400).json({ error: 'Invalid token.' });
    }
};

// Helper function to validate required fields
function validateRequiredFields(fields) {
    for (const [key, value] of Object.entries(fields)) {
        if (!value || value.trim() === '') {
            return `${key} is required`;
        }
    }
    return null;
}

/*********************************************************************************
                                Routes
*********************************************************************************/

/**************** Job Application Routes ***********************/

// Get all job applications for authenticated user
app.get('/api/applications', authenticate, async (req, res) => {
    try {
        const applications = await JobApplication.find({ userId: req.user._id })
            .sort({ dateAdded: -1 });
        res.json(applications);
    } catch (err) {
        console.error('Error fetching applications:', err);
        res.status(500).json({ error: 'Failed to fetch applications' });
    }
});

// Create new job application
app.post('/api/applications', authenticate, async (req, res) => {
    try {
        const { company, platform, jobLink, role, location, status, notes } = req.body;

        if (!company || !role) {
            return res.status(400).json({ error: 'Company and role are required' });
        }

        const newApplication = new JobApplication({
            userId: req.user._id,
            company,
            platform: platform || 'Platform',
            jobLink,
            role,
            location: location || 'Location',
            status: status || 'applied',
            notes
        });

        await newApplication.save();
        res.status(201).json(newApplication);
    } catch (err) {
        console.error('Error creating application:', err);
        res.status(500).json({ error: 'Failed to create application' });
    }
});

// Update job application (only status and notes)
app.put('/api/applications/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { company, platform, jobLink, role, location, status, notes } = req.body;

        const updateData = {
            lastUpdated: new Date()
        };

        // Allow updating all fields
        if (company !== undefined) updateData.company = company;
        if (platform !== undefined) updateData.platform = platform;
        if (jobLink !== undefined) updateData.jobLink = jobLink;
        if (role !== undefined) updateData.role = role;
        if (location !== undefined) updateData.location = location;
        if (status !== undefined) updateData.status = status;
        if (notes !== undefined) updateData.notes = notes;

        const application = await JobApplication.findOneAndUpdate(
            { _id: id, userId: req.user._id },
            updateData,
            { new: true }
        );

        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        res.json(application);
    } catch (err) {
        console.error('Error updating application:', err);
        res.status(500).json({ error: 'Failed to update application' });
    }
});

// Delete job application
app.delete('/api/applications/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        const application = await JobApplication.findOneAndDelete({
            _id: id,
            userId: req.user._id
        });

        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        res.json({ message: 'Application deleted successfully' });
    } catch (err) {
        console.error('Error deleting application:', err);
        res.status(500).json({ error: 'Failed to delete application' });
    }
});

// Search applications by company name
app.get('/api/applications/search', authenticate, async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const applications = await JobApplication.find({
            userId: req.user._id,
            company: { $regex: query, $options: 'i' }
        }).sort({ dateAdded: -1 });

        res.json(applications);
    } catch (err) {
        console.error('Error searching applications:', err);
        res.status(500).json({ error: 'Failed to search applications' });
    }
});

/**************** Job Scraping Route ***********************/

// Scrape job details from URL
app.post('/api/scrape-job', authenticate, async (req, res) => {
    try {
        const { url } = req.body;

        if (!url || url.trim() === '') {
            return res.status(400).json({ error: 'Job URL is required' });
        }

        // Validate URL format
        let jobUrl;
        try {
            jobUrl = new URL(url);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        console.log(`Scraping job from: ${jobUrl.href}`);
        
        // Set loading state
        const scrapingStartTime = Date.now();
        
        // Scrape job details
        const jobData = await jobScraper.scrapeJobDetails(jobUrl.href);
        
        const scrapingTime = Date.now() - scrapingStartTime;
        console.log(`Scraping completed in ${scrapingTime}ms`);

        if (!jobData) {
            return res.status(500).json({ error: 'Failed to scrape job details' });
        }

        // Create the job application in the database
        const newApplication = new JobApplication({
            userId: req.user._id,
            company: jobData.company,
            platform: jobData.platform || 'Auto-scraped',
            jobLink: jobUrl.href,
            role: jobData.role,
            location: jobData.location || 'Not specified',
            status: jobData.status || 'applied',
            notes: jobData.notes || ''
        });

        await newApplication.save();

        // Return the created application with scraping metadata
        res.status(201).json({
            application: newApplication,
            scrapingMetadata: {
                platform: jobData.platform,
                scrapingTime: scrapingTime,
                additionalData: {
                    description: jobData.description,
                    requirements: jobData.requirements,
                    salary: jobData.salary
                }
            }
        });

    } catch (error) {
        console.error('Error scraping job:', error);
        
        // If scraping fails, create a basic entry with the URL
        try {
            const domain = new URL(req.body.url).hostname.replace('www.', '');
            const fallbackApplication = new JobApplication({
                userId: req.user._id,
                company: `Company from ${domain}`,
                platform: 'Platform',
                jobLink: req.body.url,
                role: 'Role',
                location: 'Location',
                status: 'applied',
                notes: ''
            });

            await fallbackApplication.save();
            
            res.status(201).json({
                application: fallbackApplication,
                warning: 'Scraping failed, basic entry created. Please update details manually.'
            });
        } catch (fallbackError) {
            console.error('Fallback creation failed:', fallbackError);
            res.status(500).json({ error: 'Failed to scrape job details and create fallback entry' });
        }
    }
});

// Get scraping status (for long-running scrapes)
app.get('/api/scraping-status/:jobId', authenticate, async (req, res) => {
    try {
        const { jobId } = req.params;
        
        // In a real implementation, you might store scraping status in Redis or database
        // For now, we'll just check if the job exists
        const application = await JobApplication.findOne({
            _id: jobId,
            userId: req.user._id
        });

        if (!application) {
            return res.status(404).json({ error: 'Job application not found' });
        }

        res.json({
            status: 'completed',
            application: application
        });
    } catch (error) {
        console.error('Error checking scraping status:', error);
        res.status(500).json({ error: 'Failed to check scraping status' });
    }
});



/**************** Custom Status Routes ***********************/

// Get custom statuses for user
app.get('/api/custom-statuses', authenticate, async (req, res) => {
    try {
        const customStatuses = await CustomStatus.find({ userId: req.user._id })
            .sort({ createdAt: 1 });
        res.json(customStatuses);
    } catch (err) {
        console.error('Error fetching custom statuses:', err);
        res.status(500).json({ error: 'Failed to fetch custom statuses' });
    }
});

// Create new custom status
app.post('/api/custom-statuses', authenticate, async (req, res) => {
    try {
        const { statusName } = req.body;

        if (!statusName || statusName.trim() === '') {
            return res.status(400).json({ error: 'Status name is required' });
        }

        // Check if status already exists for this user
        const existingStatus = await CustomStatus.findOne({
            userId: req.user._id,
            statusName: statusName.trim().toLowerCase()
        });

        if (existingStatus) {
            return res.status(400).json({ error: 'Status already exists' });
        }

        const newStatus = new CustomStatus({
            userId: req.user._id,
            statusName: statusName.trim()
        });

        await newStatus.save();
        res.status(201).json(newStatus);
    } catch (err) {
        console.error('Error creating custom status:', err);
        res.status(500).json({ error: 'Failed to create custom status' });
    }
});

// Delete custom status
app.delete('/api/custom-statuses/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        const status = await CustomStatus.findOneAndDelete({
            _id: id,
            userId: req.user._id
        });

        if (!status) {
            return res.status(404).json({ error: 'Custom status not found' });
        }

        res.json({ message: 'Custom status deleted successfully' });
    } catch (err) {
        console.error('Error deleting custom status:', err);
        res.status(500).json({ error: 'Failed to delete custom status' });
    }
});

/**************** User Profile Routes ***********************/

// Get user profile
app.get('/api/profile', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        console.error('Error fetching profile:', err);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});


/****************Route to handle feedback submissions***********************/
app.post('/api/feedback', async (req, res) => {
    try {
        const { feedback, email, Name } = req.body;
        const defaultEmail = process.env.FEEDBACK_EMAIL || process.env.EMAIL_USER; 
        
        if (!feedback || feedback.trim() === '') {
            return res.status(400).json({ error: 'Feedback content is required' });
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: defaultEmail,
            subject: 'JobTrail Feedback',
            html: `
                <h2>New Feedback Received</h2>
                <p><strong>Feedback:</strong> ${feedback}</p>
                ${Name ? `<p><strong>User Name:</strong> ${Name}</p>` : '<p><strong>User Name:</strong> Not provided</p>'}
                ${email ? `<p><strong>User Email:</strong> ${email}</p>` : '<p><strong>User Email:</strong> Not provided</p>'}
                <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
            `
        };
        
        await transporter.sendMail(mailOptions);
        console.log('Feedback email sent successfully');
        
        res.status(200).json({ message: 'Feedback submitted successfully' });
    } catch (err) {
        console.error('Error submitting feedback:', err);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

/**************** Route to login a user***********************/ 
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign({ _id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, username: user.username });
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ error: 'Failed to login' });
    }
});

/****************Route to register a new user***********************/
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        const validationError = validateRequiredFields({ username, password });
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error('Error during registration:', err);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

/******************************************
            Start The Server 
 ******************************************/
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
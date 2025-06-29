# Job Application Tracker

A full-stack web application that automates job application tracking by extracting job details from URLs and providing comprehensive management capabilities.

## Features

* **Secure User Management**: Complete user account system with authentication and data protection
* **One-Click Job Tracking**: Automatically extract job details from URLs including company name, position, and requirements
* **Flexible Status Management**: Create and customize application statuses to match your workflow
* **Manual Entry Support**: Add job applications manually when URLs aren't available
* **Centralized Dashboard**: View all applications with sorting and filtering capabilities
* **Email Integration**: Feedback system for user communication

## Technologies Used

**Backend**
* Node.js
* Express.js
* MongoDB (with Mongoose)
* JWT for authentication
* Bcrypt for password hashing
* Nodemailer for email functionality

**Frontend**
* HTML, CSS (Tailwind CSS), JavaScript
* Frontend code is served statically from the server

## Installation and Setup

1. **Clone the repository**

```
git clone https://github.com/your-username/job-application-tracker.git
```

```
cd job-application-tracker
```

2. **Install dependencies**

```
npm install
```

3. **Create a .env file in the root directory with the following variables**

```
PORT=3000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_email_app_password
FEEDBACK_EMAIL=email_to_receive_feedback
```

4. **Start the server**

```
npm start
```

5. **Access the application**
Open your browser and navigate to `http://localhost:3000`

## Contact

Your Name - adityagirish812@gmail.com
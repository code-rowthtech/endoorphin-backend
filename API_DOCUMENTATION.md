# Endoorphin Backend API Documentation & Explanation

This document provides a comprehensive explanation of the **Endoorphin** backend architecture, database schemas, and API features.

## Project Architecture

The backend is built using **Node.js** and **Express.js**, connected to a **MongoDB** database. The folder structure follows standard MVC (Model-View-Controller) principles:
- **`src/app.js` & `src/server.js`**: Application entry points and configuration.
- **`src/routes/`**: Defines API endpoints and maps them to controllers, with route protection and input validation (using `express-validator`).
- **`src/controllers/`**: Contains the core business logic. Uses an `asyncWrapper` to automatically catch errors and pass them to the global error handler.
- **`src/models/`**: Mongoose schemas defining the structure of the MongoDB collections.
- **`src/middlewares/`**: Contains `auth.middleware.js` for JWT and Role-Based Access Control, `upload.middleware.js` using `multer` for multipart form file uploads, and a global error handler.

## Authentication & Authorization

The system uses a **Passwordless OTP-based authentication** flow:
1. User requests an OTP via `/api/auth/send-otp`.
2. Backend generates a 6-digit OTP, hashes it using `bcryptjs`, and stores it in the `OTP` collection with a 5-minute expiry.
3. User submits the OTP to `/api/auth/verify-otp`.
4. If valid, the backend creates a new `User` (if they don't exist) and issues a **JWT** (JSON Web Token).
5. For new users, they must hit `/api/auth/register` to set their `fullName` and `role`.

### User Roles
- **Explorer**: A standard user searching for venues and trainers.
- **Trainer**: A fitness professional who can create a `TrainerProfile`.
- **Venue Owner**: A business owner who can register one or multiple `VenueProfile`s.

The `auth.middleware.js` exports `protect` (to ensure the token is valid) and `restrictTo(...roles)` (to ensure the user has specific roles for certain actions).

## Core Domain Models

### 1. User
Stores basic authentication details, the chosen role, and verification status.

### 2. TrainerProfile
Associated 1-to-1 with a User (where role = 'trainer').
- **Geo-Location**: Contains `serviceAreas`, which uses a `2dsphere` index for location-based searching.
- **Details**: Tracks `yearsOfExperience`, `categories` (specialties), `certifications`, `galleryImages`, and different `serviceTypes` (e.g., In-Person, Home Visit).
- **Profile Completion**: Contains a method to calculate the completion percentage based on filled fields.

### 3. VenueProfile
Created by a User (where role = 'venue_owner'). A single owner can have multiple venues.
- **Geo-Location**: Contains a `location` field (Point coordinates) with a `2dsphere` index.
- **Details**: Tracks `companyName`, `address`, `venueImages`, `logo`, etc.
- **Relations**: Venues can have an array of linked `services`, `amenities`, and `staff`.

### 4. Supporting Models
- **Service**: A specific offering (e.g., "Personal Training") linked to either a Venue or Trainer.
- **Amenity**: Features available at a Venue (e.g., "Locker Room").
- **Staff**: Team members working at a specific Venue.
- **Category**: System-wide tags that classify trainers or venues (e.g., "Yoga", "Gym").
- **Favorite**: Allows users to save/bookmark specific Trainers or Venues.

## Search Functionality

The application includes robust location-based search capabilities.

- **Unified Search (`/api/search`)**: Allows searching across both `trainers` and `venues` using a single text search string and/or geographic coordinates. It utilizes MongoDB's Aggregation Framework (`$geoNear`) to sort results by proximity (`distanceInMeters`) and filters by search text.
- **Nearby Search (`/api/search/nearby`)**: Returns all trainers and venues within a specific radius for mapping interfaces.

## File Uploads

File uploads are handled by `multer` in the `upload.middleware.js`. It supports both single (`uploadSingle`) and multiple (`uploadArray`) file uploads. Uploaded files are currently stored locally in an `uploads/` directory and served statically.

## The Postman Collection

A complete Postman collection has been generated and saved at the root of the project as `Endoorphin_API.postman_collection.json`. 

### Setting up Postman
1. Open Postman and click **Import**.
2. Select the `Endoorphin_API.postman_collection.json` file.
3. The collection is configured with Collection Variables. Update the `token` variable after logging in to automatically authenticate all protected requests.
4. If testing file uploads (like "Create Trainer Profile"), ensure you re-attach a local file to the request body in Postman, as file references don't persist during import.

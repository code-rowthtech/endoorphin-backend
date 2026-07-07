# Endoorphin Backend API

A fitness marketplace backend connecting **Fitness Explorers**, **Trainers**, and **Venue Owners**.

Built with Node.js, Express, MongoDB (Mongoose), and JWT authentication.

---

## Tech Stack

- **Runtime**: Node.js v18+
- **Framework**: Express.js
- **Database**: MongoDB + Mongoose
- **Auth**: JWT (mobile number + OTP flow)
- **File Uploads**: Multer (local /uploads directory)
- **Validation**: express-validator
- **Logging**: Morgan
- **Other**: bcryptjs, cors, dotenv

---

## Project Structure

```
endoorphin-backend/
├── src/
│   ├── config/
│   │   ├── db.js              # MongoDB connection
│   │   └── env.js             # Environment config
│   ├── controllers/           # Route handler logic
│   ├── middlewares/
│   │   ├── auth.middleware.js   # JWT protect + restrictTo
│   │   ├── error.middleware.js  # Centralized error handler
│   │   ├── upload.middleware.js # Multer config
│   │   └── validate.middleware.js
│   ├── models/                # Mongoose schemas
│   ├── routes/                # Express routers
│   ├── seed/
│   │   └── seed.js            # Database seeder
│   ├── utils/
│   │   ├── asyncWrapper.js
│   │   ├── apiResponse.js
│   │   ├── generateOTP.js
│   │   ├── generateToken.js
│   │   └── distanceCalculator.js
│   ├── app.js                 # Express app setup
│   └── server.js              # Server entry point
├── uploads/                   # Uploaded files (served statically)
├── .env                       # Your local environment variables
├── .env.example               # Environment variable template
├── Endoorphin.postman_collection.json
├── Endoorphin.postman_environment.json
└── README.md
```

---

## Setup & Installation

### Prerequisites

- Node.js v18+
- MongoDB running locally or a MongoDB Atlas URI

### 1. Clone / Navigate to the project

```bash
cd endoorphin-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/endoorphin
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=7d
OTP_EXPIRY_MINUTES=5
NODE_ENV=development
```

| Variable           | Description                              | Default                                    |
|--------------------|------------------------------------------|--------------------------------------------|
| PORT               | Server port                              | 5000                                       |
| MONGO_URI          | MongoDB connection string                | mongodb://localhost:27017/endoorphin       |
| JWT_SECRET         | Secret key for signing JWTs             | (required)                                 |
| JWT_EXPIRES_IN     | JWT expiry duration                      | 7d                                         |
| OTP_EXPIRY_MINUTES | OTP validity window in minutes           | 5                                          |
| NODE_ENV           | Environment (`development`/`production`) | development                                |

---

## Running the Server

### Development

```bash
npm run dev
```

The server starts at `http://localhost:5000`.

Health check: `GET http://localhost:5001/health`

### Seed the Database

Populate the database with sample categories, users, trainers, venues, and services:

```bash
npm run seed
```

After seeding, these test accounts are available (OTP is always `1234` in dev mode):

| Role        | Phone Number | Name           |
|-------------|--------------|----------------|
| Explorer    | 9876543210   | Arjun Sharma   |
| Trainer     | 9876543220   | Vikram Singh   |
| Venue Owner | 9876543230   | Suresh Gupta   |

---

## Auth Flow

1. `POST /api/auth/send-otp` — Request OTP for a phone number
2. `POST /api/auth/verify-otp` — Verify OTP → receive JWT token
3. `POST /api/auth/register` — Complete signup with name + role (explorer / trainer / venue_owner)
4. Use `Authorization: Bearer <token>` header on all protected routes

> In development mode, the OTP is always `1234` and is also returned in the response for easy testing.

---

## API Reference

### Base URL
```
http://localhost:5001/api
```

### Response Format

All responses follow this consistent shape:

**Success:**
```json
{
  "success": true,
  "message": "Human-readable message",
  "data": { }
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error description",
  "error": { }
}
```

### Endpoint Groups

| Group            | Base Path              |
|------------------|------------------------|
| Auth             | /api/auth              |
| Users            | /api/users             |
| Trainer Profiles | /api/trainers          |
| Venue Profiles   | /api/venues            |
| Services         | /api/services          |
| Amenities        | /api/venues/:id/amenities / /api/amenities |
| Staff            | /api/venues/:id/staff / /api/staff |
| Categories       | /api/categories        |
| Search           | /api/search            |
| Favorites        | /api/favorites         |
| Upload           | /api/upload            |

---

## Geo Search

Both `VenueProfile` and `TrainerProfile` support distance-based search using MongoDB 2dsphere indexes.

Pass `lat`, `lng`, `minDistance`, and `maxDistance` (in miles) to any list/search endpoint:

```
GET /api/search?type=all&lat=19.0558&lng=72.8351&minDistance=0&maxDistance=15
GET /api/trainers?lat=19.0596&lng=72.8369&maxDistance=20
GET /api/venues?lat=19.0558&lng=72.8351&maxDistance=10
GET /api/search/nearby?lat=19.0558&lng=72.8351&radius=10
```

Results include a `distanceInMiles` computed field.

---

## File Uploads

Files are stored locally in the `/uploads` directory and served at:
```
http://localhost:5000/uploads/<filename>
```

Accepted formats: JPG, JPEG, PNG, GIF (max 10MB each)

Upload endpoints:
- `POST /api/trainers/:id/certifications` — cert file (`certFile` field)
- `POST /api/trainers/:id/gallery` — gallery images (`galleryImages` field, multiple)
- `POST /api/venues/:id/logo` — venue logo (`logo` field)
- `POST /api/venues/:id/images` — venue images (`venueImages` field, multiple, max 15)
- `POST /api/venues/:id/staff` / `PUT /api/staff/:id` — staff photo (`photo` field)
- `POST /api/upload` — generic upload (`file` or `files` field)

---

## Postman Collection

### Import Steps

1. Open Postman
2. Click **Import**
3. Select `Endoorphin.postman_collection.json`
4. Also import `Endoorphin.postman_environment.json`
5. Select the **Endoorphin - Local** environment in Postman

### Quick Test Flow

1. Run **Send OTP** with phone `9876543210`
2. Run **Verify OTP** with OTP `1234` → token is auto-saved to `{{token}}`
3. Copy the returned user `_id` and set it as `{{userId}}`
4. Explore all other endpoints using the saved token

---

## Roles

| Role         | Key          | Can do                              |
|--------------|--------------|-------------------------------------|
| Explorer     | `explorer`   | Browse, search, favorite            |
| Trainer      | `trainer`    | Manage trainer profile              |
| Venue Owner  | `venue_owner`| Manage venues, staff, amenities     |

Role is set at registration and is immutable.

---

## License

MIT
"# endoorphin-backend" 

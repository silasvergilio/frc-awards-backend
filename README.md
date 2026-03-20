# FRC Awards Backend

Backend API for managing FRC (FIRST Robotics Competition) awards, teams, events, and judges. Built to support the [FRC Awards Frontend](https://github.com/Silver-Robotics/frc-awards-front), this service handles event registration via the FIRST API, team management, award nominations, and judge assignments.

## Table of Contents

- [Technologies](#technologies)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
  - [Index](#index)
  - [Users](#users)
  - [Events](#events)
  - [Teams](#teams)
  - [Awards](#awards)
  - [Judges](#judges)
  - [Order](#order)
- [Database](#database)
- [File Uploads](#file-uploads)
- [CORS Configuration](#cors-configuration)

## Technologies

- **Runtime:** [Node.js](https://nodejs.org/)
- **Framework:** [Express.js](https://expressjs.com/) v4
- **Database:** MySQL (via [mysql2](https://www.npmjs.com/package/mysql2))
- **Authentication:** [Auth0](https://auth0.com/) (OAuth 2.0 JWT) via [express-oauth2-jwt-bearer](https://www.npmjs.com/package/express-oauth2-jwt-bearer), with legacy [Passport.js](http://www.passportjs.org/) local strategy support
- **File Uploads:** [Multer](https://www.npmjs.com/package/multer) (local disk storage for awards, memory storage for teams)
- **Cloud Storage:** [AWS S3](https://aws.amazon.com/s3/) via AWS SDK v2 and v3
- **External API:** [FIRST API](https://frc-api.firstinspires.org/) (FRC and FTC event/team data)
- **Session Management:** [express-session](https://www.npmjs.com/package/express-session) with [memorystore](https://www.npmjs.com/package/memorystore)
- **View Engine:** [Pug](https://pugjs.org/)
- **Password Hashing:** [bcrypt](https://www.npmjs.com/package/bcrypt)
- **HTTP Client:** [Axios](https://axios-http.com/)
- **UUID Generation:** [uuid](https://www.npmjs.com/package/uuid) (v4)
- **Dev Tooling:** [Nodemon](https://nodemon.io/)

## Prerequisites

- **Node.js** (v14 or higher recommended)
- **npm**
- **MySQL** database instance (e.g., local, Railway, or any cloud-hosted MySQL)

## Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Server
PORT=3000

# Database
DB_HOST=your_database_host
DB_USER=your_database_user
DB_PASS=your_database_password
DB_NAME=your_database_name
DB_PORT=3306

# AWS S3 (for file uploads)
BUCKETEER_AWS_ACCESS_KEY_ID=your_aws_access_key
BUCKETEER_AWS_SECRET_ACCESS_KEY=your_aws_secret_key
BUCKETEER_AWS_REGION=your_aws_region
BUCKETEER_BUCKET_NAME=your_s3_bucket_name
```

## Installation

```bash
# Clone the repository
git clone https://github.com/Silver-Robotics/frc-awards-backend.git

# Navigate to the project directory
cd frc-awards-backend

# Install dependencies
npm install
```

## Running the Application

```bash
# Production
npm start

# Development (with auto-reload via Nodemon)
npm run dev
```

The server will start on the port defined by the `PORT` environment variable (defaults to `3000`).

## Project Structure

```
frc-awards-backend/
├── bin/
│   └── www                  # HTTP server entry point
├── public/                  # Static assets
├── routes/
│   ├── index.js             # Home route
│   ├── users.js             # User authentication & registration
│   ├── events.js            # Event management (FIRST API integration)
│   ├── teams.js             # Team management
│   ├── awards.js            # Award nominations & management
│   ├── judges.js            # Judge management
│   └── order.js             # Award ordering/positioning
├── uploads/
│   └── awards/              # Locally stored award images
├── views/
│   ├── layout.pug           # Base layout template
│   ├── index.pug            # Home page template
│   └── error.pug            # Error page template
├── app.js                   # Express application setup & middleware
├── connection.js            # MySQL connection pool (async, via mysql2)
├── connection-sync.js       # Synchronous MySQL connection (via sync-mysql)
├── dbconfig.js              # Database configuration from environment variables
├── fileparser.js            # S3 file upload stream parser (via formidable + AWS SDK v3)
├── passport-config.js       # Passport.js local strategy configuration
├── package.json             # Project metadata & dependencies
└── .gitignore               # Git ignore rules
```

## Authentication

All API routes are protected by **Auth0 JWT authentication**. Every request must include a valid JWT Bearer token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

Auth0 configuration:
- **Audience:** `https://frc-awards.api`
- **Issuer:** `https://dev-ul3tax4j6cs1npiy.us.auth0.com`
- **Algorithm:** RS256

Some endpoints additionally require an **admin role** (`https://myapp.example.com/roles` must include `"admin"`).

## API Endpoints

All endpoints require JWT authentication unless noted otherwise. Many endpoints require an `eventCode` header to scope data to a specific event.

### Index

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/`  | Renders the home page (Pug template) |

### Users

| Method | Path             | Description |
|--------|------------------|-------------|
| `GET`  | `/users`         | Returns the authenticated user's data |
| `GET`  | `/users/fail`    | Returns a login failure message |
| `GET`  | `/users/success` | Returns the authenticated user's name and permission level |
| `POST` | `/users/login`   | Authenticates a user with username and password (Passport local strategy) |
| `POST` | `/users`         | Registers a new user (requires `userName`, `password`, `repeatPassword`, `permission`, `name` in body) |

### Events

| Method | Path      | Headers Required | Description |
|--------|-----------|------------------|-------------|
| `GET`  | `/events` | `eventCode`      | Retrieves event details by event code |
| `POST` | `/events` | -                | Creates a new event by fetching data from the FIRST API (FRC/FTC), inserts the event and all associated teams into the database. **Requires admin role.** Body: `{ eventCode, program: { value: "frc" \| "ftc" } }` |

### Teams

| Method | Path              | Headers Required | Description |
|--------|-------------------|------------------|-------------|
| `GET`  | `/teams`          | `eventCode`      | Lists all teams for a given event, ordered by team number |
| `GET`  | `/teams/:value`   | -                | Retrieves a specific team by team number |
| `PUT`  | `/teams/:value`   | -                | Updates a specific field for a team (body: `{ visit, newValue }`) |
| `POST` | `/teams`          | -                | Creates a new team. If `?bulk=true`, fetches all teams from the FIRST API for a hardcoded event and bulk-inserts them. Otherwise, inserts a single team (body: `{ state, text, value, school }`) |
| `POST` | `/teams/picture`  | -                | Uploads a team picture to AWS S3 (multipart form with `file` and `bodyReq` fields) |

### Awards

| Method   | Path                        | Headers Required | Description |
|----------|-----------------------------|------------------|-------------|
| `GET`    | `/awards`                   | `eventCode`      | Lists all awards for an event with team details (team number, name, school, state), ordered by sort order |
| `GET`    | `/awards/non-nominated/teams` | `eventCode`    | Lists all teams for an event that have **not** been nominated for any award |
| `POST`   | `/awards`                   | `eventCode`      | Creates a new award nomination (multipart form with optional `image` file; fields: `awardName`, `motive`, `judge`, `category`, `value`) |
| `PUT`    | `/awards`                   | -                | Updates the `nominated` status of an award (body: `{ nominated, id, award }`) |
| `PUT`    | `/awards/awarded`           | -                | Marks an award as awarded/unawarded and updates nomination status of other awards for the same team (body: `{ awarded, id, award }`) |
| `PUT`    | `/awards/order`             | -                | Bulk-updates the sort order of awards (body: `{ awards: [{ id, order }] }`) |
| `DELETE` | `/awards`                   | -                | Deletes an award entry (body: `{ id, award }`) |

### Judges

| Method   | Path                | Headers Required | Description |
|----------|---------------------|------------------|-------------|
| `GET`    | `/judges`           | `eventCode`      | Lists all judges for a given event |
| `POST`   | `/judges`           | `eventCode`      | Adds a new judge to an event. **Requires admin role.** Body: `{ judgeName }` |
| `DELETE` | `/judges/:judgeId`  | -                | Removes a judge from an event. **Requires admin role.** Body: `{ eventCode }` |

### Order

| Method | Path             | Description |
|--------|------------------|-------------|
| `PUT`  | `/order/:award`  | Updates the position/order of a team within an award table (body: `{ position, id }`) |

## Database

The application uses **MySQL** as its database. The connection is configured via environment variables (see [Environment Variables](#environment-variables)).

Two connection modes are available:
- **Async pool** (`connection.js`): Uses `mysql2` with a connection pool (limit of 5 connections). Used for most queries.
- **Sync connection** (`connection-sync.js`): Uses `sync-mysql` for synchronous queries. Used in Passport deserialization.

### Main Tables

| Table    | Description |
|----------|-------------|
| `Users`  | Application users with username, password (bcrypt-hashed), full name, and permission level |
| `Events` | FRC/FTC events with code, name, location, dates, and program type |
| `Teams`  | Teams associated with events, including team number, name, school, state, and visit tracking fields |
| `Awards` | Award nominations linking teams to events, with award name, motive, judge, category, nomination/awarded status, sort order, and optional image |
| `Judges` | Judges assigned to events |

## File Uploads

The application supports two file upload mechanisms:

1. **Local disk storage** (Awards): Award images are saved to `uploads/awards/` with UUID-based filenames. Supported formats: JPEG, PNG. Max file size: 100 MB.

2. **AWS S3** (Teams): Team pictures are uploaded directly to an S3 bucket using the AWS SDK. Supported formats: JPEG, PNG.

The `uploads/` directory is served as a static path, so uploaded award images are accessible at `/uploads/awards/<filename>`.

## CORS Configuration

The API allows cross-origin requests from the following origins:

- `https://frc-awards-front.vercel.app` (production frontend)
- `http://localhost:8081` (local development)
- `http://localhost:8080` (local development)

Allowed methods: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`, `HEAD`

Credentials are enabled for cross-origin requests.

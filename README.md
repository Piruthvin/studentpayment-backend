# Backend API - School Payments

This document describes the backend (Express + MongoDB) API, environment configuration, local setup, and deployment steps.

## Tech stack
- Node.js + Express (ESM)
- MongoDB (Mongoose)
- JWT auth (Bearer)
- Axios (payment API calls)

## Setup and Installation
1) Clone the repo and open the `backend/` folder
2) Copy `.env.example` to `.env` and fill values (see Environment Variables below)
3) Install dependencies
```bash
npm install
```
4) Run in development (auto-restarts on code or .env changes)
```bash
npm run dev
```
Server defaults to `http://localhost:4000`

## Run locally
1) Copy `.env.example` to `.env` and fill values (see Env section below)
2) Install deps: `npm install`
3) Start dev server: `npm run dev` (nodemon watches `src` and `.env`)

Default port: `4000`

## Environment Variable Configuration
See `backend/.env.example` for full list. Important keys:
- `MONGO_URI` (MongoDB Atlas)
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- `PAYMENT_API_BASE` = https://dev-vanilla.edviron.com/erp
- `PAYMENT_API_KEY` = Bearer API key from docs
- `PAYMENT_PG_KEY` = pg_key used to sign JWT payload for Edviron
- `SCHOOL_ID` = default school id for requests
- `APP_BASE_URL` = your frontend base URL
- `DEV_FAKE_GATEWAY` (optional: true/false)
- `DEV_AUTO_CAPTURE` (optional: true/false)

Example `.env` (dev)
```
PORT=4000
MONGO_URI="mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority"
JWT_SECRET="supersecret"
JWT_EXPIRES_IN="1d"
PAYMENT_API_BASE=https://dev-vanilla.edviron.com/erp
PAYMENT_API_KEY="<paste API key>"
PAYMENT_PG_KEY="edvtest01"
SCHOOL_ID="65b0e6293e9f76a9694d84b4"
APP_BASE_URL="http://localhost:5173"
DEV_FAKE_GATEWAY=false
DEV_AUTO_CAPTURE=false
```

## Authentication
- Login to get a JWT and pass it on all protected requests as `Authorization: Bearer <token>`
- Protected routes require role in JWT (admin or student)

## Data models
- `Order` (school_id, student_info, order_amount, custom_order_id, timestamps)
- `OrderStatus` (collect_id -> Order._id, status fields, payment_time, external_collect_request_id)
- `WebhookLog` (headers + body)
- `User` (email, password hash, role)

## API Usage Examples (curl)

Login (get token)
```bash
curl -X POST "http://localhost:4000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin@example.com",
    "password":"secret123"
  }'
```

Create Payment
```bash
curl -X POST "http://localhost:4000/payments/create-payment" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "school_id": "65b0e6293e9f76a9694d84b4",
    "order_amount": 7500,
    "student_info": { "name": "Test", "id": "S123", "email": "test@example.com" }
  }'
```

Check Payment Status (provider)
```bash
curl -X GET "http://localhost:4000/payments/check/<collect_request_id>" \
  -H "Authorization: Bearer <TOKEN>"
```

Webhook (simulate)
```bash
curl -X POST "http://localhost:4000/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "status": 200,
    "order_info": {
      "order_id": "<collect_id or custom_order_id>",
      "order_amount": 2000,
      "transaction_amount": 2200,
      "gateway": "PhonePe",
      "bank_reference": "YESBNK222",
      "status": "success",
      "payment_mode": "upi",
      "payemnt_details": "success@ybl",
      "Payment_message": "payment success",
      "payment_time": "2025-04-23T08:14:21.945+00:00",
      "error_message": "NA"
    }
  }'
```

## Endpoints
Base URL: `http://localhost:4000`

### Auth
- POST `/auth/register`
  - Body:
```json
{
  "email":"admin@example.com",
  "password":"secret123",
  "name":"Admin"
}
```
  - Response: 200 with `{ token, role }`

- POST `/auth/login`
  - Body:
```json
{
  "email":"admin@example.com",//for admin
  "password":"123123"
}
{
  "email":"arun@example.com",//for student
  "password":"123123"
}
```
  - Response: 200 with `{ token, role }`

### Payments
- POST `/payments/create-payment` (roles: student, admin)
  - Headers: `Authorization: Bearer <token>`
  - Body:
```json
{
  "school_id": "65b0e6293e9f76a9694d84b4",
  "order_amount": 7500,
  "student_info": { "name": "Test", "id": "S123", "email": "test@example.com" }
}
```
  - Behavior:
    - DEV_FAKE_GATEWAY=true: returns mock URL or immediate success if DEV_AUTO_CAPTURE=true
    - Otherwise: calls Edviron Create Collect Request:
      - POST `${PAYMENT_API_BASE}/create-collect-request`
      - Headers: `Authorization: Bearer ${PAYMENT_API_KEY}`, `Content-Type: application/json`
      - Body: `{ school_id, amount: "<string>", callback_url, sign }` where `sign` is JWT signed with `PAYMENT_PG_KEY`
  - Response (200):
```json
{
  "custom_order_id": "ORD-...",
  "order_id": "<mongo_id>",
  "payment_page": "<Collect_request_url>",
  "collect_request_id": "6808bc4888e4e3c149e757f1",
  "raw": { /* provider response */ }
}
```

- GET `/payments/check/:collect_request_id` (role: admin)
  - Signs `{ school_id, collect_request_id }` with `PAYMENT_PG_KEY`
  - Calls GET `${PAYMENT_API_BASE}/collect-request/{collect_request_id}?school_id=...&sign=...`
  - Upserts `OrderStatus`
  - Response (200):
```json
{
  "ok": true,
  "data": { "status":"SUCCESS", "amount":100, /* provider data */ },
  "updated": true
}
```

### Webhook
- POST `/webhook` (no auth)
  - Body:
```json
{
  "status": 200,
  "order_info": {
    "order_id": "<collect_id or transaction_id>",
    "order_amount": 2000,
    "transaction_amount": 2200,
    "gateway": "PhonePe",
    "bank_reference": "YESBNK222",
    "status": "success",
    "payment_mode": "upi",
    "payemnt_details": "success@ybl",
    "Payment_message": "payment success",
    "payment_time": "2025-04-23T08:14:21.945+00:00",
    "error_message": "NA"
  }
}
```
  - Response: `{ ok: true }`

### Transactions
- GET `/transactions` (role: admin)
  - Query params: `page, limit, sort, order, status, schoolIds, from, to`
  - Response (200):
```json
{
  "page":1,
  "limit":10,
  "total":100,
  "items":[
    {
      "collect_id":"<mongo_id>",
      "school_id":"SCHOOL-001",
      "school_name":"My School",
      "gateway":"EDV",
      "order_amount":5000,
      "transaction_amount":5000,
      "status":"success",
      "custom_order_id":"ORD-...",
      "payment_time":"2025-09-21T09:55:00Z",
      "payment_mode":"upi",
      "student_name":"Student 1",
      "student_id":"SID1001",
      "phone":"999...",
      "vendor_amount":null,
      "capture_status":null,
      "external_collect_request_id":"6808bc48..."
    }
  ]
}
```

- GET `/transactions/school/:schoolId` (role: admin)
  - Response: `{ total, items: [...] }` same fields as above

- GET `/transactions/status/:custom_order_id` (role: admin or student)
  - Response: single aggregated object for that order

## Deployment (Render)
- Create a new Web Service, link repo `backend/` directory
- Environment: set all keys from `.env.example`
- Build command: (none)
- Start command: `node src/server.js`
- Enable auto-deploys

## Postman collection
File: `backend/postman/collection.json`
- Set `{{base}}` to your backend URL
- `{{token}}` = JWT from Login

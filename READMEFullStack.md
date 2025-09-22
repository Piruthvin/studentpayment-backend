# School Payment and Dashboard (Full Stack)

This repository contains a minimal full‑stack implementation of the assessment:
- Backend: Node.js + Express + MongoDB (JWT secured)
- Frontend: React + Vite

Both parts are intentionally concise and easy to understand while meeting the functional requirements.

## Project Structure

- `backend/` Express API with MongoDB models, JWT auth, payment integration, and webhooks
- `frontend/` React dashboard with transactions list, filters, by-school view, and status check

## Quick Start

1) Clone and configure environment variables

- Copy `backend/.env.example` to `backend/.env` and fill values:
  - `MONGO_URI` (MongoDB Atlas)
  - `JWT_SECRET`
  - `PAYMENT_API_BASE` (from API docs)
  - `PAYMENT_API_KEY` (given in the task)
  - `PAYMENT_PG_KEY` (pg_key)
  - `SCHOOL_ID` (default)
  - `APP_BASE_URL` (frontend base, e.g., http://localhost:5173)

- Copy `frontend/.env.example` to `frontend/.env` and adjust `VITE_API_BASE` if needed

2) Install and run

- Backend
  - `npm install` inside `backend/`
  - `npm run dev` (default port 4000)

- Frontend
  - `npm install` inside `frontend/`
  - `npm run dev` (default port 5173)

## Consolidated API Reference (Backend)
Base URL: `http://localhost:4000`

### Auth
- POST `/auth/register`
  - Request
    ```json
    { "email": "admin@example.com", "password": "secret123", "name": "Admin" }
    ```
  - Response 200
    ```json
    { "token": "<jwt>", "role": "admin" }
    ```

- POST `/auth/login`
  - Request
    ```json
    { "email": "admin@example.com", "password": "secret123" }
    ```
  - Response 200
    ```json
    { "token": "<jwt>", "role": "admin" }
    ```

### Payments
- POST `/payments/create-payment` (roles: student, admin)
  - Headers: `Authorization: Bearer <token>`
  - Request
    ```json
    {
      "school_id": "65b0e6293e9f76a9694d84b4",
      "order_amount": 7500,
      "student_info": { "name": "Test", "id": "S123", "email": "test@example.com" }
    }
    ```
  - Response 200
    ```json
    {
      "custom_order_id": "ORD-...",
      "order_id": "<mongo_id>",
      "payment_page": "<Collect_request_url>",
      "collect_request_id": "6808bc48...",
      "raw": { /* provider */ }
    }
    ```

- GET `/payments/check/:collect_request_id` (role: admin)
  - Signs `{ school_id, collect_request_id }` with `PAYMENT_PG_KEY` and queries provider
  - Response 200
    ```json
    { "ok": true, "data": { "status": "SUCCESS", "amount": 100 }, "updated": true }
    ```

### Webhook
- POST `/webhook`
  - Request
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
  - Response 200
    ```json
    { "ok": true }
    ```

### Transactions
- GET `/transactions` (role: admin)
  - Query: `page, limit, sort, order, status, schoolIds, from, to`
  - Response 200
    ```json
    {
      "page": 1,
      "limit": 10,
      "total": 100,
      "items": [
        {
          "collect_id": "<mongo_id>",
          "school_id": "SCHOOL-001",
          "school_name": "My School",
          "gateway": "EDV",
          "order_amount": 5000,
          "transaction_amount": 5000,
          "status": "success",
          "custom_order_id": "ORD-...",
          "payment_time": "2025-09-21T09:55:00Z",
          "payment_mode": "upi",
          "student_name": "Student 1",
          "student_id": "SID1001",
          "phone": "999...",
          "vendor_amount": null,
          "capture_status": null,
          "external_collect_request_id": "6808bc48..."
        }
      ]
    }
    ```

- GET `/transactions/school/:schoolId` (role: admin)
  - Response: `{ total, items: [...] }`

- GET `/transactions/status/:custom_order_id` (role: admin or student)
  - Response: single aggregated object for that order

## Frontend Overview
- `Transactions` page with multi-select filters for status and school, date range, CSV export, and Check status action.
- `BySchool` page with dropdown and per-row Check action.
- `Status` route for viewing a single order status.
- `Pay` page for students to create a payment.

## Deployment

### Backend (Render)
- Create a Web Service from the `backend/` folder
- Environment variables: copy from `backend/.env.example`
- Start command: `node src/server.js`
- Confirm CORS allows your frontend origin

### Frontend (Netlify)
- Set `VITE_API_BASE` to your backend public URL
- Build command: `npm run build`
- Publish directory: `dist`
- `frontend/netlify.toml` includes SPA fallback and sample `/api/*` proxy

## Postman Collection
File: `backend/postman/collection.json`
- Set `{{base}}` and `{{token}}`

## Notes
- Indexes: important fields are indexed for performance.
- Security: JWT-protected endpoints, input validation via `express-validator`.
- Logging: requests via `morgan`, webhook payloads persisted in `WebhookLog`.

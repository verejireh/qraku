# QR Order System MVP

## Project Structure
- `backend/`: FastAPI application (Port 8000)
- `frontend/`: Vue.js application (Port 5173)

## Prerequisites
- Python 3.9+
- Node.js 18+
- `uv` (for python virtualenv)

## Setup & Run

### 1. Backend
Dependencies are installed via `uv`.
To run manually:
```bash
cd backend
..\.venv\Scripts\activate
uvicorn main:app --reload
```

### 2. Frontend
Dependencies need to be installed.
```bash
cd frontend
npm install
npm run dev
```
> **Note**: If `npm install` failed during setup, please run it manually.

### 3. One-click Start
Run `start_all.bat` in the root directory.

## Features Implemented
- **Backend**:
  - Database Models (Store, Table, Menu, Order, Customer)
  - API Routers (Stores, Menus, Orders, QR)
  - WebSocket for Kitchen notifications
  - Initial data generation (`backend/init_data.py`)

- **Frontend**:
  - Home View: Welcome screen
  - Order View (`/order/:tableId`): Menu list & Ordering (UI only, API integration ready)
  - Kitchen View (`/kitchen`): Real-time order dashboard via WebSocket

## Next Steps
- Complete payment integration logic.
- Admin dashboard for statistics.
- Antigravity packaging for Kitchen app.
# qraku
# qraku

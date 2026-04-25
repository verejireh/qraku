@echo off
f:
cd f:\myproject\orderservice
call .venv\Scripts\activate
cd backend
uvicorn main:app --reload --port 8003 > backend.log 2>&1

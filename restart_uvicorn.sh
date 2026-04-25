pkill -f "uvicorn"
pkill -f "8003"
sleep 2
cd ~/qr-order-system || exit 1
nohup .venv/bin/python3 -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8003 > backend.log 2>&1 &
sleep 2
tail -n 20 backend.log

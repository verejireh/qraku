import subprocess
import time

cmd = ['ssh', '-i', 'qraku', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=5', 'verejireh@35.213.6.149', 
       "tail -n 50 ~/qr-order-system/backend.log && sudo pkill -f uvicorn || true"]

for i in range(15):
    print(f"Attempt {i+1}...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        print("STDOUT:\n", result.stdout)
        print("Successfully fetched log and killed uvicorn.")
        break
    else:
        print(f"Failed. STDERR: {result.stderr.strip()}")
    time.sleep(2)

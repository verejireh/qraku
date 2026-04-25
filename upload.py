import subprocess
import base64

with open("backend/database.py", "rb") as f:
    content_b64 = base64.b64encode(f.read()).decode('utf-8')

py_script = f"""import base64
open('/home/verejireh/qr-order-system/backend/database.py', 'wb').write(base64.b64decode('{content_b64}'))
print("File patched successfully!")
"""

print("Uploading database.py via stdin to SSH python3...")
ssh_proc = subprocess.Popen(
    ['ssh', '-i', 'qraku', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', 'verejireh@35.213.6.149', 'python3'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    encoding='utf-8'
)
out, err = ssh_proc.communicate(input=py_script)
print(f"STDOUT: {out}")
print(f"STDERR: {err}")

print("Restarting server...")
reboot_proc = subprocess.Popen(
    ['ssh', '-i', 'qraku', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', 'verejireh@35.213.6.149', 'cd ~/qr-order-system && bash setup_server.sh'],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    encoding='utf-8'
)
r_out, r_err = reboot_proc.communicate()
print(f"Restart STDOUT: {r_out}")
print(f"Restart STDERR: {r_err}")

print("Restarting server...")
reboot_cmd = ['ssh', '-i', 'qraku', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', 'verejireh@35.213.6.149', "cd ~/qr-order-system && bash setup_server.sh"]
res2 = subprocess.run(reboot_cmd, capture_output=True, text=True)
print("Restart result:", res2.returncode)
if res2.stderr:
    print("stderr2:", res2.stderr)

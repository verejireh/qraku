import paramiko, time

key = paramiko.RSAKey.from_private_key_file("qraku")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("35.213.6.149", username="verejireh", pkey=key)

time.sleep(5)  # Wait for server to boot

commands = [
    "sudo systemctl status qrorder.service 2>&1 | head -10",
    "echo '=== CURL TEST ==='",
    'curl -s -o /dev/null -w "%{http_code}" http://localhost:8003/super-admin',
]
cmd = " && ".join(commands)
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print("STDERR:", err)
ssh.close()

import os
import zipfile
import subprocess
import time
import sys
import threading

# Windows에서 cp932/cp949 인코딩 에러 방지
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# subprocess 환경: ANSI 컬러 비활성화 + UTF-8 강제
_SUBPROCESS_ENV = {**os.environ, "NO_COLOR": "1", "FORCE_COLOR": "0", "PYTHONIOENCODING": "utf-8"}

# --- 설정 사항 ---
PROJECT_NAME = "qr-order-system"
SERVER_USER = "verejireh"  # GCP 서버 사용자명으로 변경하세요
SERVER_IP = "35.213.6.149"   # GCP 서버 외부 IP로 변경하세요
REMOTE_DIR = f"~/{PROJECT_NAME}"
ZIP_FILENAME = "deploy_package.zip"
SSH_KEY_PATH = os.path.join(os.path.dirname(__file__), "..", "qraku")  # 프로젝트 상위 폴더의 qraku 키

# 제외할 폴더 및 파일
EXCLUDE_DIRS = {".venv", "node_modules", "__pycache__", ".git", ".agent", ".gemini", "stitch_designs", "temp"}
EXCLUDE_FILES = {ZIP_FILENAME, ".DS_Store", "backend.log", ".env"}
EXCLUDE_EXTENSIONS = {".db", ".db-shm", ".db-wal"}  # SQLite 파일 절대 배포 금지

def create_deploy_package():
    print(f"[{PROJECT_NAME}] 로컬 프론트엔드 빌드 수행 중... (수 초 소요)")
    try:
        subprocess.run("npm install && npm run build", shell=True, check=True, cwd="frontend-react", env=_SUBPROCESS_ENV)
        print("✅ 로컬 빌드 성공!")
    except subprocess.CalledProcessError as e:
        print(f"❌ 로컬 빌드 실패: {e}\n빌드 에러를 먼저 해결해주세요!")
        return False

    print(f"[{PROJECT_NAME}] 배포 패키지 생성 중...")
    start_time = time.time()
    
    with zipfile.ZipFile(ZIP_FILENAME, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # 프로젝트 루트의 backend, frontend-react, uv 메타파일, 셸 스크립트 포함
        for target in ['backend', 'frontend-react', 'setup_server.sh', 'pyproject.toml', 'uv.lock']:
            if not os.path.exists(target):
                continue
                
            if os.path.isfile(target):
                zipf.write(target)
            else:
                for root, dirs, files in os.walk(target):
                    # 제외 폴더 필터링
                    dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
                    
                    for file in files:
                        if file in EXCLUDE_FILES:
                            continue
                        # SQLite DB 파일 제외 (확장자 체크)
                        if any(file.endswith(ext) for ext in EXCLUDE_EXTENSIONS):
                            print(f"  [SKIP] SQLite 파일 제외: {file}")
                            continue
                        file_path = os.path.join(root, file)
                        zipf.write(file_path)
    
    duration = time.time() - start_time
    print(f"압축 완료: {ZIP_FILENAME} ({duration:.2f}초)")

def run_command(cmd, shell=True):
    try:
        subprocess.run(cmd, shell=shell, check=True)
    except subprocess.CalledProcessError as e:
        print(f"오류 발생: {e}")
        return False
    return True

def deploy():
    # 1. 패키지 생성
    if create_deploy_package() is False:
        return
    
    # 2. Paramiko 라이브러리를 사용한 자동 배포
    print("\n[Paramiko] 서버 SSH 자동 접속을 시도합니다...")
    # 프로젝트 .venv가 있으면 해당 Python을 sys.path에 추가하여 paramiko 인식
    _venv_site = os.path.join(os.path.dirname(__file__), ".venv", "Lib", "site-packages")
    if os.path.isdir(_venv_site) and _venv_site not in sys.path:
        sys.path.insert(0, _venv_site)

    try:
        import paramiko
    except ImportError:
        print("💡 paramiko 라이브러리가 설치되어 있지 않습니다. 자동으로 설치합니다...")
        _venv_python = os.path.join(os.path.dirname(__file__), ".venv", "Scripts", "python.exe")
        installed = False
        # 프로젝트 .venv Python으로 설치 시도
        if os.path.exists(_venv_python):
            try:
                subprocess.run([_venv_python, "-m", "pip", "install", "paramiko"], check=True, env=_SUBPROCESS_ENV)
                installed = True
            except subprocess.CalledProcessError:
                pass
        if not installed:
            # uv로 .venv에 설치
            try:
                subprocess.run(["uv", "pip", "install", "paramiko", "--python", _venv_python], check=True, env=_SUBPROCESS_ENV)
                installed = True
            except (subprocess.CalledProcessError, FileNotFoundError):
                pass
        if not installed:
            print("❌ paramiko 설치 실패. 다음 명령어로 수동 설치하세요:")
            print(f"   uv pip install paramiko --python .venv/Scripts/python.exe")
            return
        import paramiko

    try:
        print(f"🔑 SSH 키({SSH_KEY_PATH})를 로드합니다...")
        key = None
        _key_classes = [paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey]
        if hasattr(paramiko, 'DSSKey'):
            _key_classes.append(paramiko.DSSKey)
        for KeyClass in _key_classes:
            try:
                key = KeyClass.from_private_key_file(SSH_KEY_PATH)
                break
            except Exception:
                continue
        if key is None:
            raise paramiko.SSHException(f"SSH 키 로드 실패: {SSH_KEY_PATH}")
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        ssh.connect(hostname=SERVER_IP, username=SERVER_USER, pkey=key, timeout=10)
        print("✅ SSH 인증 성공! 서버에 접속했습니다.")
        
        print(f"🚀 서버로 배포 파일({ZIP_FILENAME}) 전송 중... 잠시만 기다려주세요.")
        sftp = ssh.open_sftp()
        
        # 원격 디렉토리 생성 시도 (없으면)
        sftp_remote_dir = f"/home/{SERVER_USER}/{PROJECT_NAME}"
        try:
            sftp.stat(sftp_remote_dir)
        except IOError:
            sftp.mkdir(sftp_remote_dir)
            
        remote_zip_path = f"{sftp_remote_dir}/{ZIP_FILENAME}"
        sftp.put(ZIP_FILENAME, remote_zip_path)
        sftp.close()
        print("✅ 파일 전송 완료!")

        print("🛠 서버 측 압축 해제 및 빌드 작업 시작 (setup_server.sh)...")
        remote_cmd = " && ".join([
            "command -v unzip > /dev/null || (sudo apt-get install -y unzip -qq)",
            "command -v lsof > /dev/null || (sudo apt-get install -y lsof -qq)",
            "command -v curl > /dev/null || (sudo apt-get install -y curl -qq)",
            "sudo systemctl stop qrorder.service 2>/dev/null || true",
            "sudo fuser -k -n tcp 8003 > /dev/null 2>&1 || true",
            "sleep 1",
            f"cd {REMOTE_DIR}",
            f"unzip -o {ZIP_FILENAME}",
            "bash setup_server.sh"
        ])
        
        stdin, stdout, stderr = ssh.exec_command(remote_cmd, timeout=300)

        # stdout/stderr 동시 읽기 (순차 읽기 시 SSH 버퍼 deadlock 방지)
        def read_stream(stream, prefix=""):
            for line in stream:
                text = line.strip('\n')
                if text:
                    print(f"{prefix}{text}", flush=True)

        t_out = threading.Thread(target=read_stream, args=(stdout,))
        t_err = threading.Thread(target=read_stream, args=(stderr, "ERR: "))
        t_out.start()
        t_err.start()
        t_out.join()
        t_err.join()

        exit_status = stdout.channel.recv_exit_status()
        ssh.close()
        
        if exit_status == 0:
            if os.path.exists(ZIP_FILENAME):
                os.remove(ZIP_FILENAME)
            print("\n🎉 완벽하게 자동 배포가 완료되었습니다(Deploy completed successfully)!")
        else:
            print(f"\n❌ 배포 스크립트 실행 중 서버에서 오류가 발생했습니다. (Exit code: {exit_status})")
            
    except Exception as e:
        print(f"\n❌ Paramiko 접속 또는 배포 실패: {e}")
        print("수동 배포를 진행하시려면 GCP 콘솔에서 위 deploy_package.zip을 업로드하세요.")

    print(f"\n🌐 서비스 주소: http://{SERVER_IP}:8003/")
    print(f"📋 관리자 페이지: http://{SERVER_IP}:8003/1234567/admin")

if __name__ == "__main__":
    deploy()


# GCP 서버 자동 배포(SSH) 복구 가이드

## 1단계: 로컬(현재 PC)에서 새로운 SSH 키 생성하기
현재 폴더(`Z:\orderservice`)에 터미널을 열고 아래 명령어를 입력하여 새로운 SSH 암호키를 만듭니다.

```bash
ssh-keygen -t rsa -b 4096 -f qr-order-new -C "verejireh"
```
- 비밀번호(passphrase)를 물어보면 **엔터**만 두 번 눌러서 비밀번호 없이 생성하세요.
- 완료되면 `qr-order-new` (프라이빗 키)와 `qr-order-new.pub` (퍼블릭 키) 2개의 파일이 생깁니다.

## 2단계: GCP 서버에 퍼블릭 키 등록하기
1. `qr-order-new.pub` 파일을 메모장으로 열고 그 안의 텍스트를 **전체 복사**합니다. (`ssh-rsa AAAAB3... verejireh` 형태)
2. [Google Cloud Console](https://console.cloud.google.com/compute/instances)에 접속합니다.
3. **Compute Engine > 메타데이터(Metadata) > SSH 키(SSH Keys)** 탭으로 이동합니다. (또는 해당 VM 인스턴스의 '수정(Edit)' 메뉴 최하단)
4. **항목 추가(Add item)**를 누르고, 복사한 텍스트를 붙여넣은 뒤 **저장(Save)**을 누릅니다.

## 3단계: `deploy.py` 확인 및 실행
- 이제 복구된 `qr-order-new` 프라이빗 키를 활용하여 스크립트가 자동으로 작동합니다.
- 바로 **`python deploy.py`** 명령어를 입력해 보세요.
- SSH 키 인식이 성공하면 예전처럼 자동으로 파일을 전송(scp)하고 서버 측 빌드(setup_server.sh)까지 알아서 마무리해 줍니다!

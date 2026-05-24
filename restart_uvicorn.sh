#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────
# ⚠️ DEPRECATED — 사용 금지
# ─────────────────────────────────────────────────────────────────────────
#
# 이 스크립트는 nohup ... uvicorn & 패턴으로 systemd 외부에 프로세스를 생성합니다.
# 2026-05-22 운영 사고 (qrorder NRestarts=413 restart loop) 의 직접 원인이었습니다:
#   - orphan uvicorn (PID 290514, 87분 가동) 이 포트 8003 점유
#   - systemd-managed 인스턴스가 매번 bind 실패 → restart loop
#   - 해당 orphan 의 command line 시그니처가 본 스크립트의 nohup 라인과 일치
#
# 정상 운영 명령:
#   sudo systemctl restart qrorder        # 재시작
#   sudo systemctl status qrorder         # 상태 확인
#   sudo journalctl -u qrorder -f         # 로그 추적
#   sudo systemctl stop qrorder           # 정지
#
# deploy 자동화는 deploy.py + setup_server.sh 를 사용합니다.
#
# 본 스크립트는 의도적으로 실행을 차단합니다. 정말 필요한 시나리오가
# 있다면 그 시나리오를 systemd unit 으로 흡수하거나 별도 도구를 만드세요.

cat >&2 << 'WARN'
❌ restart_uvicorn.sh 는 DEPRECATED 입니다.

이 스크립트의 nohup 패턴은 systemd 외부에 orphan 프로세스를 생성합니다.
2026-05-22 restart loop 사고의 직접 원인이었으므로 실행을 차단합니다.

정상 사용:
  sudo systemctl restart qrorder       # 재시작
  sudo journalctl -u qrorder -f        # 로그
  sudo systemctl status qrorder        # 상태

WARN
exit 1

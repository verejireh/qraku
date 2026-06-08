import os
import sys

# 앱 코드가 'from utils...', 'from models...' 형태로 import하므로
# backend/ 디렉토리를 import 경로 맨 앞에 추가한다.
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

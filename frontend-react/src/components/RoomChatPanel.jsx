import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'

// 객실(손님)↔스태프 채팅 패널 (공용).
// props:
//   shopId, roomNumber — (store, room) 스레드 식별 (객실 QR URL 에서 옴)
//   sender   — 'guest' | 'staff' (말풍선 정렬 + 전송 엔드포인트 분기)
//   postClient — POST 클라이언트. 스태프 답장은 인증 필요 → staffApi 주입. 기본 axios(공개).
// MVP: 4초 폴링. (후속: useWebSocket 으로 교체 — 백엔드는 이미 ROOM_CHAT emit)
export default function RoomChatPanel({ shopId, roomNumber, sender = 'guest', postClient = axios }) {
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const endRef = useRef(null)
  const keyRef = useRef('')   // 현재 활성 (shop, room) 키 — stale 응답 차단용

  const load = useCallback(async () => {
    if (!shopId || !roomNumber) return
    const key = `${shopId}/${roomNumber}`
    try {
      const r = await axios.get(`/api/room-chat/${shopId}/${roomNumber}`)
      // 응답 지연 중 방이 바뀌었으면 무시 — 타 객실 메시지 교차 렌더 방지(객실 격리)
      if (keyRef.current !== key) return
      setMsgs(Array.isArray(r.data) ? r.data : [])
    } catch { /* noop */ }
  }, [shopId, roomNumber])

  useEffect(() => {
    keyRef.current = `${shopId}/${roomNumber}`   // 방 전환 시 즉시 갱신 → 이전 in-flight 응답 폐기
    // 초기 로드를 타이머 콜백으로 — effect 본문 동기 setState 회피(react-hooks/set-state-in-effect)
    const t = setTimeout(load, 0)
    const id = setInterval(load, 4000)
    return () => { clearTimeout(t); clearInterval(id) }
  }, [load, shopId, roomNumber])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = async () => {
    const content = text.trim()
    if (!content) return
    try {
      const url = sender === 'staff'
        ? `/api/room-chat/${shopId}/${roomNumber}/reply`
        : `/api/room-chat/${shopId}/${roomNumber}`
      await postClient.post(url, { content })
      setText('')        // 성공 후에만 입력 비움 — 실패 시 입력 보존(재시도 가능)
      await load()
    } catch { /* noop — 입력 유지 */ }
  }

  const mineType = sender === 'staff' ? 'STAFF' : 'GUEST'

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-2 p-3">
        {msgs.length === 0 && (
          <p className="text-center text-xs text-slate-400 py-6">メッセージはまだありません</p>
        )}
        {msgs.map(m => (
          <div key={m.id} className={`flex ${m.sender_type === mineType ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
              m.sender_type === 'STAFF' ? 'bg-blue-100 text-blue-900' : 'bg-slate-100 text-slate-800'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 p-2 border-t border-slate-200">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary/50"
          placeholder="メッセージを入力"
        />
        <button
          onClick={send}
          className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
        >
          送信
        </button>
      </div>
    </div>
  )
}

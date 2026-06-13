/**
 * TabehoudaiBanner
 * 손님용: 활성 식다파다이 세션의 잔여시간 + 코스명 + ラストオーダー 안내.
 * session prop을 부모(OrderView)에서 fetch & 폴링하여 전달받음.
 */
import { useState, useEffect, useRef } from 'react'

function fmt(seconds) {
    if (seconds <= 0) return '00:00'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function TabehoudaiBanner({ session }) {
    const [now, setNow] = useState(Date.now())
    // 서버가 계산한 seconds_remaining 으로 로컬 deadline 을 동기화.
    // expires_at(naive UTC)을 new Date()로 직접 파싱하면 브라우저 로컬 TZ(JST 등)로
    // 오해석되어 카운트다운이 최대 9시간 어긋나므로 서버 값을 신뢰원으로 사용.
    const deadlineRef = useRef(null)

    useEffect(() => {
        if (session && typeof session.seconds_remaining === 'number') {
            deadlineRef.current = Date.now() + session.seconds_remaining * 1000
        } else {
            deadlineRef.current = null
        }
        setNow(Date.now())
    }, [session])

    useEffect(() => {
        if (!session || session.status !== 'active') return
        const t = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(t)
    }, [session])

    if (!session) return null

    const remaining = deadlineRef.current != null
        ? Math.max(0, Math.floor((deadlineRef.current - now) / 1000))
        : 0
    const isLastOrder = remaining > 0 && remaining <= session.last_order_minutes * 60
    const isExpired = session.status === 'expired' || remaining <= 0

    const courseLabel = session.course_type === 'drink' ? '飲み放題' :
        session.course_type === 'both' ? '食べ&飲み放題' : '食べ放題'

    if (isExpired) {
        return (
            <div className="sticky top-0 z-40 px-4 py-3 bg-slate-700 text-white text-center text-sm font-bold shadow-lg">
                {courseLabel} の時間が終了しました
            </div>
        )
    }

    return (
        <div className={`sticky top-0 z-40 shadow-md transition-colors ${
            isLastOrder ? 'bg-amber-500' : 'bg-gradient-to-r from-rose-500 to-rose-600'
        } text-white`}>
            <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-[20px] flex-shrink-0">
                        {isLastOrder ? 'notification_important' : 'restaurant'}
                    </span>
                    <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-wider opacity-80">
                            {isLastOrder ? 'ラストオーダー' : courseLabel}
                        </div>
                        <div className="text-sm font-bold truncate">{session.group_name}</div>
                    </div>
                </div>
                <div className="flex-shrink-0 text-right">
                    <div className="text-[10px] font-black uppercase tracking-wider opacity-80">残り時間</div>
                    <div className="text-lg font-black tabular-nums leading-none">{fmt(remaining)}</div>
                </div>
            </div>
        </div>
    )
}

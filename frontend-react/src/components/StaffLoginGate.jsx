/**
 * StaffLoginGate
 * Kitchen / Register / Staff / Setting 페이지 진입 전 인증 게이트
 *
 * 인증 방식:
 *   1. 마스터 PIN (6자리+ 숫자) → register, staff, kitchen, setting 전체 접근
 *   2. 개인 Staff 로그인 (이름 선택 + 4자리 PIN) → staff 페이지만
 *
 * sessionStorage에 인증 상태 저장 (탭 닫으면 초기화)
 */
import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { Lock, User, ShieldCheck } from 'lucide-react'

const STORAGE_KEY_PREFIX = 'staffAuth_'

export function useStaffAuth() {
    const { shop_id } = useParams()
    const key = STORAGE_KEY_PREFIX + (shop_id || '')

    const getAuth = () => {
        try {
            const raw = sessionStorage.getItem(key)
            return raw ? JSON.parse(raw) : null
        } catch { return null }
    }

    const [auth, setAuthState] = useState(getAuth)

    const setAuth = (data) => {
        if (data) {
            sessionStorage.setItem(key, JSON.stringify(data))
        } else {
            sessionStorage.removeItem(key)
        }
        setAuthState(data)
    }

    const isMaster = auth?.role === 'master'
    const isStaff = auth?.role === 'staff'
    const isAuthenticated = !!auth

    const logout = () => setAuth(null)

    return { auth, setAuth, isMaster, isStaff, isAuthenticated, logout }
}


export default function StaffLoginGate({ children, requiredRole = 'any' }) {
    const { shop_id } = useParams()
    const [searchParams] = useSearchParams()
    const { auth, setAuth, isMaster, isStaff, isAuthenticated } = useStaffAuth()

    const [mode, setMode] = useState('choose') // 'choose' | 'master' | 'staff'
    const [pin, setPin] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [staffList, setStaffList] = useState([])
    const [selectedStaff, setSelectedStaff] = useState(null)
    const [hasMasterPin, setHasMasterPin] = useState(false)
    const [initialLoading, setInitialLoading] = useState(true)

    useEffect(() => {
        const fetchStaffInfo = async () => {
            try {
                const res = await axios.get(`/api/staff-auth/staff-list/${shop_id}`)
                setHasMasterPin(res.data.has_master_pin)
                setStaffList(res.data.on_duty_staff || [])
            } catch { }
            setInitialLoading(false)
        }
        if (shop_id) fetchStaffInfo()
    }, [shop_id])

    // デモモードの場合は認証スキップ
    // ⚠️ 보안: ?demo=1 URL 파라미터는 "demo_tmp_" 접두사 임시 스토어에서만 허용
    //   (일반 매장에 ?demo=1 붙여 인증 우회하는 공격 차단)
    const isTempDemoStore = typeof shop_id === 'string' && shop_id.startsWith('demo_tmp_')
    const sessionDemoMode = sessionStorage.getItem('demo_mode') === 'true'
    const urlDemoMode = searchParams.get('demo') === '1' && isTempDemoStore
    const isDemoMode = sessionDemoMode || urlDemoMode
    if (isDemoMode) return children


    // Check if already authenticated with correct role
    if (isAuthenticated) {
        if (requiredRole === 'any') return children
        if (requiredRole === 'master' && isMaster) return children
        if (requiredRole === 'staff' && (isMaster || isStaff)) return children
        // Wrong role — show access denied
        if (isStaff && requiredRole === 'master') {
            return (
                <div className="min-h-screen bg-[#1b1b1d] flex items-center justify-center p-6">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center">
                        <Lock className="w-12 h-12 text-red-400 mx-auto mb-4" />
                        <h2 className="text-white text-lg font-bold mb-2">アクセス権限がありません</h2>
                        <p className="text-slate-400 text-sm mb-6">このページにはマスターPINが必要です。</p>
                        <button onClick={() => { setAuth(null); setMode('master'); setPin('') }}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm">
                            マスターPINでログイン
                        </button>
                    </div>
                </div>
            )
        }
    }

    if (isAuthenticated) return children

    const handleMasterLogin = async () => {
        setError('')
        setLoading(true)
        try {
            const res = await axios.post(`/api/staff-auth/master/${shop_id}`, { pin })
            if (res.data.token) {
                localStorage.setItem('staffToken', res.data.token)
            }
            setAuth(res.data)
        } catch (e) {
            setError(e.response?.data?.detail || 'ログインに失敗しました。')
        }
        setLoading(false)
    }

    const handleStaffLogin = async () => {
        if (!selectedStaff) { setError('スタッフを選択してください。'); return }
        setError('')
        setLoading(true)
        try {
            const res = await axios.post(`/api/staff-auth/staff/${shop_id}`, {
                staff_id: selectedStaff.id,
                pin
            })
            setAuth(res.data)
        } catch (e) {
            setError(e.response?.data?.detail || 'ログインに失敗しました。')
        }
        setLoading(false)
    }

    if (initialLoading) {
        return (
            <div className="min-h-screen bg-[#1b1b1d] flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            </div>
        )
    }

    if (!hasMasterPin) {
        return (
            <div className="min-h-screen bg-[#1b1b1d] flex items-center justify-center p-6">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center">
                    <ShieldCheck className="w-14 h-14 text-amber-400 mx-auto mb-4" />
                    <h2 className="text-white text-lg font-bold mb-2">初期設定が必要です</h2>
                    <p className="text-slate-400 text-sm leading-relaxed">
                        Admin画面でマスターPINを設定してください。<br />
                        マスターPINはスタッフページへのアクセスに必要です。
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#1b1b1d] flex items-center justify-center p-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-sm w-full">

                {/* Choose Mode */}
                {mode === 'choose' && (
                    <div className="space-y-4">
                        <div className="text-center mb-6">
                            <Lock className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                            <h2 className="text-white text-xl font-bold">スタッフログイン</h2>
                            <p className="text-slate-400 text-xs mt-1">ログイン方法を選択してください</p>
                        </div>
                        <button onClick={() => { setMode('master'); setPin(''); setError('') }}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all">
                            <ShieldCheck className="w-5 h-5" />
                            マスターPIN（管理者）
                        </button>
                        {staffList.length > 0 && (
                            <button onClick={() => { setMode('staff'); setPin(''); setError(''); setSelectedStaff(null) }}
                                className="w-full py-4 bg-white/10 hover:bg-white/15 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all">
                                <User className="w-5 h-5" />
                                スタッフログイン
                            </button>
                        )}
                    </div>
                )}

                {/* Master PIN */}
                {mode === 'master' && (
                    <div className="space-y-4">
                        <div className="text-center mb-4">
                            <ShieldCheck className="w-10 h-10 text-blue-400 mx-auto mb-2" />
                            <h2 className="text-white text-lg font-bold">マスターPIN</h2>
                        </div>
                        <input
                            type="password"
                            inputMode="numeric"
                            value={pin}
                            onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError('') }}
                            onKeyDown={e => e.key === 'Enter' && handleMasterLogin()}
                            placeholder="6桁以上の数字"
                            maxLength={20}
                            autoFocus
                            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-4 text-white text-center text-2xl tracking-[0.5em] font-mono placeholder:text-slate-500 placeholder:text-sm placeholder:tracking-normal focus:outline-none focus:border-blue-500"
                        />
                        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
                        <button onClick={handleMasterLogin} disabled={loading || pin.length < 6}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm disabled:opacity-40 transition-all">
                            {loading ? 'ログイン中...' : 'ログイン'}
                        </button>
                        <button onClick={() => { setMode('choose'); setError('') }}
                            className="w-full text-slate-500 text-xs hover:text-slate-300 transition-colors">
                            戻る
                        </button>
                    </div>
                )}

                {/* Staff Login */}
                {mode === 'staff' && (
                    <div className="space-y-4">
                        <div className="text-center mb-4">
                            <User className="w-10 h-10 text-green-400 mx-auto mb-2" />
                            <h2 className="text-white text-lg font-bold">スタッフログイン</h2>
                        </div>

                        {/* Staff selector */}
                        <div className="space-y-2">
                            {staffList.map(s => (
                                <button key={s.id}
                                    onClick={() => { setSelectedStaff(s); setError('') }}
                                    className={`w-full py-3 px-4 rounded-xl text-left font-bold text-sm transition-all ${
                                        selectedStaff?.id === s.id
                                            ? 'bg-green-600/30 border-2 border-green-500 text-green-300'
                                            : 'bg-white/5 border-2 border-transparent text-slate-300 hover:bg-white/10'
                                    }`}>
                                    {s.name}
                                </button>
                            ))}
                        </div>

                        {selectedStaff && (
                            <>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    value={pin}
                                    onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError('') }}
                                    onKeyDown={e => e.key === 'Enter' && handleStaffLogin()}
                                    placeholder="4桁のPIN"
                                    maxLength={4}
                                    autoFocus
                                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-4 text-white text-center text-3xl tracking-[0.8em] font-mono placeholder:text-slate-500 placeholder:text-sm placeholder:tracking-normal focus:outline-none focus:border-green-500"
                                />
                                {error && <p className="text-red-400 text-xs text-center">{error}</p>}
                                <button onClick={handleStaffLogin} disabled={loading || pin.length < 4}
                                    className="w-full py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-sm disabled:opacity-40 transition-all">
                                    {loading ? 'ログイン中...' : 'ログイン'}
                                </button>
                            </>
                        )}

                        <button onClick={() => { setMode('choose'); setError('') }}
                            className="w-full text-slate-500 text-xs hover:text-slate-300 transition-colors">
                            戻る
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

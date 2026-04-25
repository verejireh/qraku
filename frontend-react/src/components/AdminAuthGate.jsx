/**
 * AdminAuthGate
 * Admin 페이지 진입 전 인증 게이트
 * - localStorage의 JWT 토큰으로 인증 확인
 * - URL ?token= 파라미터 (OAuth 리다이렉트) 처리
 * - 미인증 시 로그인 페이지로 리다이렉트
 */
import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Outlet } from 'react-router-dom'
import { isAdminLoggedIn, setAdminToken, getAdminPayload, clearAdminToken } from '../hooks/useAdminApi'

export default function AdminAuthGate() {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const [checking, setChecking] = useState(true)
    const [authenticated, setAuthenticated] = useState(false)

    useEffect(() => {
        // 1. URL에 ?token= 이 있으면 저장 (OAuth 리다이렉트)
        const urlToken = searchParams.get('token')
        if (urlToken) {
            setAdminToken(urlToken)
            // URL에서 token 파라미터 제거
            searchParams.delete('token')
            setSearchParams(searchParams, { replace: true })
        }

        // 2. 토큰 유효성 확인
        if (isAdminLoggedIn()) {
            // 토큰의 store가 현재 shop_id와 매치하는지 확인
            const payload = getAdminPayload()
            if (payload && (payload.slug === shop_id || String(payload.store_id) === shop_id)) {
                setAuthenticated(true)
            } else {
                // 다른 가게의 토큰 → 로그인 페이지로
                clearAdminToken()
                setAuthenticated(false)
            }
        } else {
            setAuthenticated(false)
        }
        setChecking(false)
    }, [shop_id, searchParams])

    if (checking) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            </div>
        )
    }

    if (!authenticated) {
        // 로그인 페이지로 리다이렉트
        navigate(`/${shop_id}/admin/login`, { replace: true })
        return null
    }

    return <Outlet />
}

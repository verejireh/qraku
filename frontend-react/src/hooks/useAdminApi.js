/**
 * Admin API 유틸리티
 * - JWT 토큰을 자동으로 Authorization 헤더에 추가
 * - 401 응답 시 토큰 제거 + 로그인 페이지로 리다이렉트
 */
import axios from 'axios'

const ADMIN_TOKEN_KEY = 'admin_token'

const adminApi = axios.create()

adminApi.interceptors.request.use(config => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY)
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

adminApi.interceptors.response.use(
    res => res,
    err => {
        if (err.response?.status === 401) {
            localStorage.removeItem(ADMIN_TOKEN_KEY)
            // 로그인 페이지로 리다이렉트는 AdminAuthGate가 담당
        }
        return Promise.reject(err)
    }
)

export function getAdminToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY)
}

export function setAdminToken(token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token)
}

export function clearAdminToken() {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
}

export function isAdminLoggedIn() {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY)
    if (!token) return false
    // JWT payload 디코딩으로 만료 확인
    try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        return payload.exp * 1000 > Date.now()
    } catch {
        return false
    }
}

export function getAdminPayload() {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY)
    if (!token) return null
    try {
        return JSON.parse(atob(token.split('.')[1]))
    } catch {
        return null
    }
}

export default adminApi

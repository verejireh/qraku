import { useEffect, useState } from 'react'
import { useNavigate, Outlet } from 'react-router-dom'

function isTokenValid(token) {
    if (!token) return false
    try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        if (payload.type !== 'super_admin') return false
        if (payload.exp && payload.exp * 1000 < Date.now()) return false
        return true
    } catch {
        return false
    }
}

export default function SuperAdminAuthGate() {
    const navigate = useNavigate()
    const [checked, setChecked] = useState(false)
    const [authed, setAuthed] = useState(false)

    useEffect(() => {
        const token = localStorage.getItem('super_admin_token')
        if (isTokenValid(token)) {
            setAuthed(true)
        } else {
            localStorage.removeItem('super_admin_token')
            setAuthed(false)
        }
        setChecked(true)
    }, [])

    useEffect(() => {
        if (checked && !authed) {
            navigate('/super-admin/login', { replace: true })
        }
    }, [checked, authed, navigate])

    if (!checked) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            </div>
        )
    }

    if (!authed) return null
    return <Outlet />
}

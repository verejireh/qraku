import { useState, useEffect } from 'react'

export function useLiff(liffId) {
    const [liff, setLiff] = useState(null)
    const [liffError, setLiffError] = useState(null)
    const [isInitialized, setIsInitialized] = useState(false)

    useEffect(() => {
        if (!liffId) {
            setLiffError('LIFF ID is required')
            return
        }

        // Wait for liff SDK to be available on window
        const initLiff = async () => {
            try {
                if (!window.liff) {
                    throw new Error('LIFF SDK not found on window object. Ensure it is loaded in index.html.')
                }

                await window.liff.init({ liffId })
                setLiff(window.liff)
                setIsInitialized(true)
            } catch (err) {
                console.error('LIFF initialization failed', err)
                setLiffError(err)
            }
        }

        initLiff()
    }, [liffId])

    return { liff, liffError, isInitialized }
}

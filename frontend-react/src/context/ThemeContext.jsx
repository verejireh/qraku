import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

export const FLOWER_THEMES = {
    sakura: { name: 'Sakura', color: '#ffb8c6', class: 'theme-sakura' },
    cosmos: { name: 'Cosmos', color: '#e13370', class: 'theme-cosmos' },
    sunflower: { name: 'Sunflower', color: '#ffd900', class: 'theme-sunflower' },
    lavender: { name: 'Lavender', color: '#9c7aff', class: 'theme-lavender' },
    tsubaki: { name: 'Tsubaki', color: '#c21e2f', class: 'theme-tsubaki' },
    bamboo: { name: 'Bamboo', color: '#7f8000', class: 'theme-bamboo' },
    ajisai: { name: 'Ajisai', color: '#5cd0f0', class: 'theme-ajisai' },
}

export function ThemeProvider({ children }) {
    const [currentTheme, setCurrentThemeState] = useState(() => localStorage.getItem('theme-flower') || 'tsubaki')

    useEffect(() => {
        const root = window.document.documentElement

        // Remove old theme classes
        Object.values(FLOWER_THEMES).forEach(t => root.classList.remove(t.class))

        // Add current theme class
        if (FLOWER_THEMES[currentTheme]) {
            root.classList.add(FLOWER_THEMES[currentTheme].class)
        }

        localStorage.setItem('theme-flower', currentTheme)
    }, [currentTheme])

    // Mark as user-selected so StoreLayout doesn't override it
    const setCurrentTheme = (theme) => {
        localStorage.setItem('theme-user-selected', '1')
        setCurrentThemeState(theme)
    }

    return (
        <ThemeContext.Provider value={{
            currentTheme,
            setCurrentTheme,
            themes: FLOWER_THEMES,
        }}>
            {children}
        </ThemeContext.Provider>
    )
}

export const useTheme = () => useContext(ThemeContext)

'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

export type SeasonKey = 'autumn' | 'winter' | 'spring' | 'summer'

export interface SeasonInfo {
  key: SeasonKey
  name: string
  icon: string
  greeting: string
  badgeColor: string
  accentColor: string
  secondaryColor: string
  textColor: string
  bgGradient: string
  canvasGradient: string
  tag: string
  bannerSubtitle: string
}

export const SEASONS: Record<SeasonKey, SeasonInfo> = {
  autumn: {
    key: 'autumn',
    name: 'Autumn Fall',
    icon: '🍂',
    greeting: 'Crisp morning air, golden foliage & scenic rides through Mill Creek Park!',
    badgeColor: '#C9A96E',
    accentColor: '#C9A96E',
    secondaryColor: '#3D2614',
    textColor: '#F5F0E8',
    bgGradient: 'linear-gradient(135deg, #1A2E1C 0%, #2D4A32 55%, #3D2614 100%)',
    canvasGradient: 'linear-gradient(180deg, #FBF7EF 0%, #FAF3E6 50%, #F5EDE0 100%)',
    tag: 'Foliage & Trail Season',
    bannerSubtitle: 'Mill Creek Gold & Amber Foliage',
  },
  winter: {
    key: 'winter',
    name: 'Winter Holiday',
    icon: '❄️',
    greeting: 'Warm holiday wishes! Keep batteries above 50% indoors during winter rides 🎄',
    badgeColor: '#D4AF37',
    accentColor: '#D4AF37',
    secondaryColor: '#1E3A8A',
    textColor: '#F5F0E8',
    bgGradient: 'linear-gradient(135deg, #0F2618 0%, #1A2E1C 55%, #1E3A8A 100%)',
    canvasGradient: 'linear-gradient(180deg, #F0F6FA 0%, #E6EFF6 50%, #DCE8F2 100%)',
    tag: 'Holiday & Frost Season',
    bannerSubtitle: 'Frosty Trails & Holiday Cheer',
  },
  spring: {
    key: 'spring',
    name: 'Spring Bloom',
    icon: '🌸',
    greeting: 'Trail thaw is here and Mill Creek is in bloom! Perfect time for a Creek Ready Tune-Up 🌱',
    badgeColor: '#86EFAC',
    accentColor: '#4ADE80',
    secondaryColor: '#14532D',
    textColor: '#F5F0E8',
    bgGradient: 'linear-gradient(135deg, #16361E 0%, #2D4A32 55%, #14532D 100%)',
    canvasGradient: 'linear-gradient(180deg, #F4F9F4 0%, #EBF6EC 50%, #E0F2E3 100%)',
    tag: 'Spring Thaw Season',
    bannerSubtitle: 'Park Thaw & Fresh Green Blooms',
  },
  summer: {
    key: 'summer',
    name: 'Summer Sun',
    icon: '☀️',
    greeting: 'Cool breeze by Newport Lake, sunny days & shaded forest canopy adventures 🌊',
    badgeColor: '#F59E0B',
    accentColor: '#F59E0B',
    secondaryColor: '#B45309',
    textColor: '#F5F0E8',
    bgGradient: 'linear-gradient(135deg, #1A311F 0%, #2D4A32 55%, #065F46 100%)',
    canvasGradient: 'linear-gradient(180deg, #FDFBF5 0%, #FAF4E4 50%, #F5E9C9 100%)',
    tag: 'Peak Adventure Season',
    bannerSubtitle: 'Lake Newport Sun & Canopy Trails',
  },
}

export function getAutoSeason(): SeasonKey {
  const m = new Date().getMonth()
  if (m >= 2 && m <= 4) return 'spring'
  if (m >= 5 && m <= 7) return 'summer'
  if (m >= 8 && m <= 10) return 'autumn'
  return 'winter'
}

interface SeasonalThemeContextType {
  seasonKey: SeasonKey
  season: SeasonInfo
  isCustom: boolean
  setSeason: (key: SeasonKey | 'auto') => void
  allSeasons: SeasonInfo[]
}

const SeasonalThemeContext = createContext<SeasonalThemeContextType>({
  seasonKey: 'autumn',
  season: SEASONS.autumn,
  isCustom: false,
  setSeason: () => {},
  allSeasons: Object.values(SEASONS),
})

const STORAGE_KEY = 'ctc_season_theme'

export function SeasonalThemeProvider({ children }: { children: React.ReactNode }) {
  const [seasonKey, setSeasonKeyState] = useState<SeasonKey>('autumn')
  const [isCustom, setIsCustom] = useState(false)

  // Initialize theme from storage or current season
  useEffect(() => {
    function loadSavedTheme() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved && saved in SEASONS) {
          const key = saved as SeasonKey
          setSeasonKeyState(key)
          setIsCustom(true)
          document.documentElement.setAttribute('data-season', key)
        } else {
          const autoKey = getAutoSeason()
          setSeasonKeyState(autoKey)
          setIsCustom(false)
          document.documentElement.setAttribute('data-season', autoKey)
        }
      } catch (_) {
        const autoKey = getAutoSeason()
        setSeasonKeyState(autoKey)
        document.documentElement.setAttribute('data-season', autoKey)
      }
    }

    loadSavedTheme()

    // Sync if other tabs change the theme
    function handleStorageChange(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        loadSavedTheme()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  function setSeason(key: SeasonKey | 'auto') {
    if (key === 'auto') {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch (_) {}
      const autoKey = getAutoSeason()
      setSeasonKeyState(autoKey)
      setIsCustom(false)
      document.documentElement.setAttribute('data-season', autoKey)
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, key)
      } catch (_) {}
      setSeasonKeyState(key)
      setIsCustom(true)
      document.documentElement.setAttribute('data-season', key)
    }
  }

  const season = SEASONS[seasonKey] || SEASONS.autumn

  return (
    <SeasonalThemeContext.Provider
      value={{
        seasonKey,
        season,
        isCustom,
        setSeason,
        allSeasons: Object.values(SEASONS),
      }}
    >
      <div
        className="seasonal-canvas min-h-screen flex flex-col transition-colors duration-300"
        data-season={seasonKey}
      >
        {children}
      </div>
    </SeasonalThemeContext.Provider>
  )
}

export function useSeasonalTheme() {
  return useContext(SeasonalThemeContext)
}

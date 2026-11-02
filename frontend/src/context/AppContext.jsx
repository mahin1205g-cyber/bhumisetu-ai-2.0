import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../translations';
import { api, setToken } from '../api';
import { clearProfilePictureCache } from '../utils/profilePictureCache';

const AppContext = createContext();

export function AppProvider({ children }) {
  // 1. Language state: default 'bn'
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('lg_lang') || 'bn';
  });

  // 2. Theme state: default 'light'
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('lg_theme') || 'light';
  });

  // User identity and role are always reloaded from the authenticated API.
  const [user, setUser] = useState(null);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem('lg_token')) return;
    let active = true;
    api.getMe().then((profile) => {
      if (active) setUser(profile);
    }).catch(() => {
      if (!active) return;
      setToken(null);
      setUser(null);
    });
    return () => { active = false; };
  }, []);

  // Sync lang
  useEffect(() => {
    localStorage.setItem('lg_lang', lang);
  }, [lang]);

  // Sync theme to DOM
  useEffect(() => {
    localStorage.setItem('lg_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Fetch notifications
  const refreshNotifications = async () => {
    try {
      if (user) {
        const notifs = await api.getNotifications(user.id, user.role);
        setNotifications(notifs);
        setUnreadCount(notifs.filter(n => !n.is_read).length);
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    refreshNotifications();
    const interval = setInterval(refreshNotifications, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const toggleLang = () => {
    setLang(prev => (prev === 'bn' ? 'en' : 'bn'));
  };

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const t = (key) => {
    return translations[lang]?.[key] || translations['bn']?.[key] || key;
  };

  const loginUser = async (token) => {
    setToken(token);
    try {
      const profile = await api.getMe();
      setUser(profile);
      return profile;
    } catch (error) {
      setToken(null);
      setUser(null);
      throw error;
    }
  };

  const logoutUser = () => {
    clearProfilePictureCache();
    setUser(null);
    setToken(null);
  };

  return (
    <AppContext.Provider
      value={{
        lang,
        setLang,
        toggleLang,
        theme,
        setTheme,
        toggleTheme,
        user,
        setUser,
        loginUser,
        logoutUser,
        t,
        notifications,
        unreadCount,
        refreshNotifications
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations } from '../translations';
import { api, setToken, setAuthFailureHandler } from '../api';
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
  const [authStatus, setAuthStatus] = useState('loading');

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    api.restoreSession().then((profile) => {
      if (!active) return;
      setUser(profile);
      setAuthStatus(profile ? 'authenticated' : 'anonymous');
    }).catch((error) => {
      if (!active) return;
      if (error.status === 401) {
        setToken(null);
        setUser(null);
        setAuthStatus('anonymous');
      } else {
        // Network outages must not be treated as logout or erase a valid cookie.
        setAuthStatus('unavailable');
      }
    });
    return () => { active = false; };
  }, []);

  const retrySessionRestore = useCallback(async () => {
    setAuthStatus('loading');
    try {
      const profile = await api.restoreSession();
      setUser(profile);
      setAuthStatus(profile ? 'authenticated' : 'anonymous');
      return profile;
    } catch (error) {
      if (error.status === 401) {
        setToken(null);
        setUser(null);
        setAuthStatus('anonymous');
      } else {
        setAuthStatus('unavailable');
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    setAuthFailureHandler(() => {
      setToken(null);
      clearProfilePictureCache();
      setUser(null);
      setAuthStatus('anonymous');
    });
    return () => setAuthFailureHandler(null);
  }, []);

  useEffect(() => {
    const handleOtherTabLogout = (event) => {
      if (event.key === 'lg_auth_logout') {
        setToken(null);
        clearProfilePictureCache();
        setUser(null);
        setAuthStatus('anonymous');
      } else if (event.key === 'lg_auth_session_changed') {
        clearProfilePictureCache();
        retrySessionRestore().catch(() => {});
      }
    };
    window.addEventListener('storage', handleOtherTabLogout);
    return () => window.removeEventListener('storage', handleOtherTabLogout);
  }, [retrySessionRestore]);

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
    setAuthStatus('loading');
    setToken(token);
    try { localStorage.removeItem('lg_logged_out'); } catch { /* The server-issued session is authoritative. */ }
    try {
      const profile = await api.getMe();
      setUser(profile);
      setAuthStatus('authenticated');
      try { localStorage.setItem('lg_auth_session_changed', String(Date.now())); } catch { /* Cross-tab sync is optional. */ }
      return profile;
    } catch (error) {
      if (error.status === 401) {
        setToken(null);
        setUser(null);
        setAuthStatus('anonymous');
      } else {
        setAuthStatus('unavailable');
      }
      throw error;
    }
  };

  const logoutUser = () => {
    try { localStorage.setItem('lg_logged_out', '1'); } catch { /* The server-side revoke remains authoritative. */ }
    const logoutRequest = api.logout().catch(() => null);
    clearProfilePictureCache();
    setUser(null);
    setToken(null);
    setAuthStatus('anonymous');
    try { localStorage.setItem('lg_auth_logout', String(Date.now())); } catch { /* Cross-tab sync is optional. */ }
    return logoutRequest;
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
        authStatus,
        authLoading: authStatus === 'loading',
        retrySessionRestore,
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

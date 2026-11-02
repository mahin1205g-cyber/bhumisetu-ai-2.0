import Button from './components/Button';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from './context/AppContext';
import Header from './components/Header';
import SlideDrawer from './components/SlideDrawer';
import Footer from './components/Footer';
import LiveChatWidget from './components/LiveChatWidget';

// Pages
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import DeedVerification from './pages/DeedVerification';
import DeedSearch from './pages/DeedSearch';
import VerificationResult from './pages/VerificationResult';
import SmartMutation from './pages/SmartMutation';
import ApplicationTracking from './pages/ApplicationTracking';
import OfficerReview from './pages/OfficerReview';
import DueDiligence from './pages/DueDiligence';
import DueDiligenceReport from './pages/DueDiligenceReport';
import PropertiesRegister from './pages/PropertiesRegister';
import AuditHistory from './pages/AuditHistory';
import NotificationsPage from './pages/NotificationsPage';
import UserProfile from './pages/UserProfile';
import AdminDashboard from './pages/AdminDashboard';
import HelpFAQ from './pages/HelpFAQ';
import DisclaimerPolicy from './pages/DisclaimerPolicy';
import Login from './pages/Login';
import Register from './pages/Register';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  const { user, lang } = useApp();

  // Helper to extract tab id from window.location.hash
  const getTabFromHash = () => {
    if (typeof window === 'undefined') return 'home';
    const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0].trim();
    const validTabs = [
      'home', 'dashboard', 'deed-verify', 'deed-search', 'verification-result', 'mutation',
      'mutation-track', 'officer-review', 'due-diligence', 'due-diligence-report',
      'properties', 'audit-logs', 'notifications', 'profile', 'admin',
      'help', 'disclaimer', 'login', 'register'
    ];
    return validTabs.includes(hash) ? hash : (hash ? '404' : 'home');
  };

  const [activeTab, setActiveTabState] = useState(getTabFromHash);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [dueDiligenceResult, setDueDiligenceResult] = useState(null);
  const [selectedTracking, setSelectedTracking] = useState('MUT-2026-DHK-4821');
  const mainContentRef = useRef(null);

  // In-memory history stack for safe back navigation
  const historyStackRef = useRef([getTabFromHash()]);

  // Unified navigate function
  const navigate = useCallback((tab, options = {}) => {
    if (!tab) return;
    const targetTab = tab.replace(/^#\/?/, '');

    if (options.replace) {
      if (historyStackRef.current.length > 0) {
        historyStackRef.current[historyStackRef.current.length - 1] = targetTab;
      } else {
        historyStackRef.current = [targetTab];
      }
    } else {
      // Avoid duplicate consecutive entries in stack
      if (historyStackRef.current[historyStackRef.current.length - 1] !== targetTab) {
        historyStackRef.current.push(targetTab);
      }
    }

    if (window.location.hash !== `#/${targetTab}`) {
      window.location.hash = `#/${targetTab}`;
    }
    setActiveTabState(targetTab);

    // Scroll to top with reduced motion check
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }, []);

  // Safe Back navigation with intelligent fallback
  const navigateBack = useCallback((fallbackTab = 'dashboard') => {
    const stack = historyStackRef.current;
    if (stack.length > 1) {
      stack.pop(); // Remove current
      const prevTab = stack[stack.length - 1];
      window.location.hash = `#/${prevTab}`;
      setActiveTabState(prevTab);
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    } else {
      // If direct deep link or no previous history, safely route to fallback
      navigate(fallbackTab, { replace: true });
    }
  }, [navigate]);

  // Backward compatibility wrapper
  const setActiveTab = useCallback((tab) => {
    navigate(tab);
  }, [navigate]);

  // Synchronize with browser Back and Forward buttons (hashchange / popstate)
  useEffect(() => {
    const handleHashSync = () => {
      const currentHashTab = getTabFromHash();
      if (currentHashTab !== activeTab) {
        setActiveTabState(currentHashTab);
        const stack = historyStackRef.current;
        if (stack.length > 1 && stack[stack.length - 2] === currentHashTab) {
          stack.pop();
        } else if (stack[stack.length - 1] !== currentHashTab) {
          stack.push(currentHashTab);
        }
      }
    };

    window.addEventListener('hashchange', handleHashSync);
    window.addEventListener('popstate', handleHashSync);
    return () => {
      window.removeEventListener('hashchange', handleHashSync);
      window.removeEventListener('popstate', handleHashSync);
    };
  }, [activeTab]);

  useEffect(() => {
    const root = mainContentRef.current;
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return undefined;

    const targets = Array.from(root.querySelectorAll('section, [data-scroll-reveal]'));
    if (!targets.length) return undefined;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove('scroll-reveal-pending');
        entry.target.classList.add('scroll-reveal-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -36px 0px' });

    targets.forEach((element, index) => {
      element.style.setProperty('--scroll-reveal-delay', `${(index % 4) * 45}ms`);
      element.classList.add('scroll-reveal-pending');
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
      targets.forEach((element) => {
        element.classList.remove('scroll-reveal-pending', 'scroll-reveal-visible');
        element.style.removeProperty('--scroll-reveal-delay');
      });
    };
  }, [activeTab]);

  // Keyboard shortcut Alt+Left Arrow for intuitive back navigation
  useEffect(() => {
    const handleKeyNav = (e) => {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateBack();
      }
    };
    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  }, [navigateBack]);

  const renderContent = () => {
    const privateTabs = new Set([
      'dashboard', 'deed-verify', 'deed-search', 'verification-result', 'mutation',
      'mutation-track', 'officer-review', 'due-diligence', 'due-diligence-report',
      'properties', 'audit-logs', 'notifications', 'profile', 'admin'
    ]);
    if (privateTabs.has(activeTab) && !user) {
      return <div className="gov-container py-20 text-center space-y-4"><p>{lang === 'bn' ? 'এই সেবা ব্যবহার করতে লগইন করুন।' : 'Please sign in to use this service.'}</p><Button className="gov-btn-primary" onClick={() => navigate('login')}>{lang === 'bn' ? 'লগইন' : 'Sign in'}</Button></div>;
    }
    if (activeTab === 'admin' && user?.role !== 'admin') {
      return <div className="gov-container py-20 text-center"><p>{user ? 'Admin access required.' : 'Please log in first.'}</p><Button className="gov-btn-primary mt-4" onClick={() => navigate('login')}>Login</Button></div>;
    }
    if (activeTab === 'officer-review' && !['officer', 'admin'].includes(user?.role)) {
      return <div className="gov-container py-20 text-center"><p>{user ? 'Officer access required.' : 'Please log in first.'}</p><Button className="gov-btn-primary mt-4" onClick={() => navigate('login')}>Login</Button></div>;
    }
    switch (activeTab) {
      case 'home':
        return <LandingPage setActiveTab={setActiveTab} navigate={navigate} />;
      case 'dashboard':
        return (
          <Dashboard
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
            setSelectedTracking={setSelectedTracking}
          />
        );
      case 'deed-verify':
        return (
          <DeedVerification
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
            setVerificationResult={setVerificationResult}
          />
        );
      case 'deed-search':
        return (
          <DeedSearch
            setActiveTab={setActiveTab}
            navigateBack={navigateBack}
          />
        );
      case 'verification-result':
        return (
          <VerificationResult
            result={verificationResult}
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
          />
        );
      case 'mutation':
        return (
          <SmartMutation
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
            setSelectedTracking={setSelectedTracking}
          />
        );
      case 'mutation-track':
        return (
          <ApplicationTracking
            initialTrackingNo={selectedTracking}
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
          />
        );
      case 'officer-review':
        return (
          <OfficerReview
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
            setSelectedTracking={setSelectedTracking}
          />
        );
      case 'due-diligence':
        return (
          <DueDiligence
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
            setDueDiligenceResult={setDueDiligenceResult}
          />
        );
      case 'due-diligence-report':
        return (
          <DueDiligenceReport
            result={dueDiligenceResult}
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
          />
        );
      case 'properties':
        return (
          <PropertiesRegister
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
          />
        );
      case 'audit-logs':
        return (
          <AuditHistory
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
          />
        );
      case 'notifications':
        return (
          <NotificationsPage
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
          />
        );
      case 'profile':
        return (
          <UserProfile
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
          />
        );
      case 'admin':
        return (
          <AdminDashboard
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
            onResetSuccess={() => navigate('dashboard')}
          />
        );
      case 'help':
        return (
          <HelpFAQ
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
          />
        );
      case 'disclaimer':
        return (
          <DisclaimerPolicy
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
          />
        );
      case 'login':
        return (
          <Login
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
          />
        );
      case 'register':
        return (
          <Register
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
          />
        );
      default:
        return (
          <NotFoundPage
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
          />
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-transparent text-[var(--text-main)] transition-colors duration-200">
      {/* Slide Drawer (Opened via Menu button in Header) */}
      <SlideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenDrawer={() => setIsDrawerOpen(true)}
        setSelectedTracking={setSelectedTracking}
      />

      {/* Main Page Content with Smooth Transition */}
      <main ref={mainContentRef} className="flex-1">
        <div key={activeTab} className="page-transition-enter">
          {renderContent()}
        </div>
      </main>

      {/* Modern Footer with Creator Credits */}
      <Footer setActiveTab={setActiveTab} />

      {/* Floating Live Chat Assistant */}
      <LiveChatWidget setActiveTab={setActiveTab} />
    </div>
  );
}

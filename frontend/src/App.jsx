import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from './context/AppContext';
import Header from './components/Header';
import SlideDrawer from './components/SlideDrawer';
import Footer from './components/Footer';
import LiveChatWidget from './components/LiveChatWidget';
import IntroOverlay from './components/IntroOverlay';

// Pages
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import DeedVerification from './pages/DeedVerification';
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
  const { user } = useApp();

  // Helper to extract tab id from window.location.hash
  const getTabFromHash = () => {
    if (typeof window === 'undefined') return 'home';
    const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0].trim();
    const validTabs = [
      'home', 'dashboard', 'deed-verify', 'verification-result', 'mutation',
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
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text-main)] transition-colors duration-200">
      {/* 1.5s First-Visit Cinematic Intro Sequence */}
      <IntroOverlay />

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
      <main className="flex-1 animate-page-enter">
        {renderContent()}
      </main>

      {/* Modern Footer with Creator Credits */}
      <Footer setActiveTab={setActiveTab} />

      {/* Floating Live Chat Assistant */}
      <LiveChatWidget setActiveTab={setActiveTab} />
    </div>
  );
}

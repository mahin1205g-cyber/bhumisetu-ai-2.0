import Button from './components/Button';
import React, { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from './context/AppContext';
import Header from './components/Header';
import SlideDrawer from './components/SlideDrawer';
import Footer from './components/Footer';
import LiveChatWidget from './components/LiveChatWidget';
import { useAdaptivePerformance } from './hooks/useAdaptivePerformance';

// Pages
const LandingPage = lazy(() => import('./pages/LandingPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const OfficerDashboard = lazy(() => import('./pages/OfficerDashboard'));
const DeedVerification = lazy(() => import('./pages/DeedVerification'));
const DeedDigitization = lazy(() => import('./pages/DeedDigitization'));
const DigitalDeedPublicVerify = lazy(() => import('./pages/DigitalDeedPublicVerify'));
const DeedSearch = lazy(() => import('./pages/DeedSearch'));
const VerificationResult = lazy(() => import('./pages/VerificationResult'));
const SmartMutation = lazy(() => import('./pages/SmartMutation'));
const ApplicationTracking = lazy(() => import('./pages/ApplicationTracking'));
const UnifiedApplicationAdmin = lazy(() => import('./pages/UnifiedApplicationAdmin'));
const OfficerReview = lazy(() => import('./pages/OfficerReview'));
const DueDiligence = lazy(() => import('./pages/DueDiligence'));
const DueDiligenceReport = lazy(() => import('./pages/DueDiligenceReport'));
const PropertiesRegister = lazy(() => import('./pages/PropertiesRegister'));
const AuditHistory = lazy(() => import('./pages/AuditHistory'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const HelpFAQ = lazy(() => import('./pages/HelpFAQ'));
const DisclaimerPolicy = lazy(() => import('./pages/DisclaimerPolicy'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function PageLoading({ lang }) {
  return (
    <div className="gov-container py-12 text-center" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
        <span className="page-loading-indicator" aria-hidden="true" />
        {lang === 'bn' ? 'পাতা লোড হচ্ছে…' : 'Loading page…'}
      </span>
    </div>
  );
}

function ScrollRevealContent({ children, pageKey, reducedMotion }) {
  const contentRef = useRef(null);

  useEffect(() => {
    const root = contentRef.current;
    if (!root || reducedMotion || !('IntersectionObserver' in window)) return undefined;

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
  }, [pageKey, reducedMotion]);

  return <div ref={contentRef}>{children}</div>;
}

export default function App() {
  const { user, lang, authStatus, retrySessionRestore } = useApp();
  const adaptivePerformance = useAdaptivePerformance();

  useEffect(() => {
    document.documentElement.dataset.performanceProfile = adaptivePerformance.profile;
    return () => {
      delete document.documentElement.dataset.performanceProfile;
    };
  }, [adaptivePerformance.profile]);

  // Helper to extract tab id from window.location.hash
  const getTabFromHash = () => {
    if (typeof window === 'undefined') return 'home';
    const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0].trim();
    const route = hash.split('/')[0];
    const validTabs = [
      'home', 'dashboard', 'deed-digitization', 'deed-verify', 'deed-search', 'verification-result', 'verify-deed', 'mutation',
      'mutation-track', 'application-admin', 'approved-applications', 'officer-review', 'due-diligence', 'due-diligence-report',
      'properties', 'audit-logs', 'notifications', 'profile', 'admin',
      'help', 'disclaimer', 'login', 'register'
    ];
    return validTabs.includes(route) ? route : (hash ? '404' : 'home');
  };

  const [activeTab, setActiveTabState] = useState(getTabFromHash);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [verificationDraft, setVerificationDraft] = useState(null);
  const [deedSearchPrefill, setDeedSearchPrefill] = useState('');
  const [dueDiligenceResult, setDueDiligenceResult] = useState(null);
  const [selectedTracking, setSelectedTracking] = useState('');
  const [selectedDigitalDeedId, setSelectedDigitalDeedId] = useState(null);
  const [selectedDeedApplicationId, setSelectedDeedApplicationId] = useState(null);

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

  const openDeedSearch = useCallback((deedNo = '', draft = null) => {
    if (draft) setVerificationDraft(draft);
    setDeedSearchPrefill(String(deedNo || ''));
    navigate('deed-search');
  }, [navigate]);

  const selectDeedForVerification = useCallback((deed) => {
    if (!deed?.id || !deed?.deed_no) return;
    setVerificationDraft((previous) => ({
      ...(previous || {}),
      formData: { ...(previous?.formData || {}), deed_no: deed.deed_no },
      selectedDeedId: deed.id,
      selectedDeed: deed,
      lookupState: 'DEED_FOUND',
      lookupCandidates: [],
    }));
    setDeedSearchPrefill('');
    navigate('deed-verify');
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
    const privateTabs = new Set([
      'dashboard', 'deed-verify', 'deed-digitization', 'deed-search', 'verification-result', 'mutation',
      'mutation-track', 'application-admin', 'approved-applications', 'officer-review', 'due-diligence', 'due-diligence-report',
      'properties', 'audit-logs', 'notifications', 'profile', 'admin'
    ]);
    if (privateTabs.has(activeTab) && authStatus === 'loading') {
      return <div className="gov-container py-20 text-center" role="status" aria-live="polite">{lang === 'bn' ? 'আপনার সেশন যাচাই হচ্ছে…' : 'Restoring your session…'}</div>;
    }
    if (privateTabs.has(activeTab) && authStatus === 'unavailable') {
      return (
        <div className="gov-container py-20 text-center space-y-4" role="alert">
          <p>{lang === 'bn' ? 'সার্ভারের সাথে সংযোগ করা যাচ্ছে না। আপনার সেশন যাচাই হয়নি; আবার চেষ্টা করুন।' : 'The server is unavailable. Your session could not be checked; please retry.'}</p>
          <Button className="gov-btn-primary" onClick={() => retrySessionRestore().catch(() => {})}>{lang === 'bn' ? 'আবার চেষ্টা করুন' : 'Retry'}</Button>
        </div>
      );
    }
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
        if (user?.role === 'admin') {
          return <AdminDashboard setActiveTab={setActiveTab} navigate={navigate} navigateBack={navigateBack} onResetSuccess={() => navigate('dashboard')} />;
        }
        if (user?.role === 'officer') {
          return <OfficerDashboard setActiveTab={setActiveTab} navigateBack={navigateBack} />;
        }
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
            verificationDraft={verificationDraft}
            setVerificationDraft={setVerificationDraft}
            onFindDeed={openDeedSearch}
          />
        );
      case 'deed-search':
        return (
          <DeedSearch
            setActiveTab={setActiveTab}
            navigateBack={navigateBack}
            initialDeedNo={deedSearchPrefill}
            onSelectDeed={selectDeedForVerification}
          />
        );
      case 'deed-digitization':
        return (
          <DeedDigitization
            setActiveTab={setActiveTab}
            navigateBack={navigateBack}
            initialDigitalDeedId={selectedDigitalDeedId}
            onDigitalDeedOpened={() => setSelectedDigitalDeedId(null)}
            initialApplicationId={selectedDeedApplicationId}
            onApplicationOpened={() => setSelectedDeedApplicationId(null)}
          />
        );
      case 'verify-deed':
        return <DigitalDeedPublicVerify verificationToken={window.location.hash.replace(/^#\/?/, '').split('/')[1] || ''} />;
      case 'verification-result':
        return (
          <VerificationResult
            result={verificationResult}
            setActiveTab={setActiveTab}
            navigate={navigate}
            navigateBack={navigateBack}
            onFindDeed={(deedNo) => openDeedSearch(deedNo)}
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
            onOpenDigitalDeed={(deedId) => {
              setSelectedDigitalDeedId(deedId);
              setActiveTab('deed-digitization');
            }}
          />
        );
      case 'application-admin':
        return <UnifiedApplicationAdmin view="review" setActiveTab={setActiveTab} setSelectedTracking={setSelectedTracking} navigateBack={navigateBack} onOpenDeedApplication={(applicationId) => { setSelectedDeedApplicationId(applicationId); setActiveTab('deed-digitization'); }} />;
      case 'approved-applications':
        return <UnifiedApplicationAdmin view="approved" setActiveTab={setActiveTab} setSelectedTracking={setSelectedTracking} navigateBack={navigateBack} onOpenDeedApplication={(applicationId) => { setSelectedDeedApplicationId(applicationId); setActiveTab('deed-digitization'); }} />;
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
            verificationResult={verificationResult}
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
      <a href="#main-content" className="skip-link">
        {lang === 'bn' ? 'মূল কনটেন্টে যান' : 'Skip to main content'}
      </a>
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
      <main id="main-content" tabIndex="-1" className="flex-1">
        <Suspense fallback={<PageLoading lang={lang} />}>
          <div key={activeTab} className="page-transition-enter">
            <ScrollRevealContent pageKey={activeTab} reducedMotion={adaptivePerformance.reducedMotion}>
              {renderContent()}
            </ScrollRevealContent>
          </div>
        </Suspense>
      </main>

      {/* Modern Footer with Creator Credits */}
      <Footer setActiveTab={setActiveTab} />

      {/* Floating Live Chat Assistant */}
      <LiveChatWidget setActiveTab={setActiveTab} currentPage={activeTab} />
    </div>
  );
}

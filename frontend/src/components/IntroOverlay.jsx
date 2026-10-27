import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import BhumiSathiLogo from './BhumiSathiLogo';
import { Shield, Sparkles, X } from 'lucide-react';

/**
 * IntroOverlay — 1.5s Cinematic Brand Reveal using GSAP
 * Plays on first visit per browser session, respects prefers-reduced-motion,
 * includes keyboard Escape and Skip button, and safely unmounts from DOM.
 */
export default function IntroOverlay({ onComplete }) {
  const containerRef = useRef(null);
  const logoRef = useRef(null);
  const titleRef = useRef(null);
  const taglineRef = useRef(null);
  const badgeRef = useRef(null);
  const [visible, setVisible] = useState(true);

  const finishIntro = () => {
    try {
      sessionStorage.setItem('bhumisetu_intro_viewed', 'true');
    } catch (e) {
      // ignore
    }
    setVisible(false);
    if (typeof onComplete === 'function') onComplete();
  };

  useEffect(() => {
    // 1. Check if already viewed in this browser session
    const hasViewed = sessionStorage.getItem('bhumisetu_intro_viewed');
    if (hasViewed) {
      finishIntro();
      return;
    }

    // 2. Check prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      finishIntro();
      return;
    }

    // 3. Escape key listener to skip immediately
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        finishIntro();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // 4. GSAP Timeline Sequence (Total: ~1.6s)
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: finishIntro
      });

      // Initial state
      gsap.set(containerRef.current, { opacity: 1 });
      gsap.set(logoRef.current, { scale: 0.85, opacity: 0 });
      gsap.set([titleRef.current, taglineRef.current, badgeRef.current], { opacity: 0, y: 12 });

      // Staged entrance
      tl.to(logoRef.current, {
        scale: 1,
        opacity: 1,
        duration: 0.5,
        ease: 'power2.out'
      })
      .to(badgeRef.current, {
        opacity: 1,
        y: 0,
        duration: 0.3,
        ease: 'power2.out'
      }, '-=0.2')
      .to(titleRef.current, {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: 'power2.out'
      }, '-=0.15')
      .to(taglineRef.current, {
        opacity: 1,
        y: 0,
        duration: 0.35,
        ease: 'power2.out'
      }, '-=0.1')
      // Hold briefly then smooth curtain fade
      .to(containerRef.current, {
        opacity: 0,
        scale: 1.02,
        duration: 0.4,
        delay: 0.45,
        ease: 'power2.inOut'
      });
    }, containerRef);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      ctx.revert();
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#071912] select-none text-white overflow-hidden pointer-events-auto"
      style={{
        background: 'radial-gradient(ellipse 90% 80% at 50% 45%, #0b3424 0%, #061912 60%, #030b08 100%)'
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to BhumiSetu"
    >
      {/* Ambient Glow Orbs */}
      <div className="absolute w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute w-[350px] h-[350px] rounded-full bg-amber-500/5 blur-[90px] pointer-events-none -translate-y-16" />

      {/* Skip Button (Top Right) */}
      <button
        onClick={finishIntro}
        className="absolute top-6 right-6 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-slate-200 border border-white/15 backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
        title="Press Escape or click to skip intro"
      >
        <span>Skip</span>
        <span className="text-[10px] text-slate-400 font-mono">(Esc)</span>
      </button>

      {/* Central Brand Presentation Card */}
      <div className="relative z-10 max-w-md w-full mx-4 text-center px-6 py-8 flex flex-col items-center">
        {/* Government Tech Badge */}
        <div ref={badgeRef} className="mb-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 backdrop-blur-sm">
            <Shield className="w-3 h-3 text-emerald-400" />
            <span>LandGuard AI • Digital Land Verification</span>
          </span>
        </div>

        {/* Brand Emblem / Logo with Subtle Glow */}
        <div ref={logoRef} className="relative mb-5">
          <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-xl transform scale-125" />
          <div className="relative p-2 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 border border-white/20 shadow-2xl backdrop-blur-md">
            <BhumiSathiLogo className="w-20 h-20 sm:w-24 sm:h-24" size={96} />
          </div>
        </div>

        {/* Typographic Title */}
        <div ref={titleRef} className="space-y-1">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white drop-shadow-sm">
            ভূমি সেতু <span className="text-emerald-400 font-light text-2xl sm:text-3xl">| BhumiSetu</span>
          </h1>
          <p className="text-xs uppercase tracking-widest text-emerald-200/80 font-mono font-medium">
            Next-Gen Land Technology Platform
          </p>
        </div>

        {/* Tagline */}
        <div ref={taglineRef} className="mt-4 pt-3 border-t border-white/10">
          <p className="text-sm sm:text-base font-medium text-slate-200 tracking-wide">
            Smarter Land Verification. Greater Trust.
          </p>
          <p className="text-xs text-emerald-300/80 mt-1 font-bangla">
            নির্ভুল ভূমি যাচাই, নিশ্চিত মালিকানা নিরাপত্তা
          </p>
        </div>
      </div>
    </div>
  );
}

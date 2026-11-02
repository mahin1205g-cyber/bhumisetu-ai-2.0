import Button from './Button';
import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Download, Copy, Check, ExternalLink, X, ShieldCheck, QrCode } from 'lucide-react';

export default function QRCodeCanvas({ value, size = 120, label = "", title = "ডিজিটাল যাচাই সনদ কিউআর", lang = 'bn' }) {
  const [dataUrl, setDataUrl] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!value) return;

    QRCode.toDataURL(value, {
      width: Math.max(size * 2, 260),
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
      .then(url => setDataUrl(url))
      .catch(err => console.error('QR code generation error:', err));
  }, [value, size]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    closeRef.current?.focus();
    const returnFocusTo = triggerRef.current;
    return () => {
      if (returnFocusTo?.isConnected) returnFocusTo.focus();
    };
  }, [modalOpen]);

  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setModalOpen(false);
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleCopy = () => {
    if (value) {
      navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qrcode-${label || 'certificate'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
      <Button
        type="button"
        ref={triggerRef}
        onClick={() => setModalOpen(true)}
        aria-label={lang === 'bn'
          ? `${title}: ${label || 'কিউআর কোড'}। প্রিভিউ খুলুন।`
          : `${title}: ${label || 'QR code'}. Open preview.`}
        className="w-fit flex flex-col items-center gap-1.5 p-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm cursor-pointer hover:border-emerald-500 hover:shadow-md transition group select-none"
        title="ক্লিক করে বড় করুন / কিউআর কোড ডাউনলোড করুন"
      >
        <div className="relative overflow-hidden rounded bg-white flex items-center justify-center p-1">
          {dataUrl ? (
            <img
              src={dataUrl}
              alt="Verifiable QR Code"
              decoding="async"
              style={{ width: `${size}px`, height: `${size}px` }}
              className="object-contain block"
            />
          ) : (
            <div
              style={{ width: `${size}px`, height: `${size}px` }}
              className="flex items-center justify-center bg-gray-100 text-gray-400 text-xs font-mono"
            >
              QR Code
            </div>
          )}

          {/* Hover overlay hint */}
          <div className="absolute inset-0 bg-[#0b462d]/10 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
            <span className="bg-[#0b462d] text-[#febd69] text-[9px] font-bold px-2 py-0.5 rounded shadow">
              🔍 স্ক্যান / প্রিভিউ
            </span>
          </div>
        </div>

        {label && (
          <span className="text-[10px] text-gray-600 dark:text-gray-300 font-mono font-bold tracking-tight text-center max-w-[140px] truncate block">
            {label}
          </span>
        )}
      </Button>

      {/* Interactive QR Code Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in no-print">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="qr-preview-title" onKeyDown={handleDialogKeyDown} className="bg-white dark:bg-[#131c27] text-gray-900 dark:text-gray-100 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 space-y-4 relative">
            <Button
              ref={closeRef}
              type="button"
              onClick={() => setModalOpen(false)}
              aria-label={lang === 'bn' ? 'কিউআর প্রিভিউ বন্ধ করুন' : 'Close QR preview'}
              className="absolute top-4 right-4 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              <X className="w-5 h-5" />
            </Button>

            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-sm">
              <ShieldCheck className="w-5 h-5 text-[#0b462d] dark:text-emerald-400" />
              <span id="qr-preview-title">{title}</span>
            </div>

            <div className="flex justify-center p-3 bg-white rounded-xl border border-gray-200 shadow-inner">
              {dataUrl && (
                <img
                  src={dataUrl}
                  alt="High Resolution QR Code"
                  decoding="async"
                  className="w-48 h-48 object-contain"
                />
              )}
            </div>

            <div className="space-y-1.5 text-center">
              <span className="font-mono font-bold text-xs text-gray-800 dark:text-gray-200 block">
                {label || 'ডিজিটাল বালাম যাচাই'}
              </span>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                আপনার মোবাইল ফোনের ক্যামেরা বা যে কোনো কিউআর স্ক্যানার দিয়ে স্ক্যান করে সংরক্ষিত ফলাফল যাচাই করতে পারেন।
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-[10px] font-mono text-gray-600 dark:text-gray-300 max-h-24 overflow-y-auto whitespace-pre-wrap leading-tight text-left">
              {value}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                onClick={handleDownload}
                className="gov-btn-primary text-xs py-2 justify-center flex items-center gap-1.5 font-bold shadow"
              >
                <Download className="w-3.5 h-3.5" />
                <span>কিউআর ডাউনলোড</span>
              </Button>

              <Button
                onClick={handleCopy}
                className="gov-btn-secondary text-xs py-2 justify-center flex items-center gap-1.5 font-bold"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'কপি হয়েছে!' : 'তথ্য কপি'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import {
  INITIAL_GREETING,
  QUICK_PROMPTS,
  askLandAI
} from '../utils/landChatbotEngine';
import {
  MessageSquare, X, Send, Bot, User, Sparkles,
  Maximize2, Minimize2, RotateCcw, Copy, Check,
  ThumbsUp, ThumbsDown, Mic, MicOff, ExternalLink,
  ChevronDown
} from 'lucide-react';

export default function LiveChatWidget({ setActiveTab }) {
  const { lang } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showPill, setShowPill] = useState(true);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [feedbackState, setFeedbackState] = useState({});
  const [isListening, setIsListening] = useState(false);
  const [chatStatus, setChatStatus] = useState({
    status: 'online',
    provider: 'BhumiSathi Knowledge Engine',
    ai_configured: false
  });

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamIntervalRef = useRef(null);

  // Fetch AI backend service status
  useEffect(() => {
    api.getChatStatus()
      .then(res => {
        if (res && res.provider) {
          setChatStatus(res);
        }
      })
      .catch(err => {
        console.warn('Chat status lookup notice:', err);
      });
  }, []);

  // Initialize greeting on first load or language change
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          sender: 'ai',
          text: INITIAL_GREETING[lang]?.text || INITIAL_GREETING.bn.text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          action: null
        }
      ]);
    }
  }, [lang]);

  // Auto-scroll to bottom of conversation
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking, isStreaming]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // Setup Web Speech API for voice recognition if available
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = lang === 'bn' ? 'bn-BD' : 'en-US';

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => (prev ? prev + ' ' : '') + transcript);
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [lang]);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert(lang === 'bn' ? 'আপনার ব্রাউজারে ভয়েস রিকগনিশন সমর্থিত নয়।' : 'Voice recognition is not supported in this browser.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.lang = lang === 'bn' ? 'bn-BD' : 'en-US';
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        setIsListening(false);
      }
    }
  };

  // Stream AI response like ChatGPT
  const streamResponse = (fullText, action) => {
    setIsThinking(false);
    setIsStreaming(true);

    const messageId = Date.now().toString();
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Append empty message placeholder
    setMessages(prev => [
      ...prev,
      {
        id: messageId,
        sender: 'ai',
        text: '',
        time: timestamp,
        action: action || null
      }
    ]);

    let currentIndex = 0;
    const chunkSize = 3; // stream 3 characters/words at a time for fast realistic feel
    const stepInterval = 16; // 60fps pacing

    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
    }

    streamIntervalRef.current = setInterval(() => {
      currentIndex += chunkSize;
      const partialText = fullText.slice(0, currentIndex);

      setMessages(prev =>
        prev.map(msg =>
          msg.id === messageId ? { ...msg, text: partialText } : msg
        )
      );

      if (currentIndex >= fullText.length) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
        setIsStreaming(false);
      }
    }, stepInterval);
  };

  const handleSend = async (queryToSend) => {
    const textToSend = typeof queryToSend === 'string' ? queryToSend : input;
    if (!textToSend || !textToSend.trim() || isStreaming) return;

    const userMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsThinking(true);

    try {
      const historyPayload = messages
        .filter(m => m.id !== 'welcome' && m.id !== 'welcome-reset')
        .slice(-8)
        .map(m => ({ sender: m.sender, text: m.text }));

      const response = await api.sendChatMessage({
        message: textToSend.trim(),
        history: historyPayload
      });

      if (response && response.provider) {
        setChatStatus(prev => ({
          ...prev,
          provider: response.provider,
          ai_configured: response.ai_configured
        }));
      }

      let action = null;
      if (response.referenced_application) {
        action = {
          type: 'navigate',
          tab: 'mutation-track',
          trackingNo: response.referenced_application.tracking_no,
          label: lang === 'bn'
            ? `আবেদন ট্র্যাকিং দেখুন (${response.referenced_application.tracking_no})`
            : `Track Application (${response.referenced_application.tracking_no})`
        };
      }

      streamResponse(response.reply || response.answer, action);
    } catch (err) {
      console.warn('Backend chat API failed, using grounded fallback engine:', err);
      const fallback = askLandAI(textToSend, lang);
      streamResponse(fallback.answer, fallback.action);
    }
  };

  const stopGeneration = () => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    setIsStreaming(false);
    setIsThinking(false);
  };

  const handleClearChat = () => {
    stopGeneration();
    setMessages([
      {
        id: 'welcome-reset',
        sender: 'ai',
        text: INITIAL_GREETING[lang]?.text || INITIAL_GREETING.bn.text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        action: null
      }
    ]);
  };

  const copyToClipboard = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const setFeedback = (msgId, type) => {
    setFeedbackState(prev => ({
      ...prev,
      [msgId]: prev[msgId] === type ? null : type
    }));
  };

  // Basic formatted markdown parser for headers, bold, tables, lists
  const renderFormattedText = (rawText) => {
    if (!rawText) return null;

    const lines = rawText.split('\n');
    return (
      <div className="space-y-2 text-xs sm:text-[13px] leading-relaxed text-gray-800 dark:text-gray-100">
        {lines.map((line, lIdx) => {
          const trimmed = line.trim();

          // Markdown headers ###
          if (trimmed.startsWith('### ')) {
            return (
              <h4 key={lIdx} className="font-bold text-sm sm:text-base text-[#0b462d] dark:text-emerald-400 mt-2 mb-1 border-b border-emerald-500/20 pb-1 flex items-center gap-1.5">
                {trimmed.replace('### ', '')}
              </h4>
            );
          }
          if (trimmed.startsWith('#### ')) {
            return (
              <h5 key={lIdx} className="font-bold text-xs sm:text-sm text-amber-700 dark:text-amber-300 mt-2 mb-1">
                {trimmed.replace('#### ', '')}
              </h5>
            );
          }

          // Bullet points * or -
          if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
            const content = trimmed.substring(2);
            return (
              <div key={lIdx} className="flex items-start gap-2 pl-2">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                <span>{renderInlineFormatting(content)}</span>
              </div>
            );
          }

          // Numbered lists 1. 2. 3.
          if (/^\d+\.\s/.test(trimmed)) {
            const num = trimmed.match(/^\d+\./)[0];
            const content = trimmed.replace(/^\d+\.\s/, '');
            return (
              <div key={lIdx} className="flex items-start gap-2 pl-2">
                <span className="text-[#0b462d] dark:text-emerald-400 font-bold min-w-[18px]">{num}</span>
                <span>{renderInlineFormatting(content)}</span>
              </div>
            );
          }

          // Table divider or table row (lightweight representation)
          if (trimmed.startsWith('|')) {
            const cells = trimmed.split('|').filter(c => c.trim().length > 0);
            if (trimmed.includes('---')) return null; // skip markdown table separator
            return (
              <div key={lIdx} className="grid grid-cols-3 gap-1 bg-emerald-50/50 dark:bg-emerald-950/30 p-1.5 rounded text-[11px] font-mono border border-emerald-200/50 dark:border-emerald-800/50">
                {cells.map((cell, cIdx) => (
                  <div key={cIdx} className="px-1 overflow-hidden text-ellipsis">
                    {renderInlineFormatting(cell.trim())}
                  </div>
                ))}
              </div>
            );
          }

          // Empty line
          if (!trimmed) {
            return <div key={lIdx} className="h-1" />;
          }

          // Regular paragraph
          return <p key={lIdx}>{renderInlineFormatting(trimmed)}</p>;
        })}
      </div>
    );
  };

  // Inline formatting for **bold** and `code`
  const renderInlineFormatting = (text) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-gray-950 dark:text-white">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} className="bg-emerald-100/70 dark:bg-emerald-950/60 text-[#0b462d] dark:text-emerald-300 px-1 py-0.5 rounded font-mono text-[11px]">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  return (
    <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end">
      {/* Live Chat Modal Popup (ChatGPT-Style UI) */}
      {isOpen && (
        <div
          className={`mb-4 flex flex-col bg-white dark:bg-[#111915] border border-gray-300 dark:border-emerald-800/60 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 animate-fade-up ${
            isMaximized
              ? 'w-[95vw] sm:w-[85vw] max-w-4xl h-[88vh]'
              : 'w-[92vw] sm:w-[420px] h-[580px] max-h-[85vh]'
          }`}
          style={{
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(11, 70, 45, 0.15)'
          }}
        >
          {/* ChatGPT Style Premium Header */}
          <div className="bg-gradient-to-r from-[#065F46] via-[#047857] to-[#0b462d] text-white p-3.5 sm:p-4 flex items-center justify-between border-b border-emerald-600/30 shadow-md">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-[#F5B544] flex items-center justify-center text-slate-950 font-black shadow-lg">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-[#065F46] rounded-full animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm sm:text-base leading-tight tracking-wide">
                    {lang === 'bn' ? 'ভূমিসেতু এআই সহকারী' : 'Bhumisetu AI Assistant'}
                  </h3>
                  <span className="bg-[#F5B544]/30 text-[#F5B544] text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#F5B544]/50 font-bold">
                    {chatStatus.ai_configured ? 'Gemini Live' : 'Domain AI'}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-100 flex items-center gap-1.5">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${chatStatus.ai_configured ? 'bg-emerald-300 animate-ping' : 'bg-amber-300'}`}></span>
                  <span className="truncate max-w-[200px]">{chatStatus.provider || (lang === 'bn' ? 'অনলাইন · রিয়েলটাইম ভূমি বিশেষজ্ঞ' : 'Online · Land Expert')}</span>
                </p>
              </div>
            </div>

            {/* Header Control Buttons */}
            <div className="flex items-center gap-1 text-emerald-200">
              <button
                onClick={handleClearChat}
                title={lang === 'bn' ? 'চ্যাট নতুন করে শুরু করুন' : 'Clear conversation'}
                className="p-1.5 hover:bg-white/10 rounded-lg transition"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                title={isMaximized ? (lang === 'bn' ? 'ছোট করুন' : 'Restore') : (lang === 'bn' ? 'বড় করুন' : 'Maximize')}
                className="p-1.5 hover:bg-white/10 rounded-lg transition hidden sm:inline-flex"
              >
                {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title={lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
                className="p-1.5 hover:bg-white/10 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/60 dark:bg-[#0c1410] drawer-scrollbar">
            {/* Quick Prompts Carousel if conversation is short */}
            {messages.length <= 1 && (
              <div className="space-y-2 mb-4 p-3 bg-white dark:bg-[#14211a] rounded-xl border border-emerald-100 dark:border-emerald-900/50 shadow-sm">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-emerald-300 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#c59b27] animate-pulse" />
                  <span>{lang === 'bn' ? 'জনপ্রিয় প্রশ্নসমূহ (ক্লিক করুন):' : 'Frequently Asked Topics:'}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {QUICK_PROMPTS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSend(p.query)}
                      className="text-left text-xs p-2.5 rounded-lg bg-gray-50 dark:bg-[#1a2b22] hover:bg-emerald-50 dark:hover:bg-emerald-950/70 border border-gray-200/70 dark:border-emerald-800/40 text-gray-800 dark:text-gray-200 transition flex items-start gap-2 hover:border-emerald-500 hover:shadow"
                    >
                      <span className="text-sm">{p.icon}</span>
                      <span className="font-medium leading-snug">
                        {lang === 'bn' ? p.labelBn : p.labelEn}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((msg, idx) => {
              const isAi = msg.sender === 'ai';
              return (
                <div
                  key={msg.id || idx}
                  className={`flex items-start gap-2.5 ${isAi ? 'justify-start' : 'justify-end'}`}
                >
                  {isAi && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#0b462d] to-emerald-600 flex items-center justify-center text-white text-xs font-bold shadow-md shrink-0 mt-1">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-[85%] sm:max-w-[80%] space-y-1.5`}>
                    <div
                      className={`p-3.5 rounded-2xl shadow-sm text-xs sm:text-[13px] ${
                        isAi
                          ? 'bg-white dark:bg-[#16231d] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-emerald-900/40 rounded-tl-none'
                          : 'bg-[#0b462d] text-white rounded-tr-none shadow-md'
                      }`}
                    >
                      {isAi ? (
                        renderFormattedText(msg.text)
                      ) : (
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                      )}

                      {/* In-chat action button if suggested by AI */}
                      {isAi && msg.action && setActiveTab && (
                        <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-800/80">
                          <button
                            onClick={() => {
                              setActiveTab(msg.action.tab);
                              if (window.innerWidth < 640) setIsOpen(false);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0b462d] hover:bg-[#12583a] text-white text-xs font-semibold shadow hover:scale-105 transition"
                          >
                            <span>{msg.action.label || (lang === 'bn' ? msg.action.labelBn : msg.action.labelEn)}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Message Meta & Action Bar for AI */}
                    <div className={`flex items-center gap-2 px-1 text-[10px] text-gray-400 dark:text-gray-500 ${isAi ? 'justify-start' : 'justify-end'}`}>
                      <span>{msg.time}</span>
                      {isAi && msg.text && (
                        <div className="flex items-center gap-1.5 ml-2">
                          <button
                            onClick={() => copyToClipboard(msg.text, idx)}
                            title={lang === 'bn' ? 'কপি করুন' : 'Copy'}
                            className="p-1 hover:text-gray-600 dark:hover:text-gray-300 transition"
                          >
                            {copiedIndex === idx ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            onClick={() => setFeedback(msg.id, 'like')}
                            title={lang === 'bn' ? 'উপকারী' : 'Helpful'}
                            className={`p-1 hover:text-emerald-500 transition ${feedbackState[msg.id] === 'like' ? 'text-emerald-500' : ''}`}
                          >
                            <ThumbsUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setFeedback(msg.id, 'dislike')}
                            title={lang === 'bn' ? 'উপকারী নয়' : 'Not helpful'}
                            className={`p-1 hover:text-red-500 transition ${feedbackState[msg.id] === 'dislike' ? 'text-red-500' : ''}`}
                          >
                            <ThumbsDown className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {!isAi && (
                    <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200 text-xs font-bold shadow-sm shrink-0 mt-1">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* AI Thinking Bouncing Indicator */}
            {isThinking && (
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#0b462d] to-emerald-600 flex items-center justify-center text-white text-xs font-bold shadow-md shrink-0 mt-1">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="p-3 bg-white dark:bg-[#16231d] border border-gray-200 dark:border-emerald-900/40 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium ml-1">
                    {lang === 'bn' ? 'বিশ্লেষণ চলছে...' : 'Analyzing query...'}
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Streaming Stop Bar if Generating */}
          {isStreaming && (
            <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-ping" />
                {lang === 'bn' ? 'উত্তর তৈরি হচ্ছে...' : 'Generating response...'}
              </span>
              <button
                onClick={stopGeneration}
                className="font-bold underline text-xs hover:text-amber-950 dark:hover:text-amber-100"
              >
                {lang === 'bn' ? 'থামুন' : 'Stop'}
              </button>
            </div>
          )}

          {/* Input Box Area */}
          <div className="p-3 bg-white dark:bg-[#111915] border-t border-gray-200 dark:border-emerald-900/40">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2 bg-gray-50 dark:bg-[#18261f] border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-1.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={lang === 'bn' ? 'ভূমি সংক্রান্ত যেকোনো প্রশ্ন লিখুন...' : 'Ask any land or deed related question...'}
                disabled={isStreaming}
                className="flex-1 bg-transparent text-xs sm:text-sm text-gray-900 dark:text-gray-100 outline-none placeholder-gray-400 dark:placeholder-gray-500"
              />

              {/* Voice Input Button */}
              <button
                type="button"
                onClick={toggleVoiceInput}
                title={isListening ? (lang === 'bn' ? 'মাইক্রোফোন বন্ধ করুন' : 'Stop listening') : (lang === 'bn' ? 'ভয়েস দিয়ে বলুন' : 'Voice input')}
                className={`p-1.5 rounded-lg transition ${
                  isListening
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'text-gray-400 hover:text-gray-700 dark:hover:text-white'
                }`}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Send Button */}
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="p-1.5 bg-[#0b462d] hover:bg-[#145e3c] disabled:opacity-40 disabled:hover:bg-[#0b462d] text-white rounded-lg transition shadow-sm"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            <div className="flex items-center justify-between mt-1.5 px-1 text-[10px] text-gray-400 dark:text-gray-500">
              <span>{lang === 'bn' ? '🛡️ নিরাপদ AI পরামর্শক' : '🛡️ Secure AI Advisory'}</span>
              <span>{lang === 'bn' ? 'Enter টিপে পাঠান' : 'Press Enter to send'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Trigger Button & Pill (Matches Screenshot 3) */}
      <div className="flex items-center gap-3 select-none">
        {/* Pill Bubble: "✖ লাইভ চ্যাট 👋" */}
        {showPill && !isOpen && (
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs sm:text-sm font-bold px-3.5 py-2 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 animate-float-gentle transition hover:shadow-2xl">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowPill(false);
              }}
              className="text-gray-400 hover:text-gray-700 dark:hover:text-white p-0.5 rounded transition"
              title={lang === 'bn' ? 'লুকান' : 'Dismiss'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <span
              onClick={() => setIsOpen(true)}
              className="cursor-pointer flex items-center gap-1.5 hover:text-[#0b462d] dark:hover:text-emerald-400 transition"
            >
              <span>{lang === 'bn' ? 'লাইভ চ্যাট' : 'Live Chat'}</span>
              <span className="text-sm">👋</span>
            </span>
          </div>
        )}

        {/* Circular Floating Chat Launcher Button (Screenshot 3) */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle Live Chat"
          className="w-14 h-14 rounded-full bg-[#0b7e4a] hover:bg-[#09663b] text-white shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 relative group border-2 border-white dark:border-gray-800 ring-4 ring-emerald-500/20"
          style={{
            boxShadow: '0 8px 24px rgba(11, 126, 74, 0.4), 0 2px 6px rgba(0, 0, 0, 0.15)'
          }}
        >
          {isOpen ? (
            <ChevronDown className="w-7 h-7 transition-transform" />
          ) : (
            <MessageSquare className="w-7 h-7 text-white fill-white transition-transform group-hover:scale-110" />
          )}

          {/* Green Online Dot */}
          {!isOpen && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white dark:border-gray-800" />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

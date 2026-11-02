import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Minus, Plus, Trash2, Upload, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import { clearProfilePictureCache } from '../utils/profilePictureCache';
import Button from './Button';
import ProfileAvatar from './ProfileAvatar';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CROP_SIZE = 256;

export default function ProfilePictureEditor() {
  const { user, setUser, lang } = useApp();
  const [open, setOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const [imageSize, setImageSize] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInput = useRef(null);
  const previewImage = useRef(null);
  const dragStart = useRef(null);
  const isBn = lang === 'bn';

  const displaySize = useMemo(() => {
    if (!imageSize) return null;
    const scale = Math.max(CROP_SIZE / imageSize.width, CROP_SIZE / imageSize.height) * zoom;
    return { width: imageSize.width * scale, height: imageSize.height * scale };
  }, [imageSize, zoom]);

  useEffect(() => {
    if (!sourceUrl) {
      setImageSize(null);
      previewImage.current = null;
      return undefined;
    }
    let active = true;
    setImageSize(null);
    previewImage.current = null;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      previewImage.current = image;
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      const scale = Math.max(CROP_SIZE / image.naturalWidth, CROP_SIZE / image.naturalHeight);
      setOffset({
        x: (CROP_SIZE - image.naturalWidth * scale) / 2,
        y: (CROP_SIZE - image.naturalHeight * scale) / 2,
      });
      setZoom(1);
    };
    image.onerror = () => {
      if (active) setError(isBn ? 'ছবিটি খোলা যায়নি। অন্য ছবি বেছে নিন।' : 'Could not open this image. Choose another one.');
    };
    image.src = sourceUrl;
    return () => { active = false; };
  }, [sourceUrl, isBn]);

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) closeEditor();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy]);

  useEffect(() => {
    if (!displaySize) return;
    setOffset((current) => ({
      x: Math.min(0, Math.max(CROP_SIZE - displaySize.width, current.x)),
      y: Math.min(0, Math.max(CROP_SIZE - displaySize.height, current.y)),
    }));
  }, [displaySize]);

  function closeEditor() {
    if (busy) return;
    setOpen(false);
    setError('');
    setProgress(0);
    setSourceUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
    if (fileInput.current) fileInput.current.value = '';
  }

  function chooseFile(event) {
    const file = event.target.files?.[0];
    setError('');
    if (!file) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      setSourceUrl('');
      setError(isBn ? 'শুধু JPG, PNG অথবা WebP ছবি ব্যবহার করুন।' : 'Choose a JPG, PNG, or WebP image.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setSourceUrl('');
      setError(isBn ? 'ছবির আকার সর্বোচ্চ ৫ MB হতে পারে।' : 'The image must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }
    setSourceUrl(URL.createObjectURL(file));
  }

  function handlePointerDown(event) {
    if (!displaySize) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset };
  }

  function handlePointerMove(event) {
    if (!dragStart.current || dragStart.current.pointerId !== event.pointerId || !displaySize) return;
    const dx = event.clientX - dragStart.current.x;
    const dy = event.clientY - dragStart.current.y;
    setOffset({
      x: Math.min(0, Math.max(CROP_SIZE - displaySize.width, dragStart.current.offset.x + dx)),
      y: Math.min(0, Math.max(CROP_SIZE - displaySize.height, dragStart.current.offset.y + dy)),
    });
  }

  function handlePointerUp(event) {
    if (dragStart.current?.pointerId === event.pointerId) dragStart.current = null;
  }

  async function makeCroppedFile() {
    const image = previewImage.current;
    if (!image || !displaySize) throw new Error(isBn ? 'আগে একটি ছবি নির্বাচন করুন।' : 'Choose an image first.');
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(isBn ? 'ছবি প্রস্তুত করা যায়নি।' : 'Could not prepare the image.');
    context.drawImage(image, offset.x * 2, offset.y * 2, displaySize.width * 2, displaySize.height * 2);
    const webp = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
    const blob = webp || await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error(isBn ? 'ছবি প্রস্তুত করা যায়নি।' : 'Could not prepare the image.');
    return blob;
  }

  async function savePicture() {
    setError('');
    setBusy(true);
    setProgress(0);
    try {
      const blob = await makeCroppedFile();
      const formData = new FormData();
      formData.append('file', blob, blob.type === 'image/webp' ? 'profile.webp' : 'profile.jpg');
      const result = await api.uploadProfilePicture(formData, setProgress);
      if (!result?.profile_picture) throw new Error(isBn ? 'ছবির তথ্য সংরক্ষণ করা যায়নি।' : 'The saved picture could not be confirmed.');
      clearProfilePictureCache();
      setUser((current) => current ? { ...current, profile_picture: result.profile_picture } : current);
      setBusy(false);
      closeEditor();
    } catch (saveError) {
      setError(saveError.message || (isBn ? 'ছবি সংরক্ষণ করা যায়নি।' : 'Could not save the picture.'));
      setBusy(false);
    }
  }

  async function removePicture() {
    setError('');
    setBusy(true);
    try {
      await api.removeProfilePicture();
      clearProfilePictureCache();
      setUser((current) => current ? { ...current, profile_picture: null } : current);
      setBusy(false);
      closeEditor();
    } catch (removeError) {
      setError(removeError.message || (isBn ? 'ছবি সরানো যায়নি।' : 'Could not remove the picture.'));
      setBusy(false);
    }
  }

  if (!user) return <ProfileAvatar user={user} className="h-16 w-16 border-2 border-[#c59b27] text-2xl shadow" />;

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setError(''); }}
        aria-label={isBn ? 'প্রোফাইল ছবি পরিবর্তন করুন' : 'Change profile picture'}
        className="group inline-flex shrink-0 flex-col items-center gap-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
      >
        <span className="relative inline-flex rounded-full">
          <ProfileAvatar user={user} className="h-16 w-16 border-2 border-[#c59b27] text-2xl shadow" />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
          </span>
        </span>
        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">{isBn ? 'ছবি পরিবর্তন' : 'Change photo'}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeEditor(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="profile-picture-title" className="w-full max-w-md rounded-2xl border border-white/60 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="profile-picture-title" className="text-base font-bold text-slate-900 dark:text-white">{isBn ? 'প্রোফাইল ছবি' : 'Profile picture'}</h2>
              <Button type="button" onClick={closeEditor} disabled={busy} aria-label={isBn ? 'বন্ধ করুন' : 'Close'} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></Button>
            </div>

            <div className="flex flex-col items-center gap-4">
              {sourceUrl && imageSize ? (
                <div
                  className="relative h-64 w-64 touch-none select-none overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  aria-label={isBn ? 'ছবির অবস্থান টেনে ঠিক করুন' : 'Drag to position the crop'}
                >
                  <img ref={(element) => { if (element && !previewImage.current) previewImage.current = element; }} src={sourceUrl} alt={isBn ? 'প্রোফাইল ছবির ক্রপ প্রিভিউ' : 'Profile picture crop preview'} draggable="false" className="pointer-events-none absolute max-w-none" style={{ width: displaySize.width, height: displaySize.height, left: offset.x, top: offset.y }} />
                </div>
              ) : (
                <div className="flex h-64 w-64 flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 text-slate-400 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                  <ProfileAvatar user={user} className="h-20 w-20 text-2xl" />
                  <span className="text-xs">{isBn ? 'ছবি বেছে নিয়ে ক্রপ করুন' : 'Choose and crop a picture'}</span>
                </div>
              )}

              {imageSize && <label className="flex w-64 items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                <Minus className="h-3.5 w-3.5 shrink-0" />
                <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="w-full accent-emerald-700" aria-label={isBn ? 'ছবি জুম' : 'Image zoom'} />
                <Plus className="h-3.5 w-3.5 shrink-0" />
              </label>}

              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} className="sr-only" aria-label={isBn ? 'ছবি নির্বাচন করুন' : 'Choose a picture'} />
              <Button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className="gov-btn-secondary flex items-center gap-2 text-xs">
                <Upload className="h-4 w-4" />{isBn ? 'ছবি নির্বাচন করুন' : 'Choose picture'}
              </Button>
              <p className="text-center text-[11px] text-slate-500">{isBn ? 'JPG, PNG বা WebP · সর্বোচ্চ ৫ MB · টেনে অবস্থান ঠিক করুন' : 'JPG, PNG, or WebP · Up to 5 MB · Drag to reposition'}</p>
            </div>

            {busy && <div className="mt-4" role="status" aria-live="polite">
              <div className="mb-1 flex justify-between text-[11px] text-slate-600 dark:text-slate-300"><span>{isBn ? 'ছবি সংরক্ষণ হচ্ছে…' : 'Saving picture…'}</span><span>{progress}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${progress}%` }} /></div>
            </div>}
            {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Button type="button" onClick={removePicture} disabled={busy || !user?.profile_picture} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-950/40"><Trash2 className="h-3.5 w-3.5" />{isBn ? 'ছবি সরান' : 'Remove picture'}</Button>
              <div className="flex gap-2">
                <Button type="button" onClick={closeEditor} disabled={busy} className="gov-btn-secondary px-3 py-2 text-xs">{isBn ? 'বাতিল' : 'Cancel'}</Button>
                <Button type="button" onClick={savePicture} disabled={busy || !sourceUrl || !imageSize} className="gov-btn-primary flex items-center gap-1.5 px-3 py-2 text-xs"><Check className="h-3.5 w-3.5" />{isBn ? 'সংরক্ষণ' : 'Save'}</Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

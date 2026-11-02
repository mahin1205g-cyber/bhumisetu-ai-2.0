import React, { useEffect, useState } from 'react';
import { loadProfilePicture } from '../utils/profilePictureCache';

const AVATAR_COLORS = [
  '#047857', '#1d4ed8', '#7c3aed', '#b45309', '#be123c', '#0e7490', '#4d7c0f', '#6d28d9',
];

function getUsernameAvatar(username = '') {
  const value = String(username).trim() || 'user';
  let hash = 0;
  for (const character of value.toLowerCase()) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return {
    initial: Array.from(value)[0]?.toLocaleUpperCase() || 'U',
    color: AVATAR_COLORS[hash % AVATAR_COLORS.length],
  };
}

export default function ProfileAvatar({ user, className = 'h-10 w-10', title }) {
  const [pictureUrl, setPictureUrl] = useState(null);
  const username = String(user?.username || '').trim();
  const { initial, color } = getUsernameAvatar(username);

  useEffect(() => {
    let active = true;
    setPictureUrl(null);
    if (user?.id && user?.profile_picture) {
      loadProfilePicture(user.id, user.profile_picture)
        .then((url) => { if (active) setPictureUrl(url); })
        .catch(() => { if (active) setPictureUrl(null); });
    }
    return () => { active = false; };
  }, [user?.id, user?.profile_picture]);

  const label = title || (username ? `${username} profile picture` : 'User profile picture');
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ${className}`}
      style={{ backgroundColor: color }}
    >
      {pictureUrl
        ? <img src={pictureUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        : <span aria-hidden="true">{initial}</span>}
    </span>
  );
}

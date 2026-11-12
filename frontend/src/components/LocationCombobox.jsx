import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, MapPin } from 'lucide-react';
import Input from './Input';

const normalize = (value) => String(value || '')
  .normalize('NFKC')
  .trim()
  .toLocaleLowerCase()
  .replace(/[\p{P}\p{S}\s_]+/gu, '');

export const displayLocationName = (item, lang) => (
  lang === 'bn'
    ? (item?.name_bn || item?.name_en || item?.code)
    : (item?.name_en || item?.name_bn || item?.code)
);

/** Searchable, keyboard-accessible selection control shared by location and catalog fields. */
export default function LocationCombobox({
  id,
  value,
  selectedKey,
  items = [],
  lang = 'bn',
  disabled = false,
  placeholder = '',
  emptyText = '',
  className = 'gov-input',
  selectionOnly = false,
  nativeSelect = false,
  onTextChange,
  onSelect,
  onBlur,
  ...inputProps
}) {
  const inputRef = useRef(null);
  const optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [menuStyle, setMenuStyle] = useState(null);
  const query = normalize(selectionOnly && open ? searchText : value);

  const options = useMemo(() => {
    const unique = new Map();
    (items || []).forEach((item) => {
      const itemId = String(item.id ?? item.code ?? '');
      if (itemId && !unique.has(itemId)) unique.set(itemId, item);
    });
    const list = [...unique.values()];
    const counts = new Map();
    list.forEach((item) => {
      const labelKey = normalize(displayLocationName(item, lang));
      counts.set(labelKey, (counts.get(labelKey) || 0) + 1);
    });
    return list
      .filter((item) => !query || [item.name_bn, item.name_en, item.code]
        .some((label) => normalize(label).includes(query)))
      .map((item) => ({
        item,
        label: displayLocationName(item, lang),
        duplicate: (counts.get(normalize(displayLocationName(item, lang))) || 0) > 1,
      }));
  }, [items, lang, query]);

  const nativeOptions = useMemo(() => {
    const unique = new Map();
    (items || []).forEach((item) => {
      const optionValue = String(item.id ?? item.code ?? '');
      if (optionValue && !unique.has(optionValue)) unique.set(optionValue, item);
    });
    const counts = new Map();
    [...unique.values()].forEach((item) => {
      const label = displayLocationName(item, lang);
      const key = normalize(label);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...unique.entries()].map(([optionValue, item]) => {
      const label = displayLocationName(item, lang);
      return {
        item,
        value: optionValue,
        label,
        displayLabel: counts.get(normalize(label)) > 1 ? `${label} (${item.code || item.id})` : label,
      };
    });
  }, [items, lang]);

  const selectedNativeValue = selectedKey !== undefined && selectedKey !== null
    ? String(selectedKey)
    : (nativeOptions.find(({ label }) => String(label) === String(value || ''))?.value || '');

  if (selectionOnly && nativeSelect) {
    const nativeClassName = className.replace(/\bgov-input\b/g, 'gov-select');
    return (
      <Input
        {...inputProps}
        as="select"
        id={id}
        value={selectedNativeValue}
        disabled={disabled}
        className={nativeClassName}
        onChange={(event) => {
          const selected = nativeOptions.find((option) => option.value === event.target.value)?.item;
          if (selected) onSelect?.(selected);
          else onTextChange?.('');
        }}
        onBlur={onBlur}
      >
        <option value="">{placeholder}</option>
        {nativeOptions.map(({ value: optionValue, displayLabel }) => (
          <option key={optionValue} value={optionValue}>{displayLabel}</option>
        ))}
      </Input>
    );
  }

  const updateMenuPosition = () => {
    const anchor = inputRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const gap = 6;
    const viewportPadding = 8;
    const maxHeight = 224;
    const roomBelow = Math.max(0, window.innerHeight - rect.bottom - gap - viewportPadding);
    const roomAbove = Math.max(0, rect.top - gap - viewportPadding);
    const openAbove = roomBelow < Math.min(200, maxHeight) && roomAbove > roomBelow;
    const availableHeight = openAbove ? roomAbove : roomBelow;
    const height = Math.max(96, Math.min(maxHeight, availableHeight || maxHeight));
    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    );
    const top = openAbove
      ? Math.max(viewportPadding, rect.top - height - gap)
      : Math.min(rect.bottom + gap, window.innerHeight - height - viewportPadding);
    setMenuStyle({ position: 'fixed', left, top, width, maxHeight: height, zIndex: 10000 });
  };

  useEffect(() => {
    if (!open || disabled) return undefined;
    updateMenuPosition();
    const handleViewportChange = () => updateMenuPosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, disabled, options.length]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open]);

  const choose = (item) => {
    onSelect?.(item);
    setOpen(false);
    setSearchText('');
    setActiveIndex(0);
  };

  const menu = open && !disabled && menuStyle && typeof document !== 'undefined'
    ? createPortal(
      <div
        id={`${id}-listbox`}
        role="listbox"
        className="location-combobox-menu overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        style={menuStyle}
      >
        {options.length ? options.map(({ item, label, duplicate }, index) => (
          <button
            ref={(node) => { optionRefs.current[index] = node; }}
            id={`${id}-option-${index}`}
            key={item.id ?? item.code}
            type="button"
            role="option"
            aria-selected={String(label) === String(value || '')}
            onPointerMove={() => setActiveIndex(index)}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => choose(item)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${index === activeIndex ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
          >
            <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {duplicate && <span className="shrink-0 text-[10px] text-slate-400">{item.code || item.id}</span>}
          </button>
        )) : (
          <div className="px-3 py-2 text-xs text-slate-500" role="status">{emptyText}</div>
        )}
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <div className="relative min-w-0">
        <div className="relative">
          <Input
            {...inputProps}
            ref={inputRef}
            id={id}
            type="text"
            value={selectionOnly && open ? searchText : (value || '')}
            disabled={disabled}
            placeholder={placeholder}
            className={`${className} pr-10`}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={open && !disabled}
            aria-controls={`${id}-listbox`}
            aria-activedescendant={open && options.length ? `${id}-option-${activeIndex}` : undefined}
            onChange={(event) => {
              if (selectionOnly) {
                setSearchText(event.target.value);
                onTextChange?.('');
              } else {
                onTextChange?.(event.target.value);
              }
              setActiveIndex(0);
              setOpen(true);
            }}
            onFocus={() => {
              if (disabled) return;
              if (selectionOnly) setSearchText('');
              setActiveIndex(0);
              setOpen(true);
            }}
            onBlur={(event) => {
              setOpen(false);
              setSearchText('');
              onBlur?.(event);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === 'Enter' && open && options.length) {
                event.preventDefault();
                choose(options[activeIndex]?.item || options[0].item);
              } else if (selectionOnly && event.key === 'Enter' && open) {
                event.preventDefault();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
                setSearchText('');
              } else if (event.key === 'Tab') {
                setOpen(false);
                setSearchText('');
              }
            }}
          />
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </div>
      </div>
      {menu}
    </>
  );
}

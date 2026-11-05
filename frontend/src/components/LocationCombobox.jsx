import { useMemo, useState } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import Input from './Input';

const normalize = (value) => String(value || '')
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[\p{P}\p{S}\s_]+/gu, '');

export const displayLocationName = (item, lang) => (
  lang === 'bn'
    ? (item?.name_bn || item?.name_en || item?.code)
    : (item?.name_en || item?.name_bn || item?.code)
);

/** Search by both official labels, while showing only the active-language label. */
export default function LocationCombobox({
  id,
  value,
  items = [],
  lang = 'bn',
  disabled = false,
  placeholder = '',
  emptyText = '',
  className = 'gov-input',
  onTextChange,
  onSelect,
  onBlur,
  ...inputProps
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const query = normalize(value);
  const options = useMemo(() => {
    const unique = new Map();
    (items || []).forEach((item) => {
      const idValue = String(item.id ?? item.code ?? '');
      if (idValue && !unique.has(idValue)) unique.set(idValue, item);
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

  const choose = (item) => {
    onSelect?.(item);
    setOpen(false);
    setActiveIndex(0);
  };

  return (
    <div className="relative min-w-0">
      <div className="relative">
        <Input
          {...inputProps}
          id={id}
          type="text"
          value={value || ''}
          disabled={disabled}
          placeholder={placeholder}
          className={`${className} pr-10`}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && !disabled}
          aria-controls={`${id}-listbox`}
          onChange={(event) => {
            onTextChange?.(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => !disabled && setOpen(true)}
          onBlur={(event) => {
            setOpen(false);
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
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </div>
      {open && !disabled && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+4px)] z-[80] max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {options.length ? options.map(({ item, label, duplicate }, index) => (
            <button
              key={item.id ?? item.code}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
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
        </div>
      )}
    </div>
  );
}

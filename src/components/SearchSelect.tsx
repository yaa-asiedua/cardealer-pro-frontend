import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

interface SearchSelectProps<T> {
  placeholder: string;
  selected: T | null;
  onSelect: (item: T | null) => void;
  fetchOptions: (query: string) => Promise<T[]>;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string;
  minChars?: number;
}

// A small async search-and-pick combobox, used for customer/vehicle pickers
// across several forms (Sales, Rentals) — the same interaction repeated is
// what justifies making this generic rather than duplicating it.
// minChars defaults to 0 so focusing the field alone shows an initial
// list of options (like a normal dropdown) rather than requiring the user
// to already know to type something before anything appears.
export function SearchSelect<T>({
  placeholder,
  selected,
  onSelect,
  fetchOptions,
  getId,
  getLabel,
  getSubLabel,
  minChars = 0,
}: SearchSelectProps<T>) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<T[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < minChars) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const t = setTimeout(() => {
      fetchOptions(query)
        .then((res) => !cancelled && setOptions(res))
        .catch(() => !cancelled && setOptions([]))
        .finally(() => !cancelled && setIsLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, minChars, fetchOptions]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm">
        <div>
          <div className="font-medium text-ink">{getLabel(selected)}</div>
          {getSubLabel && <div className="text-xs text-muted">{getSubLabel(selected)}</div>}
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="rounded-md p-1 text-muted hover:bg-card hover:text-ink"
          aria-label="Clear selection"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          className="w-full rounded-lg border border-border bg-card py-2 pl-8 pr-3 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
        />
      </div>

      {isOpen && query.trim().length >= minChars && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-border bg-card py-1 shadow-lg">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-muted">
              <Loader2 size={13} className="animate-spin" /> Searching…
            </div>
          ) : options.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted">No matches.</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {options.map((opt) => (
                <li key={getId(opt)}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(opt);
                      setQuery("");
                      setIsOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-surface"
                  >
                    <div className="font-medium text-ink">{getLabel(opt)}</div>
                    {getSubLabel && <div className="text-xs text-muted">{getSubLabel(opt)}</div>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

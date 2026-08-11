/**
 * LocationSelector — Country → State/Province → LGA/City cascade
 * Uses the `country-state-city` package for all data (no network calls).
 * Nigeria gets its 36 states + FCT and all LGAs.
 */
import { useEffect, useMemo, useState } from 'react';
import { Country, State, City } from 'country-state-city';
import { Label } from '@/components/ui/label';
import { ChevronDown, Loader2, MapPin } from 'lucide-react';

export interface LocationValue {
  country: string;      // country name  e.g. "Nigeria"
  countryCode: string;  // ISO 2-letter  e.g. "NG"
  region: string;       // state/province name
  regionCode: string;   // state ISO code e.g. "LA"
  district: string;     // LGA / city name
}

interface Props {
  value: LocationValue;
  onChange: (val: LocationValue) => void;
  required?: boolean;
}

// Light wrapper around native <select> that looks like our UI kit
function Spinner({
  label, value, options, onChange, placeholder, disabled = false, loading = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground/80">{label}</Label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled || loading}
          className={[
            'w-full appearance-none rounded-xl border border-input bg-background',
            'px-3 py-2.5 pr-9 text-sm shadow-sm outline-none transition-colors',
            'focus:border-amber-500 focus:ring-1 focus:ring-amber-400',
            disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-amber-400',
          ].join(' ')}
        >
          <option value="">{loading ? 'Loading…' : (placeholder ?? `Select ${label}`)}</option>
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>
    </div>
  );
}

// Build once — sorted country list
const ALL_COUNTRIES = Country.getAllCountries()
  .map(c => ({ value: c.isoCode, label: c.name, flag: c.flag }))
  .sort((a, b) => {
    // Nigeria first, then alphabetical
    if (a.value === 'NG') return -1;
    if (b.value === 'NG') return 1;
    return a.label.localeCompare(b.label);
  });

export default function LocationSelector({ value, onChange, required }: Props) {
  const { countryCode, regionCode } = value;

  // ── derived lists ─────────────────────────────────────────────────────────
  const stateOptions = useMemo(() => {
    if (!countryCode) return [];
    return State.getStatesOfCountry(countryCode)
      .map(s => ({ value: s.isoCode, label: s.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [countryCode]);

  const cityOptions = useMemo(() => {
    if (!countryCode || !regionCode) return [];
    return City.getCitiesOfState(countryCode, regionCode)
      .map(c => ({ value: c.name, label: c.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [countryCode, regionCode]);

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleCountry = (isoCode: string) => {
    const c = Country.getCountryByCode(isoCode);
    onChange({
      country: c?.name ?? '', countryCode: isoCode,
      region: '', regionCode: '', district: '',
    });
  };

  const handleState = (isoCode: string) => {
    const s = stateOptions.find(o => o.value === isoCode);
    onChange({ ...value, region: s?.label ?? '', regionCode: isoCode, district: '' });
  };

  const handleCity = (name: string) => {
    onChange({ ...value, district: name });
  };

  const stateLabel = useMemo(() => {
    if (!countryCode) return 'State / Province';
    if (countryCode === 'NG') return 'State';
    if (['US','AU','IN','BR','CA','MX'].includes(countryCode)) return 'State / Province';
    if (['GB'].includes(countryCode)) return 'County / Region';
    return 'State / Province';
  }, [countryCode]);

  const cityLabel = useMemo(() => {
    if (countryCode === 'NG') return 'Local Government Area (LGA)';
    return 'City / District';
  }, [countryCode]);

  const hasStates = stateOptions.length > 0;
  const hasCities = cityOptions.length > 0;

  return (
    <div className="space-y-3 rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">
        <MapPin className="h-3.5 w-3.5" /> Location
        {required && <span className="text-destructive ml-1">*</span>}
      </div>

      {/* Country */}
      <Spinner
        label="Country"
        value={countryCode}
        options={ALL_COUNTRIES.map(c => ({ value: c.value, label: `${c.flag}  ${c.label}` }))}
        onChange={handleCountry}
        placeholder="Select a country"
      />

      {/* State / Province */}
      {countryCode && (
        <Spinner
          label={stateLabel}
          value={regionCode}
          options={stateOptions}
          onChange={handleState}
          placeholder={hasStates ? `Select ${stateLabel}` : 'No states available'}
          disabled={!hasStates}
        />
      )}

      {/* LGA / City */}
      {countryCode && regionCode && (
        <Spinner
          label={cityLabel}
          value={value.district}
          options={hasCities ? cityOptions : []}
          onChange={handleCity}
          placeholder={hasCities ? `Select ${cityLabel}` : 'Type below if not listed'}
          disabled={!hasCities}
        />
      )}

      {/* Fallback text input for district when no city data is available */}
      {countryCode && regionCode && !hasCities && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground/80">{cityLabel} <span className="text-muted-foreground">(type if not in list)</span></Label>
          <input
            type="text"
            value={value.district}
            onChange={e => onChange({ ...value, district: e.target.value })}
            placeholder={`Enter ${cityLabel}…`}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm shadow-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-400"
          />
        </div>
      )}

      {/* Live preview pill */}
      {(value.country || value.region || value.district) && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[value.district, value.region, value.country].filter(Boolean).map((part, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-2.5 py-0.5 font-medium">
              {part}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

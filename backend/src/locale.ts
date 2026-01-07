type LocaleSignals = {
  deviceLocale?: string | null;
  simCountry?: string | null;
  ipCountry?: string | null;
};

type ResolvedLocale = {
  countryCode: string | null;
  confidence: number;
  sourceCount: number;
  matchCount: number;
  sources: {
    deviceCountry: string | null;
    simCountry: string | null;
    ipCountry: string | null;
  };
};

function normalizeCountryCode(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/-/g, '_').toUpperCase();
  const parts = normalized.split('_');
  if (parts.length > 1 && parts[1].length === 2) return parts[1];
  if (parts.length === 1 && normalized.length === 2) return normalized;
  return null;
}

function extractLanguageCode(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/-/g, '_');
  const parts = normalized.split('_');
  return parts[0]?.toLowerCase() ?? null;
}

function resolveLocaleSignals(signals: LocaleSignals): ResolvedLocale {
  const deviceCountry = normalizeCountryCode(signals.deviceLocale);
  const simCountry = normalizeCountryCode(signals.simCountry);
  const ipCountry = normalizeCountryCode(signals.ipCountry);
  const sources = [deviceCountry, simCountry, ipCountry].filter(
    (value) => value && value.length === 2,
  ) as string[];

  if (sources.length === 0) {
    return {
      countryCode: null,
      confidence: 0,
      sourceCount: 0,
      matchCount: 0,
      sources: {
        deviceCountry,
        simCountry,
        ipCountry,
      },
    };
  }

  const counts = new Map<string, number>();
  for (const source of sources) {
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }

  let matchCount = 0;
  for (const value of counts.values()) {
    if (value > matchCount) matchCount = value;
  }

  const preferredOrder = [simCountry, deviceCountry, ipCountry].filter(
    (value) => value && value.length === 2,
  ) as string[];

  let countryCode = preferredOrder.find(
    (value) => counts.get(value) === matchCount,
  );
  if (!countryCode) {
    countryCode = sources[0];
  }

  return {
    countryCode: countryCode ?? null,
    confidence: matchCount / sources.length,
    sourceCount: sources.length,
    matchCount,
    sources: {
      deviceCountry,
      simCountry,
      ipCountry,
    },
  };
}

function calculateLocaleTrustDelta(result: ResolvedLocale): number {
  if (result.sourceCount < 2) return 0;
  if (result.confidence >= 0.8 && result.matchCount >= 2) return 3;
  if (result.confidence >= 0.66) return 2;
  return 0;
}

function buildLocaleHashInput(data: {
  countryCode: string | null;
  languageCode: string | null;
  timezone: string | null;
  deviceLocale: string | null;
  simCountry: string | null;
  ipCountry: string | null;
}) {
  return [
    'v1',
    data.countryCode ?? '',
    data.languageCode ?? '',
    data.timezone ?? '',
    data.deviceLocale ?? '',
    data.simCountry ?? '',
    data.ipCountry ?? '',
  ].join('|');
}

export {
  normalizeCountryCode,
  extractLanguageCode,
  resolveLocaleSignals,
  calculateLocaleTrustDelta,
  buildLocaleHashInput,
};
export type { ResolvedLocale };

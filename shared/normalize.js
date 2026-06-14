const CORPORATE_SUFFIXES = /\b(?:pty|ltd|limited|proprietary)\b/gi;

export function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeLookup(value) {
  return cleanText(value)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeAgencyName(value) {
  return normalizeLookup(cleanText(value).replace(CORPORATE_SUFFIXES, ''));
}

export function buildFtsQuery(value) {
  return normalizeLookup(value)
    .split(' ')
    .filter((term) => term.length > 0)
    .slice(0, 10)
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
    .join(' AND ');
}


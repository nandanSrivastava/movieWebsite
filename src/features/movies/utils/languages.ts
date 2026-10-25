// Language filters are by what the audience hears: "Telugu (Hindi Dubbed)"
// plays in Hindi, so it shows under Hindi. "Hindi, Bhojpuri" counts for both.
export function spokenLanguages(language: string | null | undefined): string[] {
  if (!language) return [];
  const dubbed = language.match(/\(([^)]+?)\s*dubbed\)/i);
  if (dubbed) return [titleCase(dubbed[1])];
  return language
    .split(/[,/&|]+/)
    .map(part => titleCase(part.replace(/\(.*?\)/g, '').trim()))
    .filter(Boolean);
}

function titleCase(s: string) {
  return s.trim().toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase());
}

/** Distinct languages across movies, most common first. */
export function languageOptions(movies: { language?: string | null }[]): string[] {
  const counts = new Map<string, number>();
  for (const m of movies) {
    for (const lang of new Set(spokenLanguages(m.language))) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([lang]) => lang);
}

export function matchesLanguage(movie: { language?: string | null }, lang: string | null): boolean {
  return !lang || spokenLanguages(movie.language).includes(lang);
}

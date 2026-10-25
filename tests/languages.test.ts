import { describe, it, expect } from 'vitest';
import { spokenLanguages, languageOptions, matchesLanguage } from '../src/features/movies/utils/languages';

describe('language filter', () => {
  it('files dubbed releases under the language people hear', () => {
    expect(spokenLanguages('Telugu (Hindi Dubbed)')).toEqual(['Hindi']);
    expect(spokenLanguages('Tamil (hindi dubbed)')).toEqual(['Hindi']);
  });

  it('splits multi-language releases', () => {
    expect(spokenLanguages('Hindi, Bhojpuri')).toEqual(['Hindi', 'Bhojpuri']);
    expect(spokenLanguages('hindi / english')).toEqual(['Hindi', 'English']);
  });

  it('lists the most common language first', () => {
    const movies = [{ language: 'Hindi' }, { language: 'Bhojpuri' }, { language: 'Telugu (Hindi Dubbed)' }, { language: null }];
    expect(languageOptions(movies)).toEqual(['Hindi', 'Bhojpuri']);
  });

  it('matches everything when no language is picked', () => {
    expect(matchesLanguage({ language: 'Bhojpuri' }, null)).toBe(true);
    expect(matchesLanguage({ language: 'Bhojpuri' }, 'Hindi')).toBe(false);
  });
});

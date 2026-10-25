// Admin scheduling: every calendar date from start to end (inclusive), max 62.
export const getDatesInRange = (startStr: string, endStr: string): string[] => {
  if (!startStr) return [];
  if (!endStr || endStr < startStr) return [startStr];
  // Pure calendar math in UTC. Parsing as local midnight and printing with
  // toISOString() shifted every date one day earlier for admins in India.
  const list: string[] = [];
  const curr = new Date(startStr + 'T00:00:00Z');
  const end = new Date(endStr + 'T00:00:00Z');
  while (curr <= end && list.length < 62) {
    list.push(curr.toISOString().split('T')[0]);
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return list;
};

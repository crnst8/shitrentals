const relativeFormatter = new Intl.RelativeTimeFormat('en-AU', {
  numeric: 'auto'
});

export function formatDate(value) {
  const date = parseDate(value);
  if (!date) return 'Unknown date';
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

export function formatRelativeDate(value, now = new Date()) {
  const date = parseDate(value);
  const current = parseDate(now);
  if (!date || !current) return 'Unknown date';

  const days = calendarDayDifference(date, current);
  const absoluteDays = Math.abs(days);

  if (absoluteDays < 7) {
    return relativeFormatter.format(days, 'day');
  }
  if (absoluteDays < 30) {
    return relativeFormatter.format(Math.round(days / 7), 'week');
  }
  if (absoluteDays < 365) {
    return relativeFormatter.format(Math.round(days / 30), 'month');
  }
  return relativeFormatter.format(Math.round(days / 365), 'year');
}

export function dateTimeValue(value) {
  const date = parseDate(value);
  return date?.toISOString();
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function calendarDayDifference(date, current) {
  const dateDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const currentDay = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate());
  return Math.round((dateDay - currentDay) / 86_400_000);
}

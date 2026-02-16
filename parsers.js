export function fmtRow(r) {
  const when = r.date_funeral || r.date_death || r.date || "";
  const time = r.time_funeral ? ` ${r.time_funeral}` : "";
  const place = r.place ? ` • ${r.place}` : "";
  return `${when}${time}${place}`;
}

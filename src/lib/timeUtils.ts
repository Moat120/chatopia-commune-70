import { formatDistanceToNow, isToday, isYesterday, format } from "date-fns";
import { fr } from "date-fns/locale";

/** Smart relative timestamp: "à l'instant", "il y a 5 min", "Hier 14:30", "12 janv. 15:00" */
export const smartTimestamp = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;

  if (isToday(date)) return format(date, "HH:mm", { locale: fr });
  if (isYesterday(date)) return `Hier ${format(date, "HH:mm", { locale: fr })}`;

  return format(date, "d MMM HH:mm", { locale: fr });
};

/** Group separator: "Aujourd'hui", "Hier", or full date */
export const dateSeparator = (dateStr: string): string => {
  const date = new Date(dateStr);
  if (isToday(date)) return "Aujourd'hui";
  if (isYesterday(date)) return "Hier";
  return format(date, "EEEE d MMMM yyyy", { locale: fr });
};

/** Should show a date separator between two messages? */
export const shouldShowDateSeparator = (current: string, previous?: string): boolean => {
  if (!previous) return true;
  const a = new Date(current);
  const b = new Date(previous);
  return a.toDateString() !== b.toDateString();
};

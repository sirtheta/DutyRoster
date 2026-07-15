import { EntryType } from "@prisma/client";

export const TYPE_INFO: Record<EntryType, { label: string; color: string; textColor?: string }> = {
  U: { label: "Sanitätsübung", color: "#f97316" }, // orange
  S: { label: "Sanität (Dienst)", color: "#2563eb" }, // blau
  F: { label: "Ferien", color: "#eab308" }, // gelb
  G: { label: "Geschäftliche Absenz", color: "#16a34a" }, // grün
  C: { label: "Kompensieren", color: "#06b6d4" }, // cyan
  M: { label: "Militär", color: "#dc2626" }, // rot
  B: { label: "Backup", color: "#fb923c" }, // orange/gelb
  K: { label: "Kurzarbeit", color: "#a855f7" }, // lila
  TZ: { label: "Teilzeit", color: "#6b7280" }, // grau
  A: { label: "Ausbildung", color: "#4ade80" }, // hellgrün
  H: { label: "Homeoffice", color: "#111827", textColor: "#ffffff" }, // schwarz/weiss
};

// Types that the automation treats as "already occupied" and skips over.
export const AUTOMATION_BLOCKED: EntryType[] = ["F", "G", "M", "A", "K", "TZ", "H", "C", "B"];

export const ENTRY_TYPES = Object.keys(TYPE_INFO) as EntryType[];

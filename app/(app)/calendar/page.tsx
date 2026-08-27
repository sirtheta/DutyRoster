import { redirect } from "next/navigation";
import { currentYear } from "@/lib/app-time";

export default function CalendarIndexPage() {
  redirect(`/calendar/${currentYear()}`);
}

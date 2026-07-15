import { redirect } from "next/navigation";

export default function RootPage() {
  redirect(`/calendar/${new Date().getFullYear()}`);
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateCH } from "@/lib/date";
import {
  createSwapRequestAction,
  acceptSwapRequestAction,
  declineSwapRequestAction,
  cancelSwapRequestAction,
} from "@/app/(app)/swaps/actions";

export interface SwapWeekOption {
  /** Identifier (first duty date of the group). */
  key: string;
  label: string;
  dates: string[];
  /** Per day: IDs of colleagues with no entry on that day. */
  availableByDate: Record<string, number[]>;
}

export interface SwapRequestRow {
  id: number;
  otherName: string;
  datesLabel: string;
  comment: string | null;
}

export function SwapRequestsCard({
  myWeeks,
  colleagues,
  incoming,
  outgoing,
}: {
  myWeeks: SwapWeekOption[];
  colleagues: { id: number; name: string }[];
  incoming: SwapRequestRow[];
  outgoing: SwapRequestRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [weekKey, setWeekKey] = useState("");
  const [colleagueId, setColleagueId] = useState("");
  const [comment, setComment] = useState("");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  const BROADCAST = "__all__";

  const selectedWeek = myWeeks.find((w) => w.key === weekKey);
  const availableColleagues = selectedWeek
    ? colleagues.filter((c) =>
        selectedDates.every((d) => selectedWeek.availableByDate[d]?.includes(c.id))
      )
    : colleagues;
  const noneAvailable =
    !!selectedWeek && selectedDates.length > 0 && availableColleagues.length === 0;

  function handleWeekChange(key: string) {
    setWeekKey(key);
    setColleagueId("");
    setSelectedDates(myWeeks.find((w) => w.key === key)?.dates ?? []);
  }

  function toggleDate(date: string, checked: boolean) {
    setSelectedDates((prev) => (checked ? [...prev, date] : prev.filter((d) => d !== date)));
    setColleagueId("");
  }

  function run(action: () => Promise<{ error?: string }>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(successMessage);
        router.refresh();
      }
    });
  }

  function submitRequest() {
    const week = myWeeks.find((w) => w.key === weekKey);
    const dates = week?.dates.filter((d) => selectedDates.includes(d)) ?? [];
    if (!week || dates.length === 0 || !colleagueId) {
      toast.error("Bitte Woche, Tage und Person auswählen.");
      return;
    }
    run(
      () =>
        createSwapRequestAction({
          toUserId: colleagueId === BROADCAST ? null : Number(colleagueId),
          dates,
          comment: comment || undefined,
        }),
      colleagueId === BROADCAST ? "Anfrage an alle gesendet." : "Tauschanfrage gesendet."
    );
    setWeekKey("");
    setSelectedDates([]);
    setColleagueId("");
    setComment("");
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Diensttausch</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {incoming.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Eingehende Anfragen</h3>
            {incoming.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div className="text-sm">
                  <span className="font-medium">{r.otherName}</span> möchte dir Dienste übergeben:{" "}
                  {r.datesLabel}
                  {r.comment && (
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">«{r.comment}»</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(() => acceptSwapRequestAction(r.id), "Tausch angenommen — die Dienste wurden übertragen.")
                    }
                  >
                    Annehmen
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => run(() => declineSwapRequestAction(r.id), "Anfrage abgelehnt.")}
                  >
                    Ablehnen
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {outgoing.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Meine offenen Anfragen</h3>
            {outgoing.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div className="text-sm">
                  An <span className="font-medium">{r.otherName}</span>: {r.datesLabel}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => run(() => cancelSwapRequestAction(r.id), "Anfrage zurückgezogen.")}
                >
                  Zurückziehen
                </Button>
              </div>
            ))}
          </div>
        )}

        {myWeeks.length > 0 && colleagues.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Tausch anfragen</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-2">
                <Label>Dienstwoche</Label>
                <Select value={weekKey} onValueChange={handleWeekChange}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Woche wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {myWeeks.map((w) => (
                      <SelectItem key={w.key} value={w.key}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedWeek && (
                <div className="flex flex-col gap-2">
                  <Label>Tage</Label>
                  <div className="flex flex-wrap gap-3">
                    {selectedWeek.dates.map((d) => (
                      <label key={d} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedDates.includes(d)}
                          onChange={(e) => toggleDate(d, e.target.checked)}
                        />
                        {formatDateCH(d)}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {noneAvailable ? (
                <p className="text-xs text-destructive">
                  Keine Kolleg:innen für die gewählten Tage verfügbar.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <Label>Übernehmen soll</Label>
                  <Select value={colleagueId} onValueChange={setColleagueId}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Person wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={BROADCAST}>Alle (wer zuerst annimmt)</SelectItem>
                      {availableColleagues.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!noneAvailable && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="swap-comment">Kommentar (optional)</Label>
                  <Textarea
                    id="swap-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    className="w-64"
                  />
                </div>
              )}
              <Button
                size="sm"
                disabled={isPending || !weekKey || selectedDates.length === 0 || !colleagueId}
                onClick={submitRequest}
              >
                {isPending ? "Wird gesendet…" : "Anfragen"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Die angefragte(n) Person(en) erhalten eine Benachrichtigung und können den Tausch
              annehmen oder ablehnen. Bei „Alle&rdquo; gilt: wer zuerst annimmt, übernimmt die
              Dienste — die Anfrage wird bei den übrigen automatisch geschlossen.
            </p>
          </div>
        ) : (
          incoming.length === 0 &&
          outgoing.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Keine anstehenden eigenen Dienste zum Tauschen.
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function IcalSubscribeCard({ url }: { url: string }) {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Kalender-Abo (iCal)</CardTitle>
        <CardDescription>
          Diesen Link in Google/Apple/Outlook Kalender abonnieren, um deine Ferien und S-Dienste automatisch zu sehen.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            toast.success("Link kopiert.");
          }}
        >
          Kopieren
        </Button>
      </CardContent>
    </Card>
  );
}

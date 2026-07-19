/**
 * Splices PNGs captured by scripts/manual-screenshots.ts back into
 * public/benutzerhandbuch.html as inline base64 data URIs, matched by a
 * (unique) substring of each <img>'s alt text.
 *
 * Usage: npx tsx scripts/splice-manual-screenshots.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";
import path from "path";

const MANUAL_PATH = path.join(__dirname, "..", "public", "benutzerhandbuch.html");
const SHOTS_DIR = path.join(__dirname, ".manual-shots");

// shot file name (without .png) -> unique substring of the target <img alt="...">
const ALT_MATCH: Record<string, string> = {
  dashboard: "Dashboard mit Dienstübersicht, Jahresstatistik, Diensttausch und Kalender-Abo",
  "notification-dialog": "Dialog Benachrichtigungen mit Kanal, Wochentag und Uhrzeit",
  diensttausch: "Diensttausch-Karte mit eingehender Anfrage",
  "users-new-dialog": "Dialog zum Anlegen eines neuen Benutzers",
  "users-edit-dialog": "Dialog zum Bearbeiten eines bestehenden Benutzers",
  settings: "Einstellungsseite mit SMTP- und Telegram-Konfiguration",
};

function main() {
  let html = readFileSync(MANUAL_PATH, "utf-8");
  const files = readdirSync(SHOTS_DIR).filter((f) => f.endsWith(".png"));

  for (const file of files) {
    const name = file.replace(/\.png$/, "");
    const altSubstr = ALT_MATCH[name];
    if (!altSubstr) {
      console.warn("skip (no alt mapping):", file);
      continue;
    }
    const buf = readFileSync(path.join(SHOTS_DIR, file));
    const dataUri = `data:image/png;base64,${buf.toString("base64")}`;

    // Find the <img ... alt="...altSubstr...".../> tag and swap its src.
    let matched = false;
    html = html.replace(new RegExp(`<img src="data:image/[a-z]+;base64,[^"]*"([^>]*alt="[^"]*${escapeRegExp(altSubstr)}[^"]*")`), (full, tail) => {
      matched = true;
      return `<img src="${dataUri}"${tail}`;
    });
    if (!matched) {
      console.warn("no matching <img> found for:", name, "(alt contains:", altSubstr + ")");
    } else {
      console.log("spliced:", name, `(${Math.round(buf.length / 1024)} KB)`);
    }
  }

  writeFileSync(MANUAL_PATH, html);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main();

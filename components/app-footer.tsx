import packageJson from "@/package.json";

const REPO_URL = "https://github.com/sirtheta/DutyRoster";

export function AppFooter() {
  return (
    <footer className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">
        Sanitätsplaner v{packageJson.version}
      </a>
      {" · © "}
      {new Date().getFullYear()}
    </footer>
  );
}

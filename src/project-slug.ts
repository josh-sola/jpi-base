// Matches Claude Code's ~/.claude/projects/-Users-... naming so a leading "/"
// becomes a leading "-" rather than being dropped.
export function projectSlug(cwd: string): string {
  return cwd.replace(/\//g, "-");
}

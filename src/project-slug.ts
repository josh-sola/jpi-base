// Matches Claude Code's ~/.claude/projects/-Users-... naming so a leading "/"
// becomes a leading "-" rather than being dropped. Every other character
// outside Store's allowed name set is also dashed, so the slug is always a
// valid Store path segment.
export function projectSlug(cwd: string): string {
  return cwd.replace(/\//g, "-").replace(/[^A-Za-z0-9._-]/g, "-");
}

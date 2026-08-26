# Notes

## Code Snippet

### `flowsheet:idaes` snippet does not show up in IntelliSense

**Symptom:** The extension is installed and enabled, but typing `flowsheet` or `flowsheet:idaes` in a Python file does not show the "flowsheet:idaes" entry in the suggestion list, so Tab never inserts the template.

**Cause:** The user has disabled snippet suggestions in their VS Code settings. Two settings can cause this:

- `"editor.snippetSuggestions": "none"` — snippets are excluded from the suggestion list entirely.
- `"editor.suggest.showSnippets": false` — the suggest widget hides all snippet items.

Both are user-modified settings; the default VS Code configuration shows snippets out of the box, so a fresh install is not affected.

**Fix:** Restore the defaults in settings (Settings UI or `settings.json`):

```json
{
  "editor.snippetSuggestions": "inline",
  "editor.suggest.showSnippets": true
}
```

Also check workspace-level `.vscode/settings.json`, which overrides user settings and can disable snippets for just one project.

**Other things to rule out first:**

- The file's language mode must be Python (bottom-right of the status bar). Untitled files default to plaintext, where the snippet is not registered.
- The extension must be enabled, not just installed — disabling an extension removes all of its declarative contributions, including snippets.

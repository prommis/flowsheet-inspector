import * as vscode from 'vscode';

// VS Code's built-in GitHub authentication provider id.
const GITHUB_AUTH_PROVIDER_ID = 'github';
// 'public_repo' is the minimum scope that allows creating issues on a
// public repository via the REST API.
const GITHUB_SCOPES = ['public_repo'];

// Repository the feedback issues are filed against.
const ISSUE_REPO_OWNER = 'prommis';
const ISSUE_REPO_NAME = 'flowsheet-inspector';

// Server-side whitelist for the category field. The webview sends a value
// from its own dropdown, but a webview message can carry anything, so the
// value is re-validated here before it lands in the issue title.
const ALLOWED_CATEGORIES = ['Bug', 'Feature request', 'Question', 'Other'];

// Maps a form category to the GitHub label applied to the issue. Only
// GitHub's default labels (present on every repo) are used here, so the
// create call can never 422 on a missing label. 'Other' intentionally has
// no direct label — the label-feedback workflow applies `feedback` for it.
//
// Note: the API only honors `labels` when the submitter has push access to
// the repo; for everyone else GitHub silently drops the field. External
// users are covered by .github/workflows/label-feedback.yml, which labels
// the issue from the "**Category:**" line using the repo's own token.
const CATEGORY_LABELS: Record<string, string> = {
    'Bug': 'bug',
    'Feature request': 'enhancement',
    'Question': 'question',
};

// Length caps keep the payload well under GitHub's limits (title ~256,
// body 65536 chars) so the API never rejects with a 422.
const MAX_SUBJECT_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 60000;
const MAX_EMAIL_LENGTH = 200;

/**
 * Collapses all whitespace runs (including newlines) into single spaces and
 * trims. Used for single-line fields (subject, email) so a crafted value
 * cannot inject line breaks into the issue title or the metadata lines at
 * the top of the issue body.
 *
 * @param value - Raw field value from the webview message.
 * @param maxLength - Hard cap applied after normalization.
 * @returns Normalized single-line string.
 */
function sanitizeSingleLine(value: string, maxLength: number): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * Fields collected by the webview feedback form.
 */
export interface IGithubIssueRequest {
    /** Short issue title typed by the user. */
    subject: string;
    /** Feedback category picked from the form dropdown (e.g. "Bug"). */
    category: string;
    /** Free-form description of the problem / feedback. */
    description: string;
    /** Optional contact email the user chose to share. */
    email?: string;
}

/**
 * Outcome of a feedback submission, posted back to the webview so it can
 * render the green/red notice.
 */
export interface IGithubIssueResult {
    /** True when the issue was created on GitHub. */
    ok: boolean;
    /** html_url of the created issue, present only on success. */
    issueUrl?: string;
    /** Human-readable failure reason, present only on failure. */
    error?: string;
}

/**
 * Creates a GitHub issue on the extension's repository using the user's own
 * GitHub identity.
 *
 * Authentication goes through VS Code's built-in GitHub auth provider
 * (`vscode.authentication.getSession`), so on first use VS Code pops its
 * standard GitHub sign-in flow; afterwards the cached session is reused
 * silently. The issue is therefore authored by the user's GitHub account,
 * not by any bot token bundled with the extension.
 *
 * The function never throws — every failure path (sign-in cancelled, network
 * error, non-2xx API response, missing required fields) is folded into the
 * returned {@link IGithubIssueResult} so the caller can simply forward it to
 * the webview.
 *
 * @param request - Form fields collected by the webview feedback panel.
 * @returns Result object with `ok` plus either `issueUrl` or `error`.
 */
export default async function postGithubIssue(request: IGithubIssueRequest): Promise<IGithubIssueResult> {
    const subject = sanitizeSingleLine(String(request.subject ?? ''), MAX_SUBJECT_LENGTH);
    const description = String(request.description ?? '').trim().slice(0, MAX_DESCRIPTION_LENGTH);
    const email = sanitizeSingleLine(String(request.email ?? ''), MAX_EMAIL_LENGTH);
    // Never trust the category coming over the message channel — fall back
    // to 'Other' for anything outside the known dropdown values.
    const rawCategory = String(request.category ?? '').trim();
    const category = ALLOWED_CATEGORIES.includes(rawCategory) ? rawCategory : 'Other';

    if (!subject || !description) {
        return { ok: false, error: 'Subject and description are required.' };
    }

    // Ask VS Code for a GitHub session. createIfNone triggers the sign-in UI
    // when the user has not authorized GitHub for this extension yet.
    let session: vscode.AuthenticationSession | undefined;
    try {
        session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, GITHUB_SCOPES, { createIfNone: true });
    } catch (e: any) {
        return { ok: false, error: `GitHub sign-in was cancelled or failed: ${e?.message ?? e}` };
    }
    if (!session) {
        return { ok: false, error: 'GitHub sign-in is required to submit feedback.' };
    }

    // Issue body: category / contact metadata up top, free-form description
    // below. Labels are not used because the API silently requires push
    // access to set them.
    const bodyLines = [
        `**Category:** ${category}`,
    ];
    if (email) {
        bodyLines.push(`**Contact email:** ${email}`);
    }
    bodyLines.push('', description);

    const issuePayload: { title: string; body: string; labels?: string[] } = {
        title: `[${category}] ${subject}`,
        body: bodyLines.join('\n'),
    };
    const label = CATEGORY_LABELS[category];
    if (label) {
        issuePayload.labels = [label];
    }

    try {
        const response = await fetch(`https://api.github.com/repos/${ISSUE_REPO_OWNER}/${ISSUE_REPO_NAME}/issues`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.accessToken}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            body: JSON.stringify(issuePayload),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { ok: false, error: `GitHub API responded with ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}` };
        }

        const created: any = await response.json();
        return { ok: true, issueUrl: created?.html_url };
    } catch (e: any) {
        return { ok: false, error: `Network error while posting the issue: ${e?.message ?? e}` };
    }
}

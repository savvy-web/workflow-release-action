import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";
import Anthropic from "@anthropic-ai/sdk";
import { summaryWriter } from "./summary-writer.js";

/**
 * Linked issue information
 */
interface LinkedIssue {
	/** Issue number */
	number: number;
	/** Issue title */
	title: string;
	/** Issue state */
	state: string;
	/** Issue URL */
	url: string;
	/** Commits that reference this issue */
	commits: string[];
}

/**
 * Commit information
 */
interface CommitInfo {
	/** Commit SHA */
	sha: string;
	/** Commit message */
	message: string;
	/** Commit author */
	author: string;
}

/**
 * PR description generation result
 */
interface PRDescriptionResult {
	/** Generated description */
	description: string;
	/** GitHub check run ID */
	checkId: number;
}

/**
 * Retry wrapper with exponential backoff
 *
 * @param operation - Async operation to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelay - Base delay in ms (default: 1000)
 * @param retryableErrors - Error messages to retry on
 * @returns Promise resolving to operation result
 */
async function withRetry<T>(
	operation: () => Promise<T>,
	maxRetries: number = 3,
	baseDelay: number = 1000,
	retryableErrors: string[] = ["rate_limit", "overloaded", "timeout", "ECONNRESET", "ETIMEDOUT"],
): Promise<T> {
	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			/* v8 ignore next -- @preserve - Defensive: handles non-Error throws (extremely rare) */
			lastError = error instanceof Error ? error : new Error(String(error));

			if (attempt === maxRetries) {
				break;
			}

			// Check if error is retryable
			const isRetryable = retryableErrors.some((errMsg) =>
				lastError?.message.toLowerCase().includes(errMsg.toLowerCase()),
			);

			if (!isRetryable) {
				throw lastError;
			}

			// Exponential backoff with jitter
			const delay = Math.min(
				baseDelay * 2 ** attempt + Math.random() * 1000,
				30000, // Max 30s for API calls
			);

			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw lastError;
}

/**
 * Generates PR description using Claude API
 *
 * @param coreModule - GitHub Actions core module
 * @param AnthropicClass - Anthropic SDK class
 * @param linkedIssues - Linked issues from commits
 * @param commits - Commit information
 * @param apiKey - Anthropic API key
 * @returns Generated description
 */
async function generateDescriptionWithClaude(
	coreModule: typeof core,
	AnthropicClass: typeof Anthropic,
	linkedIssues: LinkedIssue[],
	commits: CommitInfo[],
	apiKey: string,
): Promise<string> {
	const core = coreModule;

	core.info("Calling Claude API to generate PR description");

	// Build prompt
	const issuesContext =
		linkedIssues.length > 0
			? `
## Linked Issues

${linkedIssues.map((issue) => `- #${issue.number}: ${issue.title} (${issue.state})`).join("\n")}
`
			: "";

	const commitsContext = `
## Commits

${commits.map((c) => `- ${c.sha.slice(0, 7)}: ${c.message.split("\n")[0]} (by ${c.author})`).join("\n")}
`;

	const prompt = `You are helping to generate a pull request description for a release. Based on the linked issues and commits below, create a concise bulleted list of changes.

${issuesContext}
${commitsContext}

Please generate a bulleted markdown list (using "-" not "*") that summarizes the key changes. Focus on user-facing changes and improvements. Group related changes together. Be concise but informative.

Do not include any preamble or explanation - just output the bulleted list.`;

	core.debug(`Prompt sent to Claude:\n${prompt}`);

	// Call Claude API with retry
	const anthropic = new AnthropicClass({ apiKey });

	const response = await withRetry(async () => {
		return await anthropic.messages.create({
			model: "claude-sonnet-4-20250514",
			max_tokens: 1024,
			messages: [
				{
					role: "user",
					content: prompt,
				},
			],
		});
	});

	// Extract text from response
	const textContent = response.content.find((block) => block.type === "text");
	if (!textContent || textContent.type !== "text") {
		throw new Error("No text content in Claude response");
	}

	const description = textContent.text.trim();

	core.info(`Generated description (${description.length} characters)`);
	core.debug(`Generated description:\n${description}`);

	return description;
}

/**
 * Generates PR description and updates the pull request
 *
 * @param coreModule - GitHub Actions core module
 * @param AnthropicClass - Anthropic SDK class
 * @param github - GitHub API client
 * @param context - GitHub Actions context
 * @param linkedIssues - Linked issues from commits
 * @param commits - Commits in the release
 * @param prNumber - Pull request number
 * @param apiKey - Anthropic API key
 * @param dryRun - Whether this is a dry-run
 * @returns PR description result
 */
async function generatePRDescription(
	coreModule: typeof core,
	AnthropicClass: typeof Anthropic,
	github: InstanceType<typeof GitHub>,
	context: Context,
	linkedIssues: LinkedIssue[],
	commits: CommitInfo[],
	prNumber: number,
	apiKey: string,
	dryRun: boolean,
): Promise<PRDescriptionResult> {
	const core = coreModule;

	core.startGroup("Generating PR description");

	let description = "";

	// Handle empty inputs
	if (linkedIssues.length === 0 && commits.length === 0) {
		core.warning("No linked issues or commits provided");
		description = "## Changes\n\n_No changes detected_";
	} else {
		// Generate description with Claude
		try {
			description = await generateDescriptionWithClaude(core, AnthropicClass, linkedIssues, commits, apiKey);
		} catch (error) {
			core.warning(
				`Failed to generate description with Claude: ${error instanceof Error ? error.message : String(error)}`,
			);

			// Fallback to basic description
			description = "## Changes\n\n";
			if (linkedIssues.length > 0) {
				description += "### Linked Issues\n\n";
				description += linkedIssues.map((issue) => `- Fixes #${issue.number}: ${issue.title}`).join("\n");
				description += "\n\n";
			}
			if (commits.length > 0) {
				description += "### Commits\n\n";
				description += commits.map((c) => `- ${c.message.split("\n")[0]} (${c.sha.slice(0, 7)})`).join("\n");
			}
		}
	}

	core.endGroup();

	// Update PR description
	if (!dryRun) {
		core.info(`Updating PR #${prNumber} description`);

		await withRetry(async () => {
			await github.rest.pulls.update({
				owner: context.repo.owner,
				repo: context.repo.repo,
				pull_number: prNumber,
				body: description,
			});
		});

		core.info(`✓ Updated PR #${prNumber} description`);
	} else {
		core.info(`🧪 [Dry Run] Would update PR #${prNumber} description`);
	}

	// Create GitHub check run
	const checkTitle = dryRun ? "🧪 Generate PR Description (Dry Run)" : "Generate PR Description";
	const checkSummary = "Generated PR description with AI assistance";

	// Build check details using summaryWriter (markdown, not HTML)
	const checkSections: Array<{ heading?: string; level?: 2 | 3; content: string }> = [
		{ heading: "PR Description Generated", content: "" },
		{ heading: "Generated Description", level: 3, content: description },
	];

	if (linkedIssues.length > 0) {
		const issuesTable = summaryWriter.table(
			["Issue", "Title", "State"],
			linkedIssues.map((issue) => [`[#${issue.number}](${issue.url})`, issue.title, issue.state]),
		);
		checkSections.push({ heading: "Linked Issues", level: 3, content: issuesTable });
	}

	if (commits.length > 0) {
		checkSections.push({ heading: "Commits Analyzed", level: 3, content: `${commits.length} commit(s)` });
	}

	const checkDetails = summaryWriter.build(checkSections);

	const { data: checkRun } = await withRetry(async () => {
		return await github.rest.checks.create({
			owner: context.repo.owner,
			repo: context.repo.repo,
			name: checkTitle,
			head_sha: context.sha,
			status: "completed",
			conclusion: "success",
			output: {
				title: checkSummary,
				summary: checkDetails,
			},
		});
	});

	core.info(`Created check run: ${checkRun.html_url}`);

	// Write job summary using summaryWriter (markdown, not HTML)
	const jobSummary = summaryWriter.build([
		{ heading: checkTitle, content: checkSummary },
		{ heading: "Generated Description", level: 3, content: description },
	]);

	await summaryWriter.write(jobSummary);

	return {
		description,
		checkId: checkRun.id,
	};
}

/**
 * Direct function export for calling from main.ts
 *
 * @param token - GitHub token
 * @param linkedIssues - Linked issues from commits
 * @param commits - Commits in the release
 * @param prNumber - Pull request number to update
 * @param apiKey - Anthropic API key (optional)
 * @param dryRun - Whether this is a dry-run
 * @returns PR description result
 */
export async function generatePRDescriptionDirect(
	token: string,
	linkedIssues: LinkedIssue[],
	commits: CommitInfo[],
	prNumber: number,
	apiKey: string,
	dryRun: boolean,
): Promise<PRDescriptionResult> {
	const github = getOctokit(token);

	return generatePRDescription(core, Anthropic, github, context, linkedIssues, commits, prNumber, apiKey, dryRun);
}

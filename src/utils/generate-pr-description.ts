import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
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
 * @param linkedIssues - Linked issues from commits
 * @param commits - Commit information
 * @param apiKey - Anthropic API key
 * @returns Generated description
 */
async function generateDescriptionWithClaude(
	linkedIssues: LinkedIssue[],
	commits: CommitInfo[],
	apiKey: string,
): Promise<string> {
	core.info("Calling Claude API to generate PR description");

	// Build prompt using summaryWriter
	const promptSections: Array<{ heading?: string; level?: 2 | 3 | 4; content: string }> = [
		{
			content:
				"You are helping to generate a pull request description for a release. Based on the linked issues and commits below, create a concise bulleted list of changes.",
		},
	];

	if (linkedIssues.length > 0) {
		promptSections.push({
			heading: "Linked Issues",
			content: summaryWriter.list(linkedIssues.map((issue) => `#${issue.number}: ${issue.title} (${issue.state})`)),
		});
	}

	promptSections.push({
		heading: "Commits",
		content: summaryWriter.list(
			commits.map((c) => `${c.sha.slice(0, 7)}: ${c.message.split("\n")[0]} (by ${c.author})`),
		),
	});

	promptSections.push({
		content:
			'Please generate a bulleted markdown list (using "-" not "*") that summarizes the key changes. Focus on user-facing changes and improvements. Group related changes together. Be concise but informative.\n\nDo not include any preamble or explanation - just output the bulleted list.',
	});

	const prompt = summaryWriter.build(promptSections);

	core.debug(`Prompt sent to Claude:\n${prompt}`);

	// Call Claude API with retry
	const anthropic = new Anthropic({ apiKey });

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
 * @param token - GitHub token
 * @param linkedIssues - Linked issues from commits
 * @param commits - Commits in the release
 * @param prNumber - Pull request number to update
 * @param apiKey - Anthropic API key
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

	core.startGroup("Generating PR description");

	let description = "";

	// Handle empty inputs
	if (linkedIssues.length === 0 && commits.length === 0) {
		core.warning("No linked issues or commits provided");
		description = summaryWriter.build([{ heading: "Changes", content: "_No changes detected_" }]);
	} else {
		// Generate description with Claude
		try {
			description = await generateDescriptionWithClaude(linkedIssues, commits, apiKey);
		} catch (error) {
			core.warning(
				`Failed to generate description with Claude: ${error instanceof Error ? error.message : String(error)}`,
			);

			// Fallback to basic description
			const fallbackSections: Array<{ heading?: string; level?: 2 | 3 | 4; content: string }> = [
				{ heading: "Changes", content: "" },
			];

			if (linkedIssues.length > 0) {
				const issuesList = summaryWriter.list(linkedIssues.map((issue) => `Fixes #${issue.number}: ${issue.title}`));
				fallbackSections.push({ heading: "Linked Issues", level: 3, content: issuesList });
			}

			if (commits.length > 0) {
				const commitsList = summaryWriter.list(
					commits.map((c) => `${c.message.split("\n")[0]} (${c.sha.slice(0, 7)})`),
				);
				fallbackSections.push({ heading: "Commits", level: 3, content: commitsList });
			}

			description = summaryWriter.build(fallbackSections);
		}
	}

	core.endGroup();

	// Update PR description (preserving any existing linked issues section)
	if (!dryRun) {
		core.info(`Updating PR #${prNumber} description`);

		// Get current PR body to preserve linked issues section
		const { data: currentPR } = await github.rest.pulls.get({
			owner: context.repo.owner,
			repo: context.repo.repo,
			pull_number: prNumber,
		});

		let finalBody = description;
		const currentBody = currentPR.body || "";

		// Extract and preserve the linked issues section if it exists
		const linkedIssuesMatch = currentBody.match(/## Linked Issues\n\n[\s\S]*?(?=\n## |$)/);
		if (linkedIssuesMatch) {
			// Prepend the linked issues section to the new description
			finalBody = `${linkedIssuesMatch[0].trim()}\n\n${description}`;
			core.info("Preserved existing linked issues section");
		}

		await withRetry(async () => {
			await github.rest.pulls.update({
				owner: context.repo.owner,
				repo: context.repo.repo,
				pull_number: prNumber,
				body: finalBody,
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

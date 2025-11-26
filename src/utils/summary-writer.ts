import * as core from "@actions/core";

/**
 * Utility for writing job summaries using markdown instead of HTML.
 * The core.summary HTML methods don't render well in GitHub's job summary UI.
 */
export const summaryWriter = {
	/**
	 * Write a markdown summary to the job summary file.
	 * Uses addRaw() to avoid HTML generation from core.summary methods.
	 */
	async write(markdown: string): Promise<void> {
		await core.summary.addRaw(markdown).write();
	},

	/**
	 * Build a markdown table from rows.
	 * First row is treated as headers.
	 */
	table(headers: string[], rows: string[][]): string {
		const lines: string[] = [];
		lines.push(`| ${headers.join(" | ")} |`);
		lines.push(`|${headers.map(() => "---").join("|")}|`);
		for (const row of rows) {
			lines.push(`| ${row.join(" | ")} |`);
		}
		return lines.join("\n");
	},

	/**
	 * Build a key-value table (Property | Value format)
	 */
	keyValueTable(entries: Array<{ key: string; value: string }>): string {
		const lines: string[] = [];
		lines.push("| Property | Value |");
		lines.push("|----------|-------|");
		for (const { key, value } of entries) {
			lines.push(`| ${key} | ${value} |`);
		}
		return lines.join("\n");
	},

	/**
	 * Build a markdown bulleted list
	 */
	list(items: string[]): string {
		return items.map((item) => `- ${item}`).join("\n");
	},

	/**
	 * Build a markdown heading
	 */
	heading(text: string, level: 2 | 3 | 4 = 2): string {
		const prefix = "#".repeat(level);
		return `${prefix} ${text}`;
	},

	/**
	 * Build a complete summary section with heading and content.
	 */
	section(heading: string, level: 2 | 3, content: string): string {
		const prefix = level === 2 ? "##" : "###";
		return `${prefix} ${heading}\n\n${content}`;
	},

	/**
	 * Build a summary with multiple sections.
	 */
	build(sections: Array<{ heading?: string; level?: 2 | 3 | 4; content: string }>): string {
		const parts: string[] = [];
		for (const section of sections) {
			if (section.heading) {
				const prefix = "#".repeat(section.level ?? 2);
				parts.push(`${prefix} ${section.heading}`);
				parts.push("");
			}
			parts.push(section.content);
			parts.push("");
		}
		return parts.join("\n");
	},
};

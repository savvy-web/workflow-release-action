import * as core from "@actions/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summaryWriter } from "../src/utils/summary-writer.js";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";

vi.mock("@actions/core");

describe("summary-writer", () => {
	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		// Mock core.summary
		const mockSummary = {
			addRaw: vi.fn().mockReturnThis(),
			write: vi.fn().mockResolvedValue(undefined),
		};
		Object.defineProperty(core, "summary", { value: mockSummary, writable: true });
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	describe("write", () => {
		it("should write markdown to job summary with trailing newlines", async () => {
			await summaryWriter.write("# Test");

			// Appends trailing newlines to separate from subsequent summaries
			expect(core.summary.addRaw).toHaveBeenCalledWith("# Test\n\n");
			expect(core.summary.write).toHaveBeenCalled();
		});
	});

	describe("table", () => {
		it("should build a markdown table with headers and rows", () => {
			const result = summaryWriter.table(
				["Name", "Value"],
				[
					["foo", "bar"],
					["baz", "qux"],
				],
			);

			// ts-markdown pads columns for alignment
			expect(result).toBe("| Name | Value |\n" + "| ---- | ----- |\n" + "| foo  | bar   |\n" + "| baz  | qux   |");
		});

		it("should handle empty rows", () => {
			const result = summaryWriter.table(["A", "B"], []);

			expect(result).toBe("| A   | B   |\n" + "| --- | --- |");
		});
	});

	describe("keyValueTable", () => {
		it("should build a Property | Value table", () => {
			const result = summaryWriter.keyValueTable([
				{ key: "Status", value: "Success" },
				{ key: "Count", value: "5" },
			]);

			// ts-markdown pads columns for alignment
			expect(result).toBe(
				"| Property | Value   |\n" + "| -------- | ------- |\n" + "| Status   | Success |\n" + "| Count    | 5       |",
			);
		});

		it("should handle empty entries", () => {
			const result = summaryWriter.keyValueTable([]);

			expect(result).toBe("| Property | Value |\n" + "| -------- | ----- |");
		});
	});

	describe("list", () => {
		it("should build a bulleted list", () => {
			const result = summaryWriter.list(["Item 1", "Item 2", "Item 3"]);

			expect(result).toBe("- Item 1\n- Item 2\n- Item 3");
		});

		it("should handle empty list", () => {
			const result = summaryWriter.list([]);

			expect(result).toBe("");
		});
	});

	describe("heading", () => {
		it("should build level 2 heading by default", () => {
			const result = summaryWriter.heading("Title");

			expect(result).toBe("## Title");
		});

		it("should build level 3 heading", () => {
			const result = summaryWriter.heading("Subtitle", 3);

			expect(result).toBe("### Subtitle");
		});

		it("should build level 4 heading", () => {
			const result = summaryWriter.heading("Sub-subtitle", 4);

			expect(result).toBe("#### Sub-subtitle");
		});
	});

	describe("codeBlock", () => {
		it("should build a code block with language", () => {
			const result = summaryWriter.codeBlock("const x = 1;", "typescript");

			expect(result).toBe("```typescript\nconst x = 1;\n```");
		});

		it("should build a code block without language", () => {
			const result = summaryWriter.codeBlock("plain text");

			expect(result).toBe("```\nplain text\n```");
		});
	});

	describe("section", () => {
		it("should build a section with level 2 heading", () => {
			const result = summaryWriter.section("Title", 2, "Content here");

			expect(result).toBe("## Title\n\nContent here");
		});

		it("should build a section with level 3 heading", () => {
			const result = summaryWriter.section("Subtitle", 3, "More content");

			expect(result).toBe("### Subtitle\n\nMore content");
		});
	});

	describe("build", () => {
		it("should build multiple sections", () => {
			const result = summaryWriter.build([
				{ heading: "Main", content: "Main content" },
				{ heading: "Sub", level: 3, content: "Sub content" },
			]);

			expect(result).toBe("## Main\n\nMain content\n\n### Sub\n\nSub content\n");
		});

		it("should build sections without headings", () => {
			const result = summaryWriter.build([{ content: "Just text" }, { content: "More text" }]);

			expect(result).toBe("Just text\n\nMore text\n");
		});

		it("should build sections with level 4 headings", () => {
			const result = summaryWriter.build([{ heading: "Deep", level: 4, content: "Deep content" }]);

			expect(result).toBe("#### Deep\n\nDeep content\n");
		});

		it("should handle empty sections array", () => {
			const result = summaryWriter.build([]);

			expect(result).toBe("");
		});
	});
});

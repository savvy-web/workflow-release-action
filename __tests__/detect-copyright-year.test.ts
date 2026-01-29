import * as exec from "@actions/exec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	detectCopyrightYear,
	extractYearFromDate,
	fetchNpmPackageCreationDate,
} from "../src/utils/detect-copyright-year.js";

// Type for exec options with listeners
interface ExecOptionsWithListeners {
	silent?: boolean;
	ignoreReturnCode?: boolean;
	listeners?: {
		stdout?: (data: Buffer) => void;
		stderr?: (data: Buffer) => void;
	};
}

// Mock modules
vi.mock("@actions/exec");
vi.mock("@actions/core", () => ({
	debug: vi.fn(),
	warning: vi.fn(),
}));

describe("detect-copyright-year", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("fetchNpmPackageCreationDate", () => {
		it("should return creation date from npm registry", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				const timeData = {
					created: "2024-01-15T10:30:00.000Z",
					modified: "2024-06-01T15:00:00.000Z",
					"1.0.0": "2024-01-15T10:30:00.000Z",
				};
				options?.listeners?.stdout?.(Buffer.from(JSON.stringify(timeData)));
				return 0;
			});

			const result = await fetchNpmPackageCreationDate("my-package");

			expect(result).toBe("2024-01-15T10:30:00.000Z");
			expect(exec.exec).toHaveBeenCalledWith(
				"npm",
				["view", "my-package", "time", "--json", "--registry", "https://registry.npmjs.org"],
				expect.any(Object),
			);
		});

		it("should use custom registry when provided", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stdout?.(Buffer.from(JSON.stringify({ created: "2024-01-15T10:30:00.000Z" })));
				return 0;
			});

			await fetchNpmPackageCreationDate("my-package", "https://custom-registry.com");

			expect(exec.exec).toHaveBeenCalledWith(
				"npm",
				["view", "my-package", "time", "--json", "--registry", "https://custom-registry.com"],
				expect.any(Object),
			);
		});

		it("should return undefined for new package (E404)", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stderr?.(Buffer.from("npm ERR! code E404\nnpm ERR! 404 Not Found"));
				return 1;
			});

			const result = await fetchNpmPackageCreationDate("new-package");

			expect(result).toBeUndefined();
		});

		it("should return undefined when package not found", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stderr?.(Buffer.from("package not found"));
				return 1;
			});

			const result = await fetchNpmPackageCreationDate("unknown-package");

			expect(result).toBeUndefined();
		});

		it("should return undefined when npm view fails", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stderr?.(Buffer.from("Some other error"));
				return 1;
			});

			const result = await fetchNpmPackageCreationDate("my-package");

			expect(result).toBeUndefined();
		});

		it("should return undefined when time data has no created field", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stdout?.(Buffer.from(JSON.stringify({ modified: "2024-01-15T10:30:00.000Z" })));
				return 0;
			});

			const result = await fetchNpmPackageCreationDate("my-package");

			expect(result).toBeUndefined();
		});

		it("should return undefined when exec throws", async () => {
			vi.mocked(exec.exec).mockRejectedValue(new Error("Network error"));

			const result = await fetchNpmPackageCreationDate("my-package");

			expect(result).toBeUndefined();
		});

		it("should handle E404 in stdout", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stdout?.(Buffer.from("E404 - package not found"));
				return 1;
			});

			const result = await fetchNpmPackageCreationDate("new-package");

			expect(result).toBeUndefined();
		});
	});

	describe("extractYearFromDate", () => {
		it("should extract year from ISO date string", () => {
			const result = extractYearFromDate("2024-01-15T10:30:00.000Z");
			expect(result).toBe(2024);
		});

		it("should extract year from date-only string", () => {
			const result = extractYearFromDate("2023-06-01");
			expect(result).toBe(2023);
		});

		it("should return current year for invalid date", () => {
			const currentYear = new Date().getFullYear();
			const result = extractYearFromDate("invalid-date");
			expect(result).toBe(currentYear);
		});
	});

	describe("detectCopyrightYear", () => {
		it("should use config start year when provided", async () => {
			const result = await detectCopyrightYear("my-package", 2020);

			expect(result).toEqual({
				startYear: 2020,
				source: "config",
			});
			// Should not call npm
			expect(exec.exec).not.toHaveBeenCalled();
		});

		it("should detect year from npm registry", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stdout?.(Buffer.from(JSON.stringify({ created: "2022-03-15T10:30:00.000Z" })));
				return 0;
			});

			const result = await detectCopyrightYear("my-package");

			expect(result).toEqual({
				startYear: 2022,
				source: "npm-registry",
				firstPublished: "2022-03-15T10:30:00.000Z",
			});
		});

		it("should use custom registry when provided", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stdout?.(Buffer.from(JSON.stringify({ created: "2023-01-01T00:00:00.000Z" })));
				return 0;
			});

			const result = await detectCopyrightYear("my-package", undefined, "https://custom-registry.com");

			expect(result.source).toBe("npm-registry");
			expect(exec.exec).toHaveBeenCalledWith(
				"npm",
				expect.arrayContaining(["--registry", "https://custom-registry.com"]),
				expect.any(Object),
			);
		});

		it("should fall back to current year for new packages", async () => {
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stderr?.(Buffer.from("E404"));
				return 1;
			});

			const currentYear = new Date().getFullYear();
			const result = await detectCopyrightYear("new-package");

			expect(result).toEqual({
				startYear: currentYear,
				source: "default",
			});
		});
	});
});

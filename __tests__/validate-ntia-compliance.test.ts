import { describe, expect, it } from "vitest";
import type { EnhancedCycloneDXDocument } from "../src/types/sbom-config.js";
import { formatNTIAComplianceMarkdown, validateNTIACompliance } from "../src/utils/validate-ntia-compliance.js";

describe("validate-ntia-compliance", () => {
	describe("validateNTIACompliance", () => {
		it("should return compliant for SBOM with all required fields", () => {
			const sbom: EnhancedCycloneDXDocument = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-15T10:00:00.000Z",
					supplier: {
						name: "Test Company",
					},
					component: {
						name: "test-package",
						version: "1.0.0",
						purl: "pkg:npm/test-package@1.0.0",
						publisher: "Test Publisher",
					},
					tools: {
						components: [{ type: "application", name: "cdxgen", version: "10.0.0" }],
					},
				},
				components: [{ type: "library", name: "lodash", version: "4.17.21" }],
			};

			const result = validateNTIACompliance(sbom);

			expect(result.compliant).toBe(true);
			expect(result.passedCount).toBe(7);
			expect(result.totalCount).toBe(7);
			expect(result.percentage).toBe(100);
			expect(result.fields.every((f) => f.passed)).toBe(true);
		});

		it("should return non-compliant when missing supplier name", () => {
			const sbom: EnhancedCycloneDXDocument = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-15T10:00:00.000Z",
					component: {
						name: "test-package",
						version: "1.0.0",
						purl: "pkg:npm/test-package@1.0.0",
						publisher: "Test Publisher",
					},
				},
				components: [],
			};

			const result = validateNTIACompliance(sbom);

			expect(result.compliant).toBe(false);
			const supplierField = result.fields.find((f) => f.name === "Supplier Name");
			expect(supplierField?.passed).toBe(false);
			expect(supplierField?.suggestion).toContain("silk-release.json");
		});

		it("should return non-compliant when missing component name", () => {
			// Intentionally omit name to test validation
			const sbom = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-15T10:00:00.000Z",
					supplier: { name: "Test Company" },
					component: {
						version: "1.0.0",
					},
				},
				components: [],
			} as unknown as EnhancedCycloneDXDocument;

			const result = validateNTIACompliance(sbom);

			expect(result.compliant).toBe(false);
			const componentField = result.fields.find((f) => f.name === "Component Name");
			expect(componentField?.passed).toBe(false);
		});

		it("should return non-compliant when missing component version", () => {
			const sbom: EnhancedCycloneDXDocument = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-15T10:00:00.000Z",
					supplier: { name: "Test Company" },
					component: {
						name: "test-package",
					},
				},
				components: [],
			};

			const result = validateNTIACompliance(sbom);

			expect(result.compliant).toBe(false);
			const versionField = result.fields.find((f) => f.name === "Component Version");
			expect(versionField?.passed).toBe(false);
		});

		it("should return non-compliant when missing PURL", () => {
			const sbom: EnhancedCycloneDXDocument = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-15T10:00:00.000Z",
					supplier: { name: "Test Company" },
					component: {
						name: "test-package",
						version: "1.0.0",
					},
				},
				components: [],
			};

			const result = validateNTIACompliance(sbom);

			expect(result.compliant).toBe(false);
			const purlField = result.fields.find((f) => f.name === "Unique Identifier");
			expect(purlField?.passed).toBe(false);
		});

		it("should pass PURL check only for valid pkg: URLs", () => {
			const sbom: EnhancedCycloneDXDocument = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					component: {
						name: "test",
						purl: "invalid-purl",
					},
				},
			};

			const result = validateNTIACompliance(sbom);
			const purlField = result.fields.find((f) => f.name === "Unique Identifier");
			expect(purlField?.passed).toBe(false);
		});

		it("should pass dependency relationship check with components array", () => {
			const sbom: EnhancedCycloneDXDocument = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {},
				components: [{ type: "library", name: "dep", version: "1.0.0" }],
			};

			const result = validateNTIACompliance(sbom);
			const depField = result.fields.find((f) => f.name === "Dependency Relationship");
			expect(depField?.passed).toBe(true);
			expect(depField?.value).toBe("1 direct dep");
		});

		it("should pass dependency relationship check with dependencies array", () => {
			const sbom: EnhancedCycloneDXDocument = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {},
				dependencies: [{ ref: "pkg:npm/test@1.0.0", dependsOn: ["pkg:npm/dep@1.0.0"] }],
			};

			const result = validateNTIACompliance(sbom);
			const depField = result.fields.find((f) => f.name === "Dependency Relationship");
			expect(depField?.passed).toBe(true);
		});

		it("should pass dependency relationship check with empty components (no deps)", () => {
			const sbom: EnhancedCycloneDXDocument = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {},
				components: [],
			};

			const result = validateNTIACompliance(sbom);
			const depField = result.fields.find((f) => f.name === "Dependency Relationship");
			expect(depField?.passed).toBe(true);
			expect(depField?.value).toBe("0 direct deps");
		});

		it("should pass author check with tools", () => {
			const sbom: EnhancedCycloneDXDocument = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					tools: {
						components: [{ type: "application", name: "cdxgen", version: "10.0.0" }],
					},
				},
			};

			const result = validateNTIACompliance(sbom);
			const authorField = result.fields.find((f) => f.name === "Author");
			expect(authorField?.passed).toBe(true);
			expect(authorField?.value).toBe("cdxgen 10.0.0");
		});

		it("should pass author check with publisher", () => {
			// Testing author detection - other fields intentionally minimal
			const sbom = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					component: {
						publisher: "Test Publisher",
					},
				},
			} as unknown as EnhancedCycloneDXDocument;

			const result = validateNTIACompliance(sbom);
			const authorField = result.fields.find((f) => f.name === "Author");
			expect(authorField?.passed).toBe(true);
			expect(authorField?.value).toBe("Test Publisher");
		});

		it("should pass author check with supplier", () => {
			const sbom: EnhancedCycloneDXDocument = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					supplier: { name: "Supplier Company" },
				},
			};

			const result = validateNTIACompliance(sbom);
			const authorField = result.fields.find((f) => f.name === "Author");
			expect(authorField?.passed).toBe(true);
			expect(authorField?.value).toBe("Supplier Company");
		});

		it("should prefer publisher over supplier for author", () => {
			// Testing author preference - other fields intentionally minimal
			const sbom = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					supplier: { name: "Supplier Company" },
					component: {
						publisher: "Component Publisher",
					},
				},
			} as unknown as EnhancedCycloneDXDocument;

			const result = validateNTIACompliance(sbom);
			const authorField = result.fields.find((f) => f.name === "Author");
			expect(authorField?.value).toBe("Component Publisher");
		});

		it("should return non-compliant when missing timestamp", () => {
			const sbom: EnhancedCycloneDXDocument = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					supplier: { name: "Test Company" },
					component: {
						name: "test-package",
						version: "1.0.0",
						purl: "pkg:npm/test-package@1.0.0",
						publisher: "Test Publisher",
					},
				},
				components: [],
			};

			const result = validateNTIACompliance(sbom);

			expect(result.compliant).toBe(false);
			const timestampField = result.fields.find((f) => f.name === "Timestamp");
			expect(timestampField?.passed).toBe(false);
		});

		it("should calculate correct percentage", () => {
			const sbom: EnhancedCycloneDXDocument = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-15T10:00:00.000Z",
					supplier: { name: "Test Company" },
					component: {
						name: "test-package",
						version: "1.0.0",
						// Missing PURL and publisher
					},
				},
				components: [],
			};

			const result = validateNTIACompliance(sbom);

			// Should have: supplier, component name, component version, deps, timestamp, author (from supplier) = 6
			// Missing: PURL = 1
			expect(result.passedCount).toBe(6);
			expect(result.totalCount).toBe(7);
			expect(result.percentage).toBe(85.7);
		});

		it("should handle tool without version", () => {
			const sbom: EnhancedCycloneDXDocument = {
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					tools: {
						components: [{ type: "application", name: "cdxgen" }],
					},
				},
			};

			const result = validateNTIACompliance(sbom);
			const authorField = result.fields.find((f) => f.name === "Author");
			expect(authorField?.passed).toBe(true);
			expect(authorField?.value).toBe("cdxgen");
		});
	});

	describe("formatNTIAComplianceMarkdown", () => {
		it("should format compliant result with checkmark", () => {
			const result = validateNTIACompliance({
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-15T10:00:00.000Z",
					supplier: { name: "Test Company" },
					component: {
						name: "test-package",
						version: "1.0.0",
						purl: "pkg:npm/test-package@1.0.0",
						publisher: "Test Publisher",
					},
				},
				components: [],
			});

			const markdown = formatNTIAComplianceMarkdown(result);

			expect(markdown).toContain("✅ SBOM Compliance Check");
			expect(markdown).toContain("7/7 (100%)");
			expect(markdown).not.toContain("Action required");
		});

		it("should format non-compliant result with warning", () => {
			const result = validateNTIACompliance({
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-15T10:00:00.000Z",
					component: {
						name: "test-package",
						version: "1.0.0",
					},
				},
				components: [],
			});

			const markdown = formatNTIAComplianceMarkdown(result);

			expect(markdown).toContain("⚠️ SBOM Compliance Check");
			expect(markdown).toContain("Action required");
			expect(markdown).toContain("silk-release.json");
		});

		it("should include table with field statuses", () => {
			const result = validateNTIACompliance({
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					supplier: { name: "Test Company" },
					component: { name: "test", version: "1.0.0" },
				},
				components: [],
			});

			const markdown = formatNTIAComplianceMarkdown(result);

			expect(markdown).toContain("| Field | Status |");
			expect(markdown).toContain("| Supplier Name | ✅ Test Company |");
			expect(markdown).toContain("| Component Name | ✅ test |");
			expect(markdown).toContain("| Timestamp | ❌ Missing |");
		});

		it("should show field values when present", () => {
			const result = validateNTIACompliance({
				bomFormat: "CycloneDX",
				specVersion: "1.5",
				version: 1,
				metadata: {
					timestamp: "2024-01-15T10:00:00.000Z",
					supplier: { name: "My Company" },
					component: {
						name: "my-package",
						version: "2.0.0",
						purl: "pkg:npm/my-package@2.0.0",
						publisher: "My Publisher",
					},
				},
				components: [
					{ type: "library", name: "dep1", version: "1.0.0" },
					{ type: "library", name: "dep2", version: "2.0.0" },
				],
			});

			const markdown = formatNTIAComplianceMarkdown(result);

			expect(markdown).toContain("My Company");
			expect(markdown).toContain("my-package");
			expect(markdown).toContain("2.0.0");
			expect(markdown).toContain("pkg:npm/my-package@2.0.0");
			expect(markdown).toContain("2 direct deps");
			expect(markdown).toContain("My Publisher");
		});
	});
});

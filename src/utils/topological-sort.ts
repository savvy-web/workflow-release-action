import { debug, info } from "@actions/core";
import { createDependencyMap, getPackageInfos } from "workspace-tools";

/**
 * Result of topological sorting
 */
export interface TopologicalSortResult {
	/** Packages sorted in dependency order (dependencies first) */
	sorted: string[];
	/** Whether sorting was successful (false if circular dependencies detected) */
	success: boolean;
	/** Error message if sorting failed */
	error?: string;
}

/**
 * Sort packages in topological order (dependencies first)
 *
 * @remarks
 * Uses Kahn's algorithm to perform topological sorting. This ensures that
 * when publishing packages, dependencies are published before dependents.
 * This is required for registries like JSR that validate dependencies exist.
 *
 * @param packageNames - List of package names to sort
 * @param cwd - Working directory for finding workspace packages
 * @returns Sorted package names with dependencies first
 *
 * @example
 * ```typescript
 * // Given packages: A depends on B, B depends on C
 * const result = sortPackagesTopologically(['A', 'B', 'C'], process.cwd());
 * // result.sorted = ['C', 'B', 'A']
 * ```
 */
export function sortPackagesTopologically(packageNames: string[], cwd: string = process.cwd()): TopologicalSortResult {
	if (packageNames.length <= 1) {
		return { sorted: [...packageNames], success: true };
	}

	try {
		// Get all package infos from the workspace
		const allPackages = getPackageInfos(cwd);

		// Filter to only the packages we care about
		const packageSet = new Set(packageNames);

		// Create dependency map for all packages
		const { dependencies } = createDependencyMap(allPackages, {
			withDevDependencies: false,
			withPeerDependencies: false,
			withOptionalDependencies: false,
		});

		// Build in-degree map (count of dependencies within our package set)
		const inDegree = new Map<string, number>();
		const filteredDeps = new Map<string, Set<string>>();

		for (const pkg of packageNames) {
			inDegree.set(pkg, 0);
			filteredDeps.set(pkg, new Set());
		}

		// Count dependencies that are within our package set
		for (const pkg of packageNames) {
			const deps = dependencies.get(pkg) || new Set();
			for (const dep of deps) {
				if (packageSet.has(dep)) {
					filteredDeps.get(pkg)?.add(dep);
					inDegree.set(pkg, (inDegree.get(pkg) || 0) + 1);
				}
			}
		}

		// Kahn's algorithm for topological sort
		const sorted: string[] = [];
		const queue: string[] = [];

		// Find all packages with no dependencies (in-degree 0)
		for (const [pkg, degree] of inDegree) {
			if (degree === 0) {
				queue.push(pkg);
			}
		}

		while (queue.length > 0) {
			const pkg = queue.shift();
			if (!pkg) break;
			sorted.push(pkg);

			// For each package that depends on this one, decrement in-degree
			for (const [dependent, deps] of filteredDeps) {
				if (deps.has(pkg)) {
					deps.delete(pkg);
					const newDegree = (inDegree.get(dependent) || 1) - 1;
					inDegree.set(dependent, newDegree);
					if (newDegree === 0) {
						queue.push(dependent);
					}
				}
			}
		}

		// Check for circular dependencies
		if (sorted.length !== packageNames.length) {
			const remaining = packageNames.filter((p) => !sorted.includes(p));
			return {
				sorted: packageNames, // Fall back to original order
				success: false,
				error: `Circular dependency detected involving: ${remaining.join(", ")}`,
			};
		}

		debug(`Topological sort order: ${sorted.join(" -> ")}`);
		return { sorted, success: true };
	} catch (error) {
		// If sorting fails, return original order
		debug(`Topological sort failed: ${error instanceof Error ? error.message : String(error)}`);
		return {
			sorted: [...packageNames],
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Sort a map of packages in topological order
 *
 * @param packageMap - Map of package name to package info
 * @param cwd - Working directory for finding workspace packages
 * @returns Array of [name, info] tuples sorted by dependency order
 */
export function sortPackageMapTopologically<T>(
	packageMap: Map<string, T>,
	cwd: string = process.cwd(),
): Array<[string, T]> {
	const packageNames = [...packageMap.keys()];
	const result = sortPackagesTopologically(packageNames, cwd);

	if (!result.success && result.error) {
		info(`⚠️ ${result.error} - publishing in original order`);
	}

	return result.sorted
		.map((name) => {
			const info = packageMap.get(name);
			return info ? ([name, info] as [string, T]) : undefined;
		})
		.filter((entry): entry is [string, T] => entry !== undefined);
}

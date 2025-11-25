---
name: tsdoc
description: Add or update comprehensive TSDoc documentation for TypeScript/JavaScript code
---

# TSDoc Documentation Command

Thoughtfully review the specified file(s) and add or update comprehensive TSDoc documentation following the official TSDoc standard.

## Instructions

1. **Analyze the code structure** - Understand what each function, class, method, interface, and type does
2. **Add missing documentation** - Create TSDoc comments for any undocumented code elements
3. **Update existing documentation** - Improve incomplete or outdated TSDoc comments
4. **Follow TSDoc standards** - Use proper TSDoc tags and formatting

## TSDoc Guidelines

### Required Elements

* **@remarks** - Additional context or important notes
* **@param** - Document all parameters with type and description
* **@returns** - Describe what the function returns
* **@throws** - Document any exceptions that might be thrown
* **@example** - Provide usage examples when helpful
* **@see** - Reference related functions, classes, or external docs
* **@deprecated** - Mark deprecated code with migration guidance

### Style Requirements

* Start with a brief one-line summary
* Add detailed description if needed (separated by blank line)
* Use proper TypeScript types in descriptions
* Include edge cases and important behaviors
* Add examples for complex functions
* Document type parameters with @typeParam

### Example TSDoc Format

```typescript
/**
 * Calculates the compound interest on an investment.
 *
 * @remarks
 * This function uses the standard compound interest formula: A = P(1 + r/n)^(nt)
 * 
 * @param principal - The initial investment amount
 * @param rate - The annual interest rate (as a decimal, e.g., 0.05 for 5%)
 * @param time - The investment period in years
 * @param frequency - The number of times interest is compounded per year
 * @returns The final amount after compound interest
 * @throws {Error} Throws if any parameter is negative
 * 
 * @example
 * ```typescript
 * // Calculate interest for $1000 at 5% for 10 years, compounded monthly
 * const result = calculateCompoundInterest(1000, 0.05, 10, 12);
 * console.log(result); // 1647.01
 * ```
 * 
 * @see {@link calculateSimpleInterest} for non-compound calculations
 */
function calculateCompoundInterest(
  principal: number,
  rate: number,
  time: number,
  frequency: number
): number {
  // Implementation
}
```

## Action Items

When this command is invoked:

1. Read and analyze the specified file(s)
2. Identify all exportable code elements (functions, classes, interfaces, types, constants)
3. Add comprehensive TSDoc comments to undocumented elements
4. Update and improve existing TSDoc comments
5. Ensure all documentation is accurate and follows TSDoc standards
6. Preserve the original code logic - only modify documentation comments

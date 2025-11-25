export {};

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			/** Indicates that the process is being run by GitHub Actions. We use this in the Vitest config to toggle reporting.  */
			SHA: string;
		}
	}
}

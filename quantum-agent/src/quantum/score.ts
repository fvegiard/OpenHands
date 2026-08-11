export interface DeliveryScore {
  codeCorrectness: number;
  testCoverage: number;
  logCleanliness: number;
  errorCount: number;
  finalScore: number;
  breakdown: string;
}

export interface ThinkingStep {
  options: string[];
  risks: string[];
  evidence: string[];
  score: number;
}

/**
 * Maximum number of errors before the penalty saturates at 10/10.
 */
export const MAX_ERRORS = 20;

/**
 * Compute a delivery score from pipeline metrics.
 */
export function computeDeliveryScore(input: {
  codeCorrectness: number;
  testCoverage: number;
  logCleanliness: number;
  errorCount: number;
}): DeliveryScore {
  const clampedCorrectness = Math.max(0, Math.min(10, input.codeCorrectness));
  const clampedCoverage = Math.max(0, Math.min(10, input.testCoverage));
  const clampedCleanliness = Math.max(0, Math.min(10, input.logCleanliness));
  const clampedErrors = Math.max(0, input.errorCount);

  const errorPenalty = Math.min(clampedErrors / MAX_ERRORS, 1) * 10;
  const finalScore =
    clampedCorrectness * 0.4 +
    clampedCoverage * 0.25 +
    clampedCleanliness * 0.2 +
    (10 - errorPenalty) * 0.15;

  const rounded = Math.round(finalScore * 100) / 100;

  const breakdown = [
    `code_correctness=${clampedCorrectness.toFixed(2)}/10 (weight 0.40)`,
    `test_coverage=${clampedCoverage.toFixed(2)}/10 (weight 0.25)`,
    `log_cleanliness=${clampedCleanliness.toFixed(2)}/10 (weight 0.20)`,
    `error_count=${clampedErrors} (penalty ${errorPenalty.toFixed(2)}/10, weight 0.15)`,
    `final=${rounded.toFixed(2)}/10`,
  ].join("\n");

  return {
    codeCorrectness: clampedCorrectness,
    testCoverage: clampedCoverage,
    logCleanliness: clampedCleanliness,
    errorCount: clampedErrors,
    finalScore: rounded,
    breakdown,
  };
}

export function runSequentialThinking(task: string, branch: string): ThinkingStep {
  const taskLower = task.toLowerCase();
  const branchLower = branch.toLowerCase();

  const options = [
    "Proceed with the current approach as planned",
    "Refactor the implementation for better maintainability",
    "Switch to a simpler alternative to reduce risk",
    "Defer the change and gather more evidence first",
  ];

  if (taskLower.includes("fix") || taskLower.includes("bug")) {
    options.push("Add regression tests before applying the fix");
  }
  if (taskLower.includes("build") || taskLower.includes("create")) {
    options.push("Prototype a minimal version first to validate feasibility");
  }
  if (branchLower.includes("review")) {
    options.push("Run a second-pass review after the initial implementation");
  }

  const risks: string[] = [];
  if (taskLower.includes("fix") || branchLower.includes("coder")) {
    risks.push("Breaking existing functionality in adjacent modules");
  }
  if (taskLower.includes("build") || taskLower.includes("create")) {
    risks.push("Scope creep beyond the original requirements");
  }
  if (taskLower.includes("refactor")) {
    risks.push("Introducing subtle behavior changes during cleanup");
  }
  risks.push("Performance regression under load");
  risks.push("Missing edge cases not covered by tests");
  risks.push("Linting or type errors in the modified area");

  const evidence = [
    "Current test suite status and coverage data",
    "Recent log output for errors or warnings",
    "Code review comments and patterns in the codebase",
    "Dependency and type-check results",
  ];

  if (taskLower.includes("auth") || taskLower.includes("security")) {
    evidence.push("Security audit reports and dependency vulnerability scans");
  }
  if (taskLower.includes("performance") || taskLower.includes("slow")) {
    evidence.push("Profiling data and benchmark comparisons");
  }

  const score =
    Math.round(
      Math.min(options.length * 0.3 + risks.length * 0.3 + evidence.length * 0.4, 10) * 100,
    ) / 100;

  return { options, risks, evidence, score };
}

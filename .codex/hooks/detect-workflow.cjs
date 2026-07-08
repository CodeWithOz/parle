#!/usr/bin/env node

/**
 * Workflow Autodetection Hook (UserPromptSubmit)
 *
 * Detects when a user prompt looks like a development task (build, fix, add, refactor, etc.)
 * and injects additional context reminding Claude to follow the full workflow.
 *
 * This fires on EVERY user prompt. It does NOT block — it only adds context when
 * it detects a development task that wasn't already triggered via /dev.
 */

const fs = require("fs");

// Read the hook input from stdin
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input);
    const prompt = (data.prompt || "").toLowerCase().trim();

    // Don't interfere if the user is already using the /dev command
    // (slash commands have their own handling)
    if (prompt.startsWith("/dev") || prompt.startsWith("/workflow")) {
      process.exit(0);
    }

    // Skip very short prompts (likely follow-ups, confirmations, etc.)
    if (prompt.length < 15) {
      process.exit(0);
    }

    // Skip prompts that are clearly questions or conversational
    const conversationalPatterns = [
      /^(what|how|why|when|where|who|can you explain|tell me about)/,
      /^(thanks|thank you|ok|okay|yes|no|sure|got it|sounds good)/,
      /^(show me|list|display|print|read|cat|grep|find)\b/,
      /\?$/,
    ];

    if (conversationalPatterns.some((p) => p.test(prompt))) {
      process.exit(0);
    }

    // Detect development task intent
    const devTaskPatterns = [
      // Building / Creating
      /\b(build|create|implement|add|make|set up|scaffold|generate|write)\b.{5,}/,
      // Fixing / Debugging
      /\b(fix|debug|resolve|patch|repair|troubleshoot|investigate)\b.{5,}/,
      // Modifying / Refactoring
      /\b(refactor|change|modify|update|adjust|rewrite|rework|restructure|migrate|convert)\b.{5,}/,
      // Features
      /\b(feature|endpoint|route|component|page|api|hook|middleware|handler|service|module)\b/,
      // Integration
      /\b(integrate|connect|hook up|wire up|link|attach)\b.{5,}/,
      // Removal
      /\b(remove|delete|deprecate|drop|eliminate)\b.{3,}(function|feature|endpoint|component|module|page)/,
    ];

    const looksLikeDevTask = devTaskPatterns.some((p) => p.test(prompt));

    if (looksLikeDevTask) {
      // Output additional context — this gets injected into Claude's context
      const context = JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: [
            "WORKFLOW REMINDER: This prompt looks like a development task.",
            "The full development workflow (/dev) includes: test design → build → code review → test execution → documentation.",
            "You should follow the workflow defined in .claude/commands/dev.md.",
            "Proceed as the Supervisor Agent: plan the work, set expectations for each phase, and spawn sub-agents sequentially.",
            "If this is actually a simple question or minor tweak that doesn't warrant the full workflow, use your judgment — but for anything involving new code, bug fixes, or feature work, run the full workflow.",
          ].join(" "),
        },
      });

      process.stdout.write(context);
    }

    process.exit(0);
  } catch (err) {
    // Non-blocking error — don't interfere with the user's prompt
    process.stderr.write(`Workflow hook error: ${err.message}`);
    process.exit(0);
  }
});

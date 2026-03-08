Execute the development pipeline for batch code generation.

## What this does

The pipeline runs `scripts/run-pipeline.sh` which:
1. Reads a config file defining modules (branch, tasks.md, prompt files, test commands)
2. For each module: executes a Claude Code prompt → runs tests → auto-fixes on failure
3. Tracks progress in `scripts/pipeline-status.json` with macOS notifications
4. Detects "wall hits" (flaky tests, prompt too long, ineffective fixes) and handles them

Two prompt modes:
- **Pre-written**: module points to a `.md` file in prompts dir (e.g., `"f6:f6.md:F6.1"`)
- **Auto-generated**: module points to a tasks.md section with `@` prefix (e.g., `"task1:@Task 1\: App Group:1.1"`) — no prompt files needed, just design.md + tasks.md

## Instructions

Parse `$ARGUMENTS` and act accordingly:

### Case 1: `$ARGUMENTS` contains a config file path (e.g., `docs/ai-chat-design/pipeline.config.sh`)
1. Verify the config file exists
2. Read it to show the user: branch, module count, test commands
3. Run `./scripts/run-pipeline.sh $ARGUMENTS` (pass all arguments through)
4. After completion, read `scripts/pipeline-status.json` and show a formatted summary

### Case 2: `$ARGUMENTS` is "status"
1. Read `scripts/pipeline-status.json`
2. Show a formatted table:
   - Each module: id, status (with emoji), duration
   - Current phase if pipeline is running
   - Wall clock time
   - Last test output snippet if there were failures

### Case 3: `$ARGUMENTS` is empty or "--dry"
1. Search for all `**/pipeline.config.sh` files in the project using glob
2. List them with their PIPELINE_BRANCH and module count
3. Ask the user which config to use
4. If `--dry` was specified, run with `--dry` flag
5. Otherwise run the selected config

### Case 4: `$ARGUMENTS` contains a module ID (e.g., "s1")
1. Search for `**/pipeline.config.sh` files
2. If only one exists, use it; otherwise ask user to choose
3. Run `./scripts/run-pipeline.sh <config> <module-id>`

## Important notes

- The pipeline script uses `--dangerously-skip-permissions` for nested Claude Code calls
- Logs are saved to `scripts/logs/` — mention the log path after execution
- If the pipeline stops due to a wall hit, suggest: `./scripts/run-pipeline.sh <config> <failed-module>` to resume

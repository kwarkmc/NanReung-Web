# Repository Guidelines

## Project Structure

This directory is starting from an empty workspace. When adding the first application or package, use the chosen framework's standard layout. Keep application code, test fixtures, and static assets in the locations that framework expects. Add a root README that identifies the entry point and shows where contributors should place new code, tests, and assets.

## Build, Test, and Development

When introducing a toolchain, document its required version, dependency installation, and the exact commands to run locally, build, and test. Record any required environment variables in an example configuration with placeholder values. Run the documented commands from a fresh checkout before submitting changes to setup or build configuration.

## Style and Naming

Use UTF-8 for text files. Once source files exist, follow the indentation, naming, and file organization used by neighboring code. If you add a formatter or linter, commit its configuration with the code it governs and document the command contributors should run. Keep unrelated formatting changes out of functional patches.

## Testing

Follow the test runner's file naming and discovery conventions when adding tests. For a bug fix, include a regression test that exercises the affected behavior when the project has a test runner. For a change verified manually, record the steps and expected result in the pull request. Run the relevant checks before requesting review.

## Commits and Pull Requests

Keep commits focused and write a short, imperative subject such as `Document local setup`. In the pull request, describe the change and why it matters, list the checks you ran, and link a related issue when one exists. Include screenshots for visible changes and call out any setup or configuration changes reviewers need to reproduce the result.

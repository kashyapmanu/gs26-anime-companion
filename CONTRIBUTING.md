# Contributing Guidelines

Thank you for your interest in contributing to **gs26-anime-companion**! Below is a quick guide to get you started.

## Getting Started
1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/<your-username>/gs26-anime-companion.git
   cd gs26-anime-companion
   ```
3. **Create a new branch** for your work:
   ```bash
   git checkout -b <feature-or-fix-name>
   ```
4. Follow the project's **Setup** instructions in the main `README.md` to install dependencies and configure the environment.

## Development workflow
- **Run tests** locally:
  ```bash
  npm test
  ```
- **Run the type checker**:
  ```bash
  npm run typecheck
  ```
- **Make sure the code formats** (if you have Prettier set up) and lints clean.

## Submitting a Pull Request
1. Push your changes to your fork:
   ```bash
   git push origin <feature-or-fix-name>
   ```
2. Open a **Pull Request** on GitHub.
3. Ensure your PR follows the **Conventional Commits** format for commit messages (e.g., `feat: add new avatar loader`). This helps generate a clear changelog.
4. Fill out the pull request template – it will be automatically applied from `.github/PULL_REQUEST_TEMPLATE.md`.
5. Wait for CI (when added) and review feedback, then make any required changes.

## Code of Conduct
Please also read the [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) which outlines expectations for participant behavior.

Happy coding! 🚀

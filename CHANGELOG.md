# Changelog

## 0.9.0

- Publish releases to npm from GitHub Actions using Trusted Publishing (OIDC) and provenance.
- Validate release tags against the package version and `main`, and run tests and package-content checks before publishing.
- Add a manual workflow for validating the package without publishing it.
- Correct the npm package entry point and published files, and document installation and release setup.

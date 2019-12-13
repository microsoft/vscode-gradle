# Contributing

## How to contribute

Start by opening an issue using one of the issue templates, or propose a change by submitting a pull request. Please include a detailed pull request description.

## Running the project

1. Make sure you have [nvm](https://github.com/nvm-sh/nvm) installed
2. Change directory to the root of the project
3. Select Node version with `nvm use`
4. Install Node packages: `npm install`
5. Install [Java version >= 8](https://adoptopenjdk.net/)
6. Build Java executables: `npm run compile:java`

Now open the root of the project in VS Code, click on the Debug panel, and select either "Run Extension" or any of the test launch configurations.

### Code style

Prettier is used to lint & format the code. The builds will not pass if there are linting issues.

- Lint: `npm run lint`
- Format: `npm run format`

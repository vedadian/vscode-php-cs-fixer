# PHP CS Fixer for Visual Studio Code

A Visual Studio Code extension that formats PHP documents with PHP CS Fixer.

## Requirements

- Visual Studio Code 1.145.0 or later
- PHP CS Fixer installed in the Composer project you open, at `vendor/bin/php-cs-fixer`
- A `composer.json` file in the workspace

The extension uses the project's PHP CS Fixer executable and configuration; it does not bundle PHP or PHP CS Fixer.

## Usage

Open the Composer project in Visual Studio Code, then run **Format Document** for a PHP file (by default, `Shift+Alt+F` on Linux and Windows or `Shift+Option+F` on macOS). You can also configure this extension as your default PHP formatter in your VS Code settings.

## Development

```sh
pnpm install
pnpm run compile
```

Open this repository in Visual Studio Code and press `F5` to launch the extension in an Extension Development Host. The included launch configuration compiles the TypeScript before launch. Use `pnpm run watch` to compile continuously during development.
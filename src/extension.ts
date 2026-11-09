import path from "node:path";
import childProcess from "node:child_process";
import { parsePatch, type StructuredPatch } from "./diff";
import {
  languages,
  Position,
  Range,
  RelativePattern,
  TextEdit,
  window,
  workspace,
  type ExtensionContext,
} from "vscode";

const log = window.createOutputChannel("Vedadian's PHP CS Fixer");

const beginDiff = "---------- begin diff ----------";
const endDiff = "----------- end diff -----------";

function toTextEdits(patches: StructuredPatch[]): TextEdit[] {
  const edits: TextEdit[] = [];

  const addEdit = (
    startLine: number,
    removeCount: number,
    insertText: string[],
  ) => {
    if (removeCount > 0) {
      const range = new Range(startLine, 0, startLine + removeCount, 0);
      if (insertText.length === 0) {
        edits.push(TextEdit.delete(range));
      } else edits.push(TextEdit.replace(range, insertText.join("\n") + "\n"));
    } else if (insertText.length !== 0) {
      const start = new Position(startLine, 0);
      edits.push(TextEdit.insert(start, insertText.join("\n") + "\n"));
    }
  };

  for (const patch of patches) {
    for (const hunk of patch.hunks) {
      let startLine = hunk.oldStart - 1;
      let removeCount = 0;
      let insertText = [];
      for (let i = 0; i < hunk.lines.length; ++i) {
        switch (hunk.lines[i][0]) {
          case " ":
            addEdit(startLine, removeCount, insertText);
            startLine += removeCount + 1;
            removeCount = 0;
            insertText = [];
            break;
          case "-":
            removeCount++;
            break;
          case "+":
            insertText.push(hunk.lines[i].substring(1));
            break;
          case "\\":
            // \ No newline at end of file
            log.appendLine(`Patch line: ${hunk.lines[i]}`);
            break;
        }
      }
      addEdit(startLine, removeCount, insertText);
    }
  }

  return edits;
}

const findComposerJsonAndPhpCsFixer = async () => {
  const composerJsonPaths = await workspace.findFiles(
    "**/composer.json",
    "**/{vendor,node_modules}/**",
  );
  const result =
    composerJsonPaths.length === 0
      ? []
      : (
          await Promise.all(
            composerJsonPaths.map(async (composerJsonUri) => {
              const phpCsFixerPaths = await workspace.findFiles(
                new RelativePattern(
                  path.dirname(composerJsonUri.fsPath),
                  "vendor/bin/php-cs-fixer",
                ),
              );
              if (phpCsFixerPaths.length === 0) {
                return [];
              }
              return phpCsFixerPaths.map((phpCsFixerUri) => ({
                composerJsonPath: composerJsonUri,
                phpCsFixerPath: phpCsFixerUri,
              }));
            }),
          )
        ).flat();
  return result;
};

function runPhpCsFixer(
  phpCode: string,
  cwd: string,
  executable: string,
): Promise<StructuredPatch[]> {
  return new Promise((resolve, reject) => {
    const process = childProcess.spawn(
      executable,
      ["fix", "--using-cache=no", "--dry-run", "--diff", "-"],
      { cwd },
    );

    let stdout = "";
    let stderr = "";

    process.stdout.setEncoding("utf8");
    process.stderr.setEncoding("utf8");

    process.stdout.on("data", (chunk) => (stdout += chunk));
    process.stderr.on("data", (chunk) => (stderr += chunk));

    process.on("error", reject);

    process.on("close", (code) => {
      if (code !== 0 && code !== 8) {
        reject(new Error(stderr || `PHP CS Fixer exited with code ${code}`));
        return;
      }
      const beginIndex = stdout.indexOf(beginDiff);
      const endIndex = stdout.indexOf(endDiff);
      if (beginIndex !== -1 && endIndex !== -1 && beginIndex < endIndex) {
        stdout = stdout.slice(beginIndex + beginDiff.length, endIndex).trim();
      } else {
        reject(new Error("Failed to extract diff from PHP CS Fixer output."));
        return;
      }
      if (stdout.trim() === "") {
        resolve([]);
        return;
      }
      resolve(parsePatch(stdout));
    });

    process.stdin.end(phpCode);
  });
}

export async function activate(context: ExtensionContext) {
  const toolsPaths = await findComposerJsonAndPhpCsFixer();
  if (toolsPaths.length === 0) {
    log.appendLine(
      "Could not find the composer.json and/or php-cs-fixer executable.",
    );
  }
  log.appendLine(
    `Using composer.json at: ${toolsPaths[0].composerJsonPath.fsPath}`,
  );
  log.appendLine(
    `Using php-cs-fixer at: ${toolsPaths[0].phpCsFixerPath.fsPath}`,
  );
  context.subscriptions.push(
    languages.registerDocumentFormattingEditProvider(
      { language: "php" },
      {
        async provideDocumentFormattingEdits(document) {
          if (document.languageId !== "php") {
            return [];
          }
          if (toolsPaths.length === 0) {
            return [];
          }
          const cwd = path.dirname(toolsPaths[0].composerJsonPath.fsPath);
          const executable = toolsPaths[0].phpCsFixerPath.fsPath;
          const phpCode = document.getText();
          try {
            const result = await runPhpCsFixer(phpCode, cwd, executable);
            const edits = toTextEdits(result);
            return edits;
          } catch (error) {
            log.appendLine(`Error: ${(error as Error).message}`);
          }
        },
      },
    ),
  );
}

export function deactivate() {
  log.appendLine("Deactivating Vedadian's PHP CS Fixer extension.");
}

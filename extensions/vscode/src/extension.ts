import * as vscode from "vscode";

type CodeResponse = {
  code: string;
  explanation: string;
};

export function activate(context: vscode.ExtensionContext): void {
  const commands: Array<[string, string]> = [
    ["browserAiBridge.ask", "ask"],
    ["browserAiBridge.explain", "explain"],
    ["browserAiBridge.fix", "fix"],
    ["browserAiBridge.refactor", "refactor"],
    ["browserAiBridge.optimize", "optimize"]
  ];

  for (const [command, task] of commands) {
    context.subscriptions.push(vscode.commands.registerCommand(command, () => runCommand(task)));
  }
}

async function runCommand(task: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const selection = editor?.document.getText(editor.selection);
  const instruction = await vscode.window.showInputBox({
    prompt: task === "ask" ? "Ask the browser-backed AI" : `Instruction for ${task}`,
    value: task === "ask" ? undefined : `${task} the selected code.`
  });
  if (instruction === undefined) {
    return;
  }

  const config = vscode.workspace.getConfiguration("browserAiBridge");
  const baseUrl = config.get<string>("url", "http://127.0.0.1:8787").replace(/\/$/, "");
  const model = config.get<string>("model", "gemini-ui");
  const isCodeTask = task !== "ask" && editor !== undefined && selection !== undefined && selection.length > 0;
  const response = await fetch(`${baseUrl}${isCodeTask ? "/v1/code" : "/v1/chat/completions"}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(isCodeTask
      ? {
        model,
        language: languageFor(editor?.document.languageId ?? "text"),
        task,
        code: selection,
        instruction
      }
      : { model, messages: [{ role: "user", content: instruction }], stream: false })
  });

  const body = await response.json() as CodeResponse & { error?: { message: string } };
  if (!response.ok) {
    throw new Error(body.error?.message ?? `API request failed with ${response.status}.`);
  }

  if (isCodeTask && editor !== undefined) {
    await editor.edit((edit) => edit.replace(editor.selection, body.code));
  } else {
    const content = "code" in body ? body.explanation : (body as { choices: [{ message: { content: string } }] }).choices[0].message.content;
    const document = await vscode.workspace.openTextDocument({ content, language: "markdown" });
    await vscode.window.showTextDocument(document, { preview: true });
  }
}

function languageFor(languageId: string): string {
  return languageId === "cpp" ? "cpp" : languageId === "javascriptreact" ? "tsx" : languageId;
}

export function deactivate(): void {}
import vscode from "vscode";
import { TestTaskAction, TestTaskProvider, TestItemAction } from "./testTask";
import { FilesAsTestTaskAction } from './filesAction';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const testTaskProvider = new TestTaskProvider(context);
  vscode.window.registerTreeDataProvider("testTasks", testTaskProvider);

  const testTaskAction = new TestTaskAction(context, testTaskProvider);
  const executeCommand = vscode.commands.registerCommand(
    "testTasks.executeTask",
    (task) => testTaskAction.executeTestTask(testTaskProvider, task)
  );
  const deleteCommand = vscode.commands.registerCommand(
    "testTasks.deleteTask",
    testTaskAction.deleteTestTask
  );
  const editCommand = vscode.commands.registerCommand(
    "testTasks.editTask",
    testTaskAction.editTask
  );
  context.subscriptions.push(executeCommand, editCommand, deleteCommand);

  const openFileCommand = vscode.commands.registerCommand(
    "testItems.openFile",
    TestItemAction.open
  );
  context.subscriptions.push(openFileCommand);

  // 注册右键菜单命令
  const filesAsTestTaskAction = new FilesAsTestTaskAction(testTaskProvider);
  const fileCommand = vscode.commands.registerCommand(
    "extension.addFilesAsTestTask",
    filesAsTestTaskAction.add
  );
  context.subscriptions.push(fileCommand);

}

// This method is called when your extension is deactivated
export function deactivate() { }

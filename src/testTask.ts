import path from 'path';
import vscode from "vscode";
import TestResultWatcher from "./resultWatch";


class TestItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly id: string,
    public readonly filePath: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.None
  ) {
    super(label, collapsibleState);
    this.tooltip = label;
    this.description = filePath;
    this.contextValue = "testItem";
    this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
    this.iconPath = new vscode.ThemeIcon("circle-large-outline");
    this.command = {
      command: "testItems.openFile",
      title: "打开文件",
      arguments: [vscode.Uri.file(filePath)],
    };
  }
}

class TestTask extends TestItem {
  constructor(
    public label: string,
    id: string,
    public readonly children: TestItem[] = [],
    collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.Collapsed
  ) {
    super(label, id, "", collapsibleState);
    this.contextValue = "testTask";
    this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
    this.iconPath = new vscode.ThemeIcon("folder");
  }

  // 获取所有测试项的文件路径
  public getTestFilePaths(): string[] {
    return this.children
      .filter(
        (item) => item.checkboxState === vscode.TreeItemCheckboxState.Checked
      )
      .map((item) => item.filePath);
  }
}


export class TestItemAction {
  static open = async (fileUri: vscode.Uri) => {
    try {
      const document = await vscode.workspace.openTextDocument(fileUri);
      await vscode.window.showTextDocument(document, {
        preview: false,
        viewColumn: vscode.ViewColumn.Active,
      });
    } catch (error) {
      vscode.window.showErrorMessage(
        `无法打开文件 ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
}

export class TestTaskProvider implements vscode.TreeDataProvider<TestItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TestTask | undefined
  >();
  private tasks: TestTask[] = []; // 存储任务列表

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {
    this.tasks = this.loadTasks() || [];
  }

  getTasks = (): TestTask[] => this.tasks;

  private saveTasks(): void {
    const toSave = this.tasks.map((task) => ({
      label: task.label,
      id: task.id,
      children: task.children.map((child) => ({
        label: child.label,
        id: child.id,
        filePath: child.filePath,
      })),
    }));
    this.context.globalState.update("testTasks", toSave);
  }

  private loadTasks(): TestTask[] | undefined {
    const saved = this.context.globalState.get<TestTask[]>("testTasks");
    return saved?.map(
      (task) =>
        new TestTask(
          task.label,
          task.id,
          task.children.map(
            (child) => new TestItem(child.label, child.id, child.filePath)
          )
        )
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TestTask): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TestTask): Thenable<TestItem[]> {
    if (element) {
      // 返回子任务时需要进行类型转换
      return Promise.resolve(element.children);
    } else {
      return Promise.resolve(this.tasks);
    }
  }

  deleteTask(taskId: string): void {
    this.tasks = this.tasks.filter((task) => task.id !== taskId);
    this.saveTasks();
    this.refresh();
  }

  public updateTestStatus(taskLabel: string, nodeid: string, status: string) {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    for (const task of this.tasks) {
      if (task.label !== taskLabel) {continue;}

      for (const item of task.children) {
        const nodePath = workspace ? item.filePath.replace(workspace, '').slice(1) : item.filePath;        
        if (workspace && nodeid.startsWith(nodePath)) {
          item.iconPath = new vscode.ThemeIcon(status === "passed" ? "testing-passed-icon" : "testing-failed-icon");
          this.refresh();
          break;
        }
      }
    }
  }

  // 添加新任务的方法
  public async addFilesAsTask(files: vscode.Uri[]): Promise<void> {
    // 让用户输入任务名称
    const taskName = await vscode.window.showInputBox({
      prompt: "请输入测试任务名称",
      placeHolder: "例如: 集成测试套件",
    });

    if (!taskName || taskName.trim() === "") {
      return;
    }

    // 创建测试子项
    const testItems = files.map(
      (file, index) =>
        new TestItem(
          path.parse(file.path).name,
          `testcase-${Date.now()}-${index}`,
          file.fsPath
        )
    );

    // 创建新任务
    const newTask = new TestTask(taskName, `task-${Date.now()}`, testItems);

    // 添加到任务列表
    this.tasks.push(newTask);
    this.saveTasks();
    this.refresh();

    vscode.window.showInformationMessage(`已添加新测试任务: ${taskName}`);
  }
}

export class TestTaskAction {
  private testTaskProvider: TestTaskProvider;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext, testTaskProvider: TestTaskProvider) {
    this.testTaskProvider = testTaskProvider;
    this.context = context;
  }

  public deleteTestTask = (task: TestTask) => {
    vscode.window
      .showWarningMessage(`确认删除测试任务: ${task.label}?`, "是", "否")
      .then((answer) => {
        if (answer === "是") {
          // 这里添加实际删除任务的逻辑
          this.testTaskProvider.deleteTask(task.id);
          vscode.window.showInformationMessage(`已删除测试任务: ${task.label}`);
        }
      });
  };

  public editTask = async (task: TestTask) => {
    const newName = await vscode.window.showInputBox({
      value: task.label,
      prompt: "输入新的任务名称",
    });
    if (newName) {
      task.label = newName;
      this.testTaskProvider.refresh();
    }
  };

  public executeTestTask = async (testTaskProvider: TestTaskProvider, task: TestTask) => {
    // watch dog
    const resultWatcher = new TestResultWatcher(task.label, testTaskProvider);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      resultWatcher.watchTestResults(workspaceRoot);
    }

    try {
      const testFiles = task.getTestFilePaths();

      if (testFiles.length === 0) {
        vscode.window.showWarningMessage(
          `任务 "${task.label}" 中没有选中任何测试文件，请先勾选要执行的文件`
        );
        return;
      }

      const answer = await vscode.window.showWarningMessage(
        `确认执行任务: ${task.label} (${testFiles.length} 个测试文件)?`,
        "是",
        "否"
      );
      if (answer !== "是") {
        return;
      }

      // 创建终端
      const terminal = vscode.window.createTerminal({
        name: `执行: ${task.label}`,
        hideFromUser: false,
        env: {
          PYTHONPATH: this.context.extensionPath,
          PYTEST_PLUGINS: "pytest_hooks.report_hook",
        }
      });
      
      vscode.window.onDidCloseTerminal((e) => {
        if (e === terminal) {
          console.log('terminal on close...');
        }
      });

      terminal.show();

      // 更新icon -> loading
      for (const item of task.children) {
        // TODO 这里要优化一下, 这个判断和上面 getTestFilePaths 中的逻辑有点重复
        if (item.checkboxState === vscode.TreeItemCheckboxState.Checked) {
          item.iconPath = new vscode.ThemeIcon("loading~spin");
          testTaskProvider.refresh();
        }
      }

      // cmd
      let command: string = "python3 -m pytest -sv";
      for (const filePath of testFiles) {
        command += ` ${filePath}`;
      }
      terminal.sendText(command);
      vscode.window.showInformationMessage(`正在执行测试任务: ${task.label}`);
    } catch (error) {
      vscode.window.showErrorMessage(`执行任务异常: ${error}`);
    }
  };
}


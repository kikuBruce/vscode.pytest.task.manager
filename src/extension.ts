// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { Test } from 'mocha';
import path, { join } from 'path';
import os from 'os';
import { spawn } from 'child_process';
import * as vscode from 'vscode';

class TestItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly id: string,
		public readonly filePath: string,
        collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsibleState);
        this.tooltip = label;
		this.description = filePath;
        this.contextValue = 'testItem';
		this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
		// this.iconPath = new vscode.ThemeIcon('debug-console-view-icon');
		this.command = {
			command: 'testItems.openFile',
			title: '打开文件',
			arguments: [vscode.Uri.file(filePath)]
		};
	}
}

class TestTask extends TestItem {
    constructor(
        public label: string,
        id: string,
        public readonly children: TestItem[] = [],
        collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    ) {
        super(label, id, '', collapsibleState);
        this.contextValue = 'testTask';
		this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
        this.iconPath = new vscode.ThemeIcon('folder');
    }

	// 获取所有测试项的文件路径
	public getTestFilePaths(): string[] {
		return this.children.filter(item => item.checkboxState === vscode.TreeItemCheckboxState.Checked).map(item => item.filePath);
	}
}

class TestTaskProvider implements vscode.TreeDataProvider<TestItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TestTask | undefined>();
	private tasks: TestTask[] = []; // 存储任务列表

    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext) {
        this.tasks = this.loadTasks() || [];
    }

	getTasks = (): TestTask[] => this.tasks;

	private saveTasks(): void {
        const toSave = this.tasks.map(task => ({
            label: task.label,
            id: task.id,
            children: task.children.map(child => ({
                label: child.label,
                id: child.id,
                filePath: child.filePath
            }))
        }));
        this.context.globalState.update('testTasks', toSave);
    }

	private loadTasks(): TestTask[] | undefined {
        const saved = this.context.globalState.get<TestTask[]>('testTasks');
        return saved?.map(task => new TestTask(
            task.label,
            task.id,
            task.children.map(child => new TestItem(
                child.label,
                child.id,
                child.filePath
            ))
        ));
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
        this.tasks = this.tasks.filter(task => task.id !== taskId);
		this.saveTasks();
        this.refresh();
    }

	// 添加新任务的方法
	public async addFilesAsTask(files: vscode.Uri[]): Promise<void> {
		// 让用户输入任务名称
		const taskName = await vscode.window.showInputBox({
			prompt: '请输入测试任务名称',
			placeHolder: '例如: 集成测试套件'
		});

		if (!taskName || taskName.trim() === '') {
			return;
		}

		// 创建测试子项
		const testItems = files.map((file, index) => 
			new TestItem(
				path.parse(file.path).name,
				`testcase-${Date.now()}-${index}`,
				file.fsPath
			)
		);

		// 创建新任务
		const newTask = new TestTask(
			taskName,
			`task-${Date.now()}`,
			testItems
		);

		// 添加到任务列表
		this.tasks.push(newTask);
		this.saveTasks();
		this.refresh();
		
		vscode.window.showInformationMessage(`已添加新测试任务: ${taskName}`);
	}
}

class TestTaskAction {
	private testTaskProvider: TestTaskProvider;

	constructor (testTaskProvider: TestTaskProvider) {
		this.testTaskProvider = testTaskProvider;
	}

	public deleteTestTask = (task: TestTask) => {
		vscode.window.showWarningMessage(`确认删除测试任务: ${task.label}?`, '是', '否')
			.then(answer => {
				if (answer === '是') {
					// 这里添加实际删除任务的逻辑
					this.testTaskProvider.deleteTask(task.id);
					vscode.window.showInformationMessage(`已删除测试任务: ${task.label}`);
				}
			});
	};
	
	public editTask = async (task: TestTask) => {
		const newName = await vscode.window.showInputBox({
			value: task.label,
			prompt: '输入新的任务名称'
		});
		if (newName) {
			task.label = newName;
			this.testTaskProvider.refresh();
		}
	};
	

	private findTestItemByNodeId(nodeid: string): TestItem | undefined {
		// 实现根据pytest的nodeid找到对应的TestItem
		// 需要确保TestItem创建时存储了对应的测试标识
		for (const task of this.testTaskProvider.getTasks()) {
			for (const item of task.children) {
				console.log(`===> item ${item} --> nodeid ${nodeid}`);
				if (item.id === nodeid) {  // 假设TestItem有testId属性存储nodeid
					return item;
				}
			}
		}
		return undefined;
	}

	private handleTestUpdate(result: any, outputChannel: vscode.OutputChannel) {
		// 更新TestItem状态
		const testItem = this.findTestItemByNodeId(result.nodeid);
		if (testItem) {
			testItem.setStatus(result.status);
			this.testTaskProvider.refresh();
		}
		
		// 显示结果
		switch (result.status) {
			case 'passed':
				outputChannel.appendLine(`✓ ${result.nodeid} (${result.duration.toFixed(2)}s)`);
				break;
			case 'failed':
				outputChannel.appendLine(`✗ ${result.nodeid} - ${result.message}`);
				break;
			case 'skipped':
				outputChannel.appendLine(`↷ ${result.nodeid} (skipped)`);
				break;
		}
	}
	
	public executeCommand = async (task: TestTask) => {
		const testFiles = task.getTestFilePaths();
		if (testFiles.length === 0) {return;}

		const outputChannel = vscode.window.createOutputChannel(`Pytest 实时结果: ${task.label}`);
		outputChannel.show(true);

		// 创建进度通知
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `正在执行测试: ${task.label}`,
			cancellable: true
		}, async (progress, token) => {
			token.onCancellationRequested(() => {
				outputChannel.appendLine('测试已被用户取消');
			});

			// 获取当前Python解释器路径
			const pythonPath = vscode.workspace.getConfiguration('python').get('pythonPath', 'python');
			
			// 准备临时报告文件路径
			const reportPipe = path.join(os.tmpdir(), `pytest_vscode_pipe_${Date.now()}`);
			
			// 执行 pytest 子进程
			const pytest = spawn(pythonPath, [
				'-m', 'pytest',
				...testFiles,
				'-p', 'pytest_vscode_plugin',  // 加载我们的插件
				'-v',
				'--capture=no'  // 禁用输出捕获以确保实时输出
			], {
				cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
				shell: true
			});

			// 实时处理输出
			pytest.stdout.on('data', (data) => {
				const output = data.toString();
				
				// 检查插件特定的输出格式
				if (output.startsWith('VSCODE_PYTEST_UPDATE:')) {
					try {
						const jsonStr = output.substring('VSCODE_PYTEST_UPDATE:'.length).trim();
						const result = JSON.parse(jsonStr);
						this.handleTestUpdate(result, outputChannel);
					} catch (error) {
						outputChannel.appendLine(`解析测试结果失败: ${error}`);
					}
				} else {
					// 普通输出
					outputChannel.append(output);
				}
			});

			pytest.stderr.on('data', (data) => {
				outputChannel.append(`ERROR: ${data.toString()}`);
			});

			// 等待测试完成
			return new Promise<void>((resolve) => {
				pytest.on('close', (code) => {
					outputChannel.appendLine(`\n测试执行完成，退出码: ${code}`);
					resolve();
				});
			});
		});
	};

	public executeTestTask = async (task: TestTask) => {
		try {
			const testFiles = task.getTestFilePaths();
					
			if (testFiles.length === 0) {
				vscode.window.showWarningMessage(`任务 "${task.label}" 中没有选中任何测试文件，请先勾选要执行的文件`);
				return;
			}
	
			// 二次确认
			vscode.window.showWarningMessage(`确认执行任务: ${task.label} (${testFiles.length} 个测试文件)?`, '是', '否')
			.then(answer => {
				if (answer === '是') {
					// 创建终端
					const terminal = vscode.window.createTerminal({
						name: `执行: ${task.label}`,
						hideFromUser: false
					});
					terminal.show();
	
					// cmd
					let command: string = 'python3 -m pytest -sv';
					for (const filePath of testFiles) {
						command += ` ${filePath}`;
					}
					console.log(command);
					terminal.sendText(command);
					vscode.window.showInformationMessage(`正在执行测试任务: ${task.label}`);
				}
			});
		} catch (error) {
			vscode.window.showErrorMessage(`执行任务异常: ${error}`);
		}
	};
}

class TestItemAction {
	static open = async (fileUri: vscode.Uri) => {
		try {
			const document = await vscode.workspace.openTextDocument(fileUri);
			await vscode.window.showTextDocument(document, {
				preview: false,
				viewColumn: vscode.ViewColumn.Active
			});
		} catch (error) {
			vscode.window.showErrorMessage(`无法打开文件 ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}

class FilesAsTestTaskAction {
	private testTaskProvider: TestTaskProvider;
	constructor (testTaskProvider: TestTaskProvider) {
		this.testTaskProvider = testTaskProvider;
	}

	public add = async () => {
		async (uri: vscode.Uri, selectedFiles: vscode.Uri[]) => {
			try {
				// 获取所有要添加的文件
				const files = selectedFiles && selectedFiles.length > 1 
					? selectedFiles 
					: uri ? [uri] : [];
				
				if (files.length === 0) {
					vscode.window.showWarningMessage('请先选择文件');
					return;
				}
	
				// 调用添加方法
				await this.testTaskProvider.addFilesAsTask(files);
			} catch (error) {
				vscode.window.showErrorMessage(`添加测试任务失败: ${error instanceof Error ? error.message : String(error)}`);
			}
		};
	};
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const testTaskProvider = new TestTaskProvider(context);
    vscode.window.registerTreeDataProvider('testTasks', testTaskProvider);
    
	const testTaskAction = new TestTaskAction(testTaskProvider);
	const executeCommand = vscode.commands.registerCommand('testTasks.executeTask', testTaskAction.executeCommand);
    const deleteCommand = vscode.commands.registerCommand('testTasks.deleteTask', testTaskAction.deleteTestTask);
	const editCommand = vscode.commands.registerCommand('testTasks.editTask', testTaskAction.editTask);
    context.subscriptions.push(executeCommand, editCommand, deleteCommand);

	const openFileCommand = vscode.commands.registerCommand('testItems.openFile', TestItemAction.open);
	context.subscriptions.push(openFileCommand);

	// 注册右键菜单命令
	const filesAsTestTaskAction = new FilesAsTestTaskAction(testTaskProvider);
	const fileCommand = vscode.commands.registerCommand('extension.addFilesAsTestTask', () => filesAsTestTaskAction.add);
    context.subscriptions.push(fileCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}

import vscode from "vscode";
import { TestTaskProvider } from "./testTask";


export class FilesAsTestTaskAction {
  private testTaskProvider: TestTaskProvider;
  constructor(testTaskProvider: TestTaskProvider) {
    this.testTaskProvider = testTaskProvider;
  }

  public add = async (uri: vscode.Uri, selectedFiles: vscode.Uri[]) => {
    try {
      // 获取所有要添加的文件
      const files =
        selectedFiles && selectedFiles.length > 1
          ? selectedFiles
          : uri
          ? [uri]
          : [];

      if (files.length === 0) {
        vscode.window.showWarningMessage("请先选择文件");
        return;
      }

      // 调用添加方法
      await this.testTaskProvider.addFilesAsTask(files);
    } catch (error) {
      vscode.window.showErrorMessage(
        `添加测试任务失败: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };
}


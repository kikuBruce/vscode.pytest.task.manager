import * as fs from "fs";
import * as path from "path";
import { TestTaskProvider } from "./extension";

class TestResultWatcher {
  private watcher: fs.FSWatcher | undefined;
  private currentSessionDir: string | null = null;
  private taskLabel: string;

  constructor(taskLabel: string, private testTaskProvider: TestTaskProvider) {
    this.taskLabel = taskLabel;
    this.watcher = undefined;
  }

  public watchTestResults(workspaceRoot: string) {
    const reportDir = path.join(workspaceRoot, "report");
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir);
    }

    // 先停止现有的监听
    if (this.watcher) {
      this.watcher.close();
    }

    // 创建目录监听
    this.watcher = fs.watch(reportDir, (eventType, filename) => {
      if (eventType === "rename" && !this.currentSessionDir) {
        // 获取最新的测试会话目录
        const sessions = fs
          .readdirSync(reportDir)
          .filter((f) => fs.statSync(path.join(reportDir, f)).isDirectory())
          .sort()
          .reverse();

        if (sessions.length > 0) {
          this.currentSessionDir = path.join(reportDir, sessions[0]);
          console.log("最新的测试会话目录:", this.currentSessionDir);
          this.watchSessionDir(this.currentSessionDir);
        }
      }
    });
  }

  private watchSessionDir(sessionDir: string) {
    // 监听测试结果文件变化
    fs.watch(sessionDir, (eventType, filename) => {
      console.log("测试结果文件变化:", eventType, filename);
      if (eventType === "rename" && filename && filename.endsWith(".json")) {
        const filePath = path.join(sessionDir, filename);
        this.processTestResultFile(filePath);
      }
    });

    // 处理已经存在的测试结果文件
    fs.readdirSync(sessionDir)
      .filter((f) => f.endsWith(".json"))
      .forEach((f) => this.processTestResultFile(path.join(sessionDir, f)));
  }

  private processTestResultFile(filePath: string) {
    try {
      const data = fs.readFileSync(filePath, "utf8");
      const result = JSON.parse(data);
      result.taskLabel = this.taskLabel;
      this.testTaskProvider.updateTestStatus(this.taskLabel, result.nodeid, result.outcome);
    } catch (err) {
      console.error("处理测试结果文件失败:", err);
    }
  }

  public dispose() {
    if (this.watcher) {
      this.watcher.close();
    }
  }
}

export default TestResultWatcher;

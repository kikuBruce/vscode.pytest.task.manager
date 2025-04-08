import json
import os
import sys
import pytest
from typing import Dict, Any, Optional

class VSCodePytestPlugin:
    def __init__(self):
        self.results = []
        self.current_test = None
    
    @pytest.hookimpl(tryfirst=True)
    def pytest_runtest_protocol(self, item, nextitem):
        """在测试开始前记录当前测试信息"""
        self.current_test = {
            "nodeid": item.nodeid,
            "file": str(item.fspath),
            "status": "running"
        }
        self._send_update()
    
    @pytest.hookimpl(hookwrapper=True)
    def pytest_runtest_makereport(self, item, call):
        """捕获测试结果"""
        outcome = yield
        report = outcome.get_result()
        
        if report.when == "call":
            status = "passed" if report.passed else "failed"
            if hasattr(report, "wasxfail"):
                status = "skipped"
            
            self.current_test.update({
                "status": status,
                "duration": report.duration,
                "message": str(report.longrepr) if report.failed else None,
                "when": report.when
            })
            self._send_update()
    
    def _send_update(self):
        """将结果发送到VS Code扩展"""
        if self.current_test:
            # 通过标准输出与Node.js进程通信
            print(f"VSCODE_PYTEST_UPDATE:{json.dumps(self.current_test)}")
            sys.stdout.flush()

def pytest_configure(config):
    """注册插件"""
    config.pluginmanager.register(VSCodePytestPlugin(), "vscode_pytest_plugin")
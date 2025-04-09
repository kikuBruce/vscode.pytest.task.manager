import json
import time
from datetime import datetime
from pytest import hookimpl


_report_dir = None
_session_start = None


def pytest_configure(config):
    """ pytest config"""
    print("🌈 wally.vscode.plugin loaded...")
    global _report_dir, _session_start

    _report_dir = config.inipath.parent / 'report'
    _report_dir.mkdir(exist_ok=True)
    _session_start = _report_dir / datetime.now().strftime('%Y%m%d_%H%M%S')
    _session_start.mkdir(exist_ok=True)
    print(f"🌈 Report dir: {_session_start}")


@hookimpl
def pytest_runtest_logreport(report):
    """ report hook"""
    if report.when == 'call':  # 只记录测试执行阶段的结果
        result = {
            "nodeid": report.nodeid,
            "outcome": report.outcome,
            "duration": report.duration,
            "when": report.when,
            "timestamp": time.time()
        }

        # 使用测试用例ID作为文件名
        filename = report.nodeid.replace("::", ".").replace("/", "-") + ".json"
        with open(_session_start / filename, 'w', encoding='utf-8') as f:
            json.dump(result, f)

import json
import time
import builtins
from datetime import datetime
from pytest import hookimpl


_report_dir = None
_session_start = None
__print = builtins.print


def pytest_configure(config):
    """ pytest config"""
    print("🌈 wally.vscode.plugin loaded...")
    global _report_dir, _session_start

    _report_dir = config.inipath.parent / 'report'
    _report_dir.mkdir(exist_ok=True)
    _session_start = _report_dir / datetime.now().strftime('%Y%m%d_%H%M%S')
    _session_start.mkdir(exist_ok=True)
    print(f"🌈 Report dir: {_session_start}")

    try:
        print("🌈 Caps logging output..")

        # logging
        import logging

        file_handler = logging.FileHandler(_session_start / 'case.log')
        logger = logging.getLogger()

        # loguru
        print("🌈 Caps loguru output...")
        from loguru import logger

        logger.add(file_handler)

        # print
        logger = logging.Logger('vscode.pytest.manager', level='DEBUG')
        file_handler = logging.FileHandler(_session_start / 'case.log')
        logger.addHandler(file_handler)

        def _print(*msgs):
            try:
                msg = ' '.join([msg if isinstance(msg, str)
                               else str(msg) for msg in msgs])
                logger.debug(msg)
                __print(*msgs)
            except Exception:
                print(*msg)

        print("🌈 Caps print output...")
        builtins.print = _print

    except Exception:
        print("💢 Set logging file config error...")


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

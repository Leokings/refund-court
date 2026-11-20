import os
import subprocess
import sys
from pathlib import Path

env={**os.environ,'PYTHONIOENCODING':'utf-8'}
for path in Path('contracts').glob('*.py'):
    result=subprocess.run([sys.executable,'-m','genvm_linter.cli','check',str(path),'--json'],env=env)
    if result.returncode: raise SystemExit(result.returncode)

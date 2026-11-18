#!/usr/bin/env python3
"""Check release prerequisites without printing secrets or building an artifact."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
failures = []

def check(label, ok, guidance):
    print(f"{'OK' if ok else 'MISSING'}: {label}" + ('' if ok else f' — {guidance}'))
    if not ok:
        failures.append(label)

java = shutil.which('java')
check('Java', bool(java), 'Install JDK 17 and set JAVA_HOME.')
if java:
    javac = shutil.which('javac') or (str(Path(os.environ['JAVA_HOME']) / 'bin/javac') if os.environ.get('JAVA_HOME') else '')
    check('Java compiler', bool(javac and Path(javac).is_file()), 'Install a JDK, not only a runtime.')
gradle = shutil.which('gradle')
check('Gradle', bool(gradle), 'Install Gradle 8.13 or add it to PATH.')
sdk = Path(os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or '/nonexistent')
for name, path in [('Android SDK 36', 'platforms/android-36/android.jar'), ('NDK 27.2.12479018', 'ndk/27.2.12479018/source.properties'), ('CMake 3.22.1', 'cmake/3.22.1/bin/cmake')]:
    check(name, (sdk / path).is_file(), 'Install the required Android SDK component.')
config = root / 'app/google-services.json'
firebase_ok = False
try:
    data = json.loads(config.read_text())
    project = data['project_info']['project_id']
    clients = data['client']
    firebase_ok = project != 'field-assistant-test-only' and any(c['client_info']['android_client_info']['package_name'] == 'kr.fieldassistant.prototype.stable' for c in clients)
except (OSError, ValueError, KeyError, TypeError):
    pass
check('Firebase configuration for release package', firebase_ok, 'Provide the verified production google-services.json; test configuration is not suitable.')
model = root / 'app/src/main/assets/ggml-small-q5_1.bin'
expected = 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb'
digest = hashlib.sha256()
if model.is_file():
    with model.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
check('Offline speech model and checksum', model.is_file() and digest.hexdigest() == expected, 'Restore the model and verify its checksum.')
native = root / 'vendor/whisper/CMakeLists.txt'
check('Whisper native source', native.is_file(), 'Restore the pinned whisper.cpp v1.7.6 source.')
if native.is_file():
    result = subprocess.run(['git', '-C', str(native.parent), 'rev-parse', 'HEAD'], capture_output=True, text=True)
    check('Whisper source revision', result.returncode == 0 and result.stdout.strip() == 'a8d002cfd879315632a579e73f0148d06959de36', 'Use the pinned revision.')
keystore = os.environ.get('ASSISTANT_KEYSTORE_PATH', '')
check('Upload signing key path', bool(keystore and Path(keystore).is_file()), 'Set ASSISTANT_KEYSTORE_PATH to the existing private key; never commit it.')
print('\n' + ('Ready for further release verification.' if not failures else f'{len(failures)} prerequisite(s) need attention.'))
print('A ready check does not verify credentials, certificate identity, version code, build success, or Google Play acceptance.')
raise SystemExit(1 if failures else 0)

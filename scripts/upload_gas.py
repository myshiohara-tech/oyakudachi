#!/usr/bin/env python3
"""Re-upload Code.gs to an existing Apps Script project.

Reads the scriptId from scripts/last_provision.json (created by provision_sheet.py),
or use SCRIPT_ID env var to override.
"""
import json
import os
import sys
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent
DESKTOP_CLAUDE = Path('/Users/shioharayoshiyuki/Desktop/★Claude')
CODE_GS = PROJECT_ROOT / 'phrases-static' / 'google-apps-script' / 'Code.gs'
TOKEN_FILE = HERE / '.token.json'
LAST = HERE / 'last_provision.json'

SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/script.projects',
]


def find_client_secret() -> Path:
    candidates = sorted(DESKTOP_CLAUDE.glob('client_secret_*.json'))
    if not candidates:
        sys.exit(f'❌ client_secret_*.json not found in {DESKTOP_CLAUDE}')
    return candidates[0]


def get_credentials() -> Credentials:
    creds: Credentials | None = None
    if TOKEN_FILE.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        except Exception:
            creds = None
    if creds and creds.valid:
        return creds
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_FILE.write_text(creds.to_json())
        return creds
    cs = find_client_secret()
    flow = InstalledAppFlow.from_client_secrets_file(str(cs), SCOPES)
    creds = flow.run_local_server(port=8765, prompt='consent', open_browser=True)
    TOKEN_FILE.write_text(creds.to_json())
    return creds


def main() -> int:
    script_id = os.environ.get('SCRIPT_ID', '').strip()
    if not script_id:
        if not LAST.exists():
            sys.exit('❌ scriptId not provided. Set SCRIPT_ID or run provision_sheet.py first.')
        script_id = json.loads(LAST.read_text())['scriptId']
    code_gs = CODE_GS.read_text(encoding='utf-8')

    creds = get_credentials()
    script = build('script', 'v1', credentials=creds, cache_discovery=False)

    # Preserve existing manifest if present; otherwise generate one.
    appsscript_json = json.dumps({
        'timeZone': 'Asia/Tokyo',
        'dependencies': {},
        'exceptionLogging': 'STACKDRIVER',
        'runtimeVersion': 'V8',
        'webapp': {
            'access': 'ANYONE_ANONYMOUS',
            'executeAs': 'USER_DEPLOYING',
        },
    }, ensure_ascii=False)

    files = [
        {'name': 'appsscript', 'type': 'JSON', 'source': appsscript_json},
        {'name': 'Code', 'type': 'SERVER_JS', 'source': code_gs},
    ]
    print(f'📤 Updating script project {script_id} ...')
    script.projects().updateContent(scriptId=script_id, body={'files': files}).execute()
    print('✅ Code uploaded')
    print(f'🔗 https://script.google.com/d/{script_id}/edit')
    print('\n⚠️  Web App デプロイは手動で「デプロイの管理 → 編集 → バージョンを新規作成」が必要です。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

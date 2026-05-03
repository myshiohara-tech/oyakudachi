#!/usr/bin/env python3
"""
Provision a Google Spreadsheet bound to an Apps Script project for the
お役立ちフレーズ app.

Steps:
  1. OAuth (installed-app flow) using ~/Desktop/★Claude/client_secret_*.json
  2. Create a new Google Sheet via Drive API
  3. Create a bound Apps Script project (parentId = sheet's file id)
  4. Upload Code.gs + appsscript.json via Apps Script API

Web App deployment must be done manually via the Apps Script UI
("Deploy → New deployment → Web app"). This script prints the URL of the
script editor at the end so you can finish deployment in two clicks.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# ---- Paths ----
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent  # phrases-static / scripts / .. / ..
PROJECT_ROOT = ROOT  # 1.お役立ちフレーズ
DESKTOP_CLAUDE = Path('/Users/shioharayoshiyuki/Desktop/★Claude')
CODE_GS = PROJECT_ROOT / 'phrases-static' / 'google-apps-script' / 'Code.gs'
TOKEN_FILE = HERE / '.token.json'

# ---- Scopes ----
SCOPES = [
    'https://www.googleapis.com/auth/drive.file',          # create / open files we own
    'https://www.googleapis.com/auth/spreadsheets',        # rename / read sheets
    'https://www.googleapis.com/auth/script.projects',     # create + update GAS projects
]

SHEET_TITLE_DEFAULT = 'お役立ちフレーズ_学習ログ'


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
        try:
            creds.refresh(Request())
            TOKEN_FILE.write_text(creds.to_json())
            return creds
        except Exception:
            pass

    cs = find_client_secret()
    flow = InstalledAppFlow.from_client_secrets_file(str(cs), SCOPES)
    # Use a fixed loopback port so the OAuth client redirect_uri matches
    creds = flow.run_local_server(
        port=8765,
        prompt='consent',
        authorization_prompt_message='\n🔐 ブラウザでGoogleにログインして許可してください…\n',
        success_message='OAuth認証が完了しました。このタブを閉じて、ターミナルに戻ってください。',
        open_browser=True,
    )
    TOKEN_FILE.write_text(creds.to_json())
    print(f'✅ Credentials saved to {TOKEN_FILE}')
    return creds


def create_spreadsheet(creds, title: str) -> tuple[str, str]:
    """Create a new spreadsheet and return (fileId, url)."""
    sheets = build('sheets', 'v4', credentials=creds, cache_discovery=False)
    res = sheets.spreadsheets().create(
        body={'properties': {'title': title}}, fields='spreadsheetId,spreadsheetUrl'
    ).execute()
    return res['spreadsheetId'], res['spreadsheetUrl']


def create_apps_script_project(creds, title: str, parent_id: str) -> str:
    """Create a new Apps Script project bound to the given parent (sheet)."""
    script = build('script', 'v1', credentials=creds, cache_discovery=False)
    res = script.projects().create(body={'title': title, 'parentId': parent_id}).execute()
    return res['scriptId']


def upload_files(creds, script_id: str, code_gs: str) -> None:
    """Upload Code.gs and appsscript.json into the script project."""
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
    script = build('script', 'v1', credentials=creds, cache_discovery=False)
    script.projects().updateContent(
        scriptId=script_id, body={'files': files}
    ).execute()


def main() -> int:
    if not CODE_GS.exists():
        sys.exit(f'❌ Code.gs not found at {CODE_GS}')
    code_gs = CODE_GS.read_text(encoding='utf-8')

    print('🔐 Authenticating with Google...')
    creds = get_credentials()

    title = os.environ.get('SHEET_TITLE', SHEET_TITLE_DEFAULT)
    existing_id = os.environ.get('SHEET_ID', '').strip()

    if existing_id:
        sheet_id = existing_id
        sheet_url = f'https://docs.google.com/spreadsheets/d/{sheet_id}/edit'
        print(f'📊 Using existing spreadsheet: {sheet_id}')
    else:
        print(f'📊 Creating spreadsheet: {title}')
        sheet_id, sheet_url = create_spreadsheet(creds, title)
        print(f'   sheetId = {sheet_id}')
        print(f'   url     = {sheet_url}')

    print('📜 Creating bound Apps Script project...')
    try:
        script_id = create_apps_script_project(creds, f'{title} (logger)', parent_id=sheet_id)
    except HttpError as e:
        print('❌ Apps Script API call failed.')
        print('   Most likely: the Apps Script API is not enabled for this account.')
        print('   → Open https://script.google.com/home/usersettings and turn it ON, then re-run.')
        print(f'   error: {e}')
        return 2
    print(f'   scriptId = {script_id}')

    print('📤 Uploading Code.gs...')
    upload_files(creds, script_id, code_gs)
    print('✅ Code uploaded')

    script_editor_url = f'https://script.google.com/d/{script_id}/edit'
    summary = {
        'spreadsheetId': sheet_id,
        'spreadsheetUrl': sheet_url,
        'scriptId': script_id,
        'scriptEditorUrl': script_editor_url,
    }
    summary_path = HERE / 'last_provision.json'
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2))

    print('\n========================================')
    print('🎉 セットアップ準備完了')
    print('========================================')
    print(f'📊 スプレッドシート : {sheet_url}')
    print(f'📜 Apps Scriptエディタ : {script_editor_url}')
    print(f'📝 概要 : {summary_path}')
    print('\n次のステップ（Webアプリのデプロイは手動）:')
    print('  1. 上の Apps Script エディタURLを開く')
    print('  2. 右上の「デプロイ → 新しいデプロイ」')
    print('  3. ⚙️ → ウェブアプリ')
    print('  4. 実行: 自分 / アクセス: 全員')
    print('  5. デプロイ → 表示されるURL（…/exec）をコピー')
    print('  6. お役立ちフレーズアプリの 設定 → 記録先 にURLを貼り付け')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

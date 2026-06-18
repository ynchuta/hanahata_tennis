import fs from 'fs';
import path from 'path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_PATH = process.env.GITHUB_PATH || 'settlement_status.json';

// 必要な環境変数が揃っていない場合はモックモードで動作する
export const USE_MOCK =
  process.env.USE_MOCK === 'true' ||
  !GITHUB_TOKEN ||
  !GITHUB_REPO_OWNER ||
  !GITHUB_REPO_NAME;

const mockGithubOutputPath = path.join(process.cwd(), 'mock-data', 'settlement_status.json');

export interface SettlementStatusPublic {
  updatedAt?: string;
  facilities?: { name: string; allowChildRate: boolean }[];
  reservers?: { name: string }[];
  reservations?: object[];
  // 旧形式との互換性のため any[]も許容
  [key: string]: unknown;
}

/**
 * 精算ステータス・施設・保護者情報を GitHub リポジトリ（またはモック）に保存する
 * 金額や口座情報などの個人情報は含まないように設計
 */
export async function syncSettlementStatusToGithub(data: SettlementStatusPublic | SettlementStatusPublic[]): Promise<boolean> {
  const contentStr = JSON.stringify(data, null, 2);

  if (USE_MOCK) {
    try {
      const dir = path.dirname(mockGithubOutputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(mockGithubOutputPath, contentStr, 'utf-8');
      console.log(`[Mock GitHub Sync] Successfully wrote to ${mockGithubOutputPath}`);
      return true;
    } catch (error) {
      console.error('[Mock GitHub Sync] Error writing to file:', error);
      return false;
    }
  }

  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${GITHUB_PATH}`;
    const headers = {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Tennis-Nighter-App',
    };

    // 1. 既存のファイル情報を取得して sha を得る
    let sha: string | undefined;
    try {
      const getRes = await fetch(`${url}?ref=${GITHUB_BRANCH}`, { headers });
      if (getRes.status === 200) {
        const fileInfo = await getRes.json();
        sha = fileInfo.sha;
      }
    } catch (error) {
      // ファイルが存在しない場合は新規作成するため sha は undefined のままにする
      console.log('File does not exist on GitHub yet, will create new one.');
    }

    // 2. ファイルをコミット
    const base64Content = Buffer.from(contentStr).toString('base64');
    const body = {
      message: 'chore: update settlement status [skip ci]',
      content: base64Content,
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    };

    const putRes = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });

    if (putRes.status === 200 || putRes.status === 201) {
      console.log('Successfully synced to GitHub.');
      return true;
    } else {
      const errText = await putRes.text();
      console.error(`Failed to sync to GitHub. Status: ${putRes.status}. Error: ${errText}`);
      return false;
    }
  } catch (error) {
    console.error('Error syncing to GitHub:', error);
    return false;
  }
}

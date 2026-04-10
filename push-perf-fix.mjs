// WISHES v2 - Map Performance Fix Push Script
// 지도 API 경량화 (이미지 조인 제거) 배포
import { readFileSync } from 'fs';
import { request } from 'https';

const TOKEN = '***REMOVED***';
const OWNER = 'wishes-hyundo';
const REPO = 'WISHES';
const BRANCH = 'v2';

const FILES = [
  'src/app/api/listings/map/route.ts'
];

function ghApi(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = request({
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}${path}`,
      method,
      headers: {
        'Authorization': `token ${TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'WISHES-Push-Script',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch(e) { resolve(Buffer.concat(chunks).toString()); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🚀 WISHES v2 Map Performance Fix Push\n');

  console.log('📌 v2 브랜치 정보 조회...');
  const ref = await ghApi('GET', `/git/refs/heads/${BRANCH}`);
  const parentSha = ref.object.sha;
  console.log(`   현재 v2 SHA: ${parentSha}`);

  const commit = await ghApi('GET', `/git/commits/${parentSha}`);
  const baseTreeSha = commit.tree.sha;
  console.log(`   기본 트리: ${baseTreeSha}\n`);

  const treeEntries = [];
  for (const filePath of FILES) {
    try {
      const content = readFileSync(filePath);
      const b64 = content.toString('base64');
      const sizeKB = Math.round(content.length / 1024);
      process.stdout.write(`📄 ${filePath} (${sizeKB}KB)... `);

      const blob = await ghApi('POST', '/git/blobs', {
        content: b64,
        encoding: 'base64'
      });

      if (blob.sha) {
        treeEntries.push({
          path: filePath,
          mode: '100644',
          type: 'blob',
          sha: blob.sha
        });
        console.log(`✅ ${blob.sha.substring(0, 8)}`);
      } else {
        console.log(`❌ 실패: ${JSON.stringify(blob).substring(0, 100)}`);
      }
    } catch (e) {
      console.log(`⚠️ 건너뜀: ${e.message}`);
    }
  }

  if (treeEntries.length === 0) {
    console.log('\n❌ 푸시할 파일이 없습니다!');
    process.exit(1);
  }

  console.log(`\n🌳 새 트리 생성 (${treeEntries.length}개 파일)...`);
  const newTree = await ghApi('POST', '/git/trees', {
    base_tree: baseTreeSha,
    tree: treeEntries
  });
  console.log(`   트리 SHA: ${newTree.sha}`);

  console.log('💾 커밋 생성...');
  const newCommit = await ghApi('POST', '/git/commits', {
    message: 'perf: 지도 API 경량화 - listing_images 조인 제거 + DB 인덱스 적용으로 지도 로딩 속도 대폭 개선',
    tree: newTree.sha,
    parents: [parentSha]
  });
  console.log(`   커밋 SHA: ${newCommit.sha}`);

  console.log('🔄 v2 브랜치 업데이트...');
  const updatedRef = await ghApi('PATCH', `/git/refs/heads/${BRANCH}`, {
    sha: newCommit.sha,
    force: true
  });

  if (updatedRef.object) {
    console.log(`\n✅ 푸시 완료! v2 → ${updatedRef.object.sha}`);
    console.log('🎉 Vercel 배포가 자동으로 시작됩니다!\n');
  } else {
    console.log(`\n❌ ref 업데이트 실패: ${JSON.stringify(updatedRef)}`);
  }
}

main().catch(e => {
  console.error('❌ 에러:', e.message);
  process.exit(1);
});

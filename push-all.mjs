// WISHES v2 - GitHub Push Script
// 모든 수정된 파일을 GitHub API로 직접 푸시합니다
import { readFileSync } from 'fs';
import { request } from 'https';

const TOKEN = '***REMOVED***';
const OWNER = 'wishes-hyundo';
const REPO = 'WISHES';
const BRANCH = 'v2';

const FILES = [
  'src/lib/formatFloor.ts',
  'src/components/HomeListingCard.tsx',
  'src/components/ListingCard.tsx',
  'src/components/MapListingPanel.tsx',
  'src/app/admin/page.tsx',
  'src/app/compare/page.tsx',
  'src/app/listings/[id]/ListingDetailClient.tsx',
  'public/wishes_logo_transparent.png'
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
  console.log('🚀 WISHES v2 GitHub Push 시작\n');

  // 1. v2 브랜치 현재 SHA 조회
  console.log('📌 v2 브랜치 정보 조회...');
  const ref = await ghApi('GET', `/git/refs/heads/${BRANCH}`);
  const parentSha = ref.object.sha;
  console.log(`   현재 v2 SHA: ${parentSha}`);

  // 2. 부모 커밋의 트리 조회
  const commit = await ghApi('GET', `/git/commits/${parentSha}`);
  const baseTreeSha = commit.tree.sha;
  console.log(`   기본 트리: ${baseTreeSha}\n`);

  // 3. 각 파일의 blob 생성
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

  // 4. 새 트리 생성
  console.log(`\n🌳 새 트리 생성 (${treeEntries.length}개 파일)...`);
  const newTree = await ghApi('POST', '/git/trees', {
    base_tree: baseTreeSha,
    tree: treeEntries
  });
  console.log(`   트리 SHA: ${newTree.sha}`);

  // 5. 커밋 생성
  console.log('💾 커밋 생성...');
  const newCommit = await ghApi('POST', '/git/commits', {
    message: 'feat: B층수 한글 변환 + 관리비 버그 수정 + 투명 로고 + 컴포넌트 업데이트',
    tree: newTree.sha,
    parents: [parentSha]
  });
  console.log(`   커밋 SHA: ${newCommit.sha}`);

  // 6. v2 브랜치 ref 업데이트 (force)
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

import { NextResponse } from 'next/server';

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>주소 검색 - 위시스부동산</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
  .header { background: #2563eb; color: white; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; }
  .header h1 { font-size: 16px; font-weight: 600; }
  .header .close-btn { background: rgba(255,255,255,0.2); border: none; color: white; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; }
  .header .close-btn:hover { background: rgba(255,255,255,0.3); }
  #layer { width: 100%; height: calc(100vh - 50px); }
</style>
</head>
<body>
<div class="header">
  <h1>🔍 주소 검색</h1>
  <button class="close-btn" onclick="window.close()">&times;</button>
</div>
<div id="layer"></div>
<script src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"><\/script>
<script>
  new daum.Postcode({
    oncomplete: function(data) {
      var result = {
        type: 'address-selected',
        roadAddress: data.roadAddress,
        jibunAddress: data.jibunAddress,
        bname: data.bname,
        buildingName: data.buildingName,
        zonecode: data.zonecode
      };
      if (window.opener) {
        window.opener.postMessage(result, '*');
        window.close();
      }
    },
    width: '100%',
    height: '100%'
  }).embed(document.getElementById('layer'));
<\/script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

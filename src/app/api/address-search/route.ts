import { NextResponse } from 'next/server';

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>주소 검색</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .header {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: white;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { font-size: 18px; font-weight: 700; }
    .close-btn {
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .close-btn:hover { background: rgba(255,255,255,0.3); }
    #postcode-container { width: 100%; height: calc(100vh - 60px); }
  </style>
</head>
<body>
  <div class="header">
    <h1>주소 검색</h1>
    <button class="close-btn" onclick="window.close()">&times;</button>
  </div>
  <div id="postcode-container"></div>
  <script src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"><\/script>
  <script>
    new daum.Postcode({
      oncomplete: function(data) {
        if (window.opener) {
          window.opener.postMessage({
            type: 'ADDRESS_SELECTED',
            roadAddress: data.roadAddress || '',
            jibunAddress: data.jibunAddress || '',
            bname: data.bname || '',
            buildingName: data.buildingName || '',
            zonecode: data.zonecode || '',
            autoJibunAddress: data.autoJibunAddress || ''
          }, '*');
        }
        window.close();
      },
      width: '100%',
      height: '100%'
    }).embed(document.getElementById('postcode-container'));
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

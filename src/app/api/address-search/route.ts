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
  #layer { width: 100%; height: 100vh; }
</style>
</head>
<body>
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
      window.parent.postMessage(result, '*');
    },
    width: '100%',
    height: '100%'
  }).embed(document.getElementById('layer'));
<\/script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

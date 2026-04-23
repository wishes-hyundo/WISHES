// page-auth.js — 페이지 컨텍스트에서 실행되어 sessionStorage 를 읽고 postMessage 로 전달
// L-sec154 (2026-04-23): admin_password 브릿지 필드(hasAdminPw/adminPw) 전면 제거.
//   public/search/page-auth.js 와 동일한 변경. 확장 빌드 소스 일관성을 위해 같이 수정.
(function(){
  var token = sessionStorage.getItem("ws_token");
  var user = sessionStorage.getItem("ws_user");
  var loginTime = sessionStorage.getItem("ws_login_time");
  window.postMessage({
    type: "WS_PAGE_AUTH_RESULT",
    hasToken: !!token,
    token: token || "",
    user: user || "",
    loginTime: loginTime || ""
  }, "*");
})();

// page-auth.js — 페이지 컨텍스트에서 실행되어 sessionStorage 를 읽고 postMessage 로 전달
// L-sec154 (2026-04-23): admin_password 브릿지 필드(hasAdminPw/adminPw) 전면 제거.
//   과거엔 localStorage.admin_password 를 읽어 확장 content script 에 넘기고,
//   확장은 서버 검증 없이 이 값만으로 superadmin 통과시키는 쪽문이었다.
//   ws_token(Supabase JWT) 만 브릿지해서 /api/chrome-ext/verify 로 검증하도록 축소.
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

// page-auth.js — 페이지 컨텍스트에서 실행되어 sessionStorage/localStorage를 읽고 postMessage로 전달
(function(){
  var token = sessionStorage.getItem("ws_token");
  var user = sessionStorage.getItem("ws_user");
  var loginTime = sessionStorage.getItem("ws_login_time");
  var adminPw = localStorage.getItem("admin_password");
  window.postMessage({
    type: "WS_PAGE_AUTH_RESULT",
    hasToken: !!token,
    token: token || "",
    user: user || "",
    loginTime: loginTime || "",
    hasAdminPw: !!adminPw,
    adminPw: adminPw || ""
  }, "*");
})();

// ============================================================
// L-sec53 (2026-04-22): deprecated legacy auth bridge.
//   기존 스크립트는 localStorage['admin_password'] === '<legacy>' 일 때
//   sessionStorage['ws_token'] = 'admin_bridge_' + Date.now() 을 위조 발급.
//   - 평문 비밀번호가 정적 JS 로 공개 서빙 (curl /admin/auth-bridge.js → 노출)
//   - admin_bridge_ 패턴 토큰은 L-sec1 에서 서버측에서 거부
// 따라서 기능은 이미 죽어있고 남는 건 정보 누출뿐. 전면 무력화.
//   필요한 사용자는 /admin/login 경로로 정식 Supabase 로그인 진행.
// ============================================================
(function(){
  try {
    if (localStorage.getItem('admin_password')) {
      localStorage.removeItem('admin_password');
    }
  } catch (e) {}
})();

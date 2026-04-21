// OLD Auth Bridge - auto redirect to /admin when old auth exists
(function() {
    var p = localStorage.getItem("admin_password");
    if (p === "wishes2026" && !sessionStorage.getItem("ws_token")) {
          sessionStorage.setItem("ws_token", "admin_bridge_" + Date.now());
          sessionStorage.setItem("ws_user", JSON.stringify({
                  email: "wishes@wishes.co.kr",
                  role: "superadmin",
                  name: "WISHES Admin"
          }));
          sessionStorage.setItem("ws_login_time", Date.now().toString());
          window.location.replace("/admin");
    }
})();

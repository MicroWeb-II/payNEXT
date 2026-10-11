
const appView = document.getElementById("app-view");
const logoutButton = document.getElementById("logout-button");

const routes = {
  "/login": {
    render: renderLogin,
    init: initLogin,
  },
  "/register": {
    render: renderRegister,
    init: initRegister,
  },
  "/dashboard": {
    render: renderDashboard,
    init: initDashboard,
    protected: true,
  },
};

function updateNavigation() {
  const loggedIn = Auth.isLoggedIn();

  logoutButton.classList.toggle("hidden", !loggedIn);

  document.querySelectorAll("[data-nav]").forEach((link) => {
    const isCurrent = link.dataset.nav ===
      window.location.hash.replace(/^#\//, "");

    link.setAttribute("aria-current", isCurrent ? "page" : "false");
  });
}

async function navigate() {
  let path = window.location.hash.slice(1) || "/login";

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  const route = routes[path];

  if (!route) {
    window.location.hash = "#/login";
    return;
  }

  if (route.protected && !Auth.isLoggedIn()) {
    window.location.hash = "#/login";
    return;
  }

  appView.innerHTML = route.render();
  updateNavigation();

  if (route.init) {
    await route.init();
  }

  updateNavigation();
}

logoutButton.addEventListener("click", () => {
  Auth.logout();
});

window.addEventListener("hashchange", navigate);

navigate();

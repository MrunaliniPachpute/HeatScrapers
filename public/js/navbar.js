document.addEventListener("DOMContentLoaded", () => {
    const currentPath = window.location.pathname;
    document.querySelectorAll(".navbar-nav .nav-item").forEach((item) => {
      const link = item.querySelector(".nav-link");
      if (link && link.getAttribute("href") === currentPath) {
        item.classList.add("active");
      }
    });
  });
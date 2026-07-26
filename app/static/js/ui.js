document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.querySelector("#login-form");
  const registerForm = document.querySelector("#register-form");
  const alertContainer = document.querySelector("#alert-container");

  function showAlert(message, type = "error") {
    if (!alertContainer) return;
    alertContainer.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const payload = {
        username: formData.get("username"),
        password: formData.get("password"),
      };
      try {
        const response = await fetch("/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) {
          showAlert(result.error || "Login failed", "error");
          return;
        }
        showAlert("Login successful. Redirecting…", "success");
        localStorage.setItem("gt_token", result.token);
        window.location.href = "/dashboard";
      } catch (err) {
        showAlert("Unable to complete login.", "error");
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      const payload = {
        username: formData.get("username"),
        password: formData.get("password"),
        preferences: formData.get("preferences")
          ? formData.get("preferences").split(",").map((item) => item.trim())
          : [],
      };
      try {
        const response = await fetch("/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) {
          showAlert(result.error || "Registration failed", "error");
          return;
        }
        showAlert("Account created. Redirecting to login…", "success");
        setTimeout(() => {
          window.location.href = "/login-ui";
        }, 1000);
      } catch (err) {
        showAlert("Unable to complete registration.", "error");
      }
    });
  }
});

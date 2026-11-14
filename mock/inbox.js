(function () {
  "use strict";

  var threads = {
    jordan: { title: "Jordan Lee · +1 (617) 555-0148", template: "tpl-jordan" },
    sam: { title: "Sam Patel · +1 (617) 555-0194", template: "tpl-sam" }
  };

  function show(id) {
    var thread = threads[id];
    if (!thread) return;
    document.querySelectorAll("[data-ysr-thread]").forEach(function (button) {
      var on = button.getAttribute("data-thread-id") === id;
      button.classList.toggle("active", on);
      if (on) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
    document.querySelector("[data-ysr-thread-title]").textContent = thread.title;
    var body = document.querySelector("[data-ysr-messages]");
    body.replaceChildren();
    body.appendChild(document.getElementById(thread.template).content.cloneNode(true));
  }

  document.querySelectorAll("[data-ysr-thread]").forEach(function (button) {
    button.addEventListener("click", function () {
      show(button.getAttribute("data-thread-id"));
    });
  });
})();

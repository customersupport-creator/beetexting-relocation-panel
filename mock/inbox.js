(function () {
  "use strict";

  var threads = {
    jordan: {
      name: "Jordan Lee",
      phone: "+1 (617) 555-0148",
      tel: "tel:+16175550148",
      template: "tpl-jordan"
    },
    sam: {
      name: "Sam Patel",
      phone: "+1 (617) 555-0194",
      tel: "tel:+16175550194",
      template: "tpl-sam"
    }
  };

  function show(id) {
    var thread = threads[id];
    if (!thread) return;
    document.querySelectorAll(".conversation-card").forEach(function (card) {
      card.classList.toggle("active", card.getAttribute("data-thread-id") === id);
    });
    document.getElementById("contact-title-name").textContent = thread.name;
    document.getElementById("contact-phone-number").textContent = thread.phone;
    var link = document.getElementById("contact-phone-link");
    link.setAttribute("href", thread.tel);
    link.textContent = thread.phone;
    var messages = document.querySelector("app-texting-scroller .messages-wrapper");
    messages.replaceChildren();
    messages.appendChild(document.getElementById(thread.template).content.cloneNode(true));
  }

  document.querySelectorAll(".conversation-card").forEach(function (card) {
    card.addEventListener("click", function () {
      show(card.getAttribute("data-thread-id"));
    });
  });
})();

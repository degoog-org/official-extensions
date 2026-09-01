(function () {
  var params = new URLSearchParams(window.location.search);
  if (params.get("q") || window.location.pathname !== "/") return;

  var main = document.getElementById("main-home");
  if (!main) return;

  var API = "/api/plugin/" + __PLUGIN_ID__;
  var state = { cards: [], pages: [], draft: null, page: "", pageName: "", error: "", timer: null };
  var root = null;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(className, label, onClick) {
    var node = el("button", className, label);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  function option(value, text) {
    var node = el("option", null, text);
    node.value = value;
    return node;
  }

  function isMobile() {
    return !window.matchMedia("(min-width: 768px)").matches;
  }

  function load(force) {
    return fetch(API + "/cards" + (force ? "?force=1" : "")).then(function (res) {
      return res.json();
    });
  }

  function save() {
    return fetch(API + "/layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: state.page,
        cards: state.draft.map(function (card) {
          return { key: card.key, visible: card.visible, span: card.span };
        }),
      }),
    });
  }

  function apply(data) {
    state.cards = data.cards || [];
    state.pages = data.pages || [];
    state.page = data.page || "";
    state.pageName = data.pageName || "";
    state.error = data.error || "";
  }

  function applyAndRender(data) {
    apply(data);
    render();
  }

  function selectPage(slug) {
    return fetch(API + "/page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: slug }),
    })
      .then(function () {
        return load(true);
      })
      .then(function (data) {
        state.draft = null;
        applyAndRender(data);
      });
  }

  function renderGrid() {
    var grid = el("div", "dyn-grid");
    var visible = state.cards.filter(function (card) {
      return card.visible;
    });
    if (visible.length === 0) {
      grid.appendChild(el("p", "dyn-empty", "Nothing picked yet. Use Customize to choose widgets."));
      return grid;
    }
    visible.forEach(function (card) {
      var holder = el("div", "dyn-slot");
      holder.dataset.span = card.span;
      holder.innerHTML = card.html;
      grid.appendChild(holder);
    });
    return grid;
  }

  function renderPickerRow(card, index) {
    var row = el("li", "dyn-pick" + (card.visible ? "" : " dyn-pick--off"));

    var toggle = el("label", "dyn-pick-toggle");
    var box = document.createElement("input");
    box.type = "checkbox";
    box.checked = card.visible;
    box.addEventListener("change", function () {
      card.visible = box.checked;
      refreshPicker();
    });
    toggle.appendChild(box);
    var text = el("span", "dyn-pick-text");
    text.appendChild(el("span", "dyn-pick-title", card.title));
    text.appendChild(el("span", "dyn-pick-type", card.type + (card.error ? " · error" : "")));
    toggle.appendChild(text);
    row.appendChild(toggle);

    var actions = el("div", "dyn-pick-actions");

    var span = button("dyn-btn dyn-btn--ghost", card.span === 2 ? "2x" : "1x", function () {
      card.span = card.span === 2 ? 1 : 2;
      refreshPicker();
    });
    span.title = "Card width";
    actions.appendChild(span);

    var up = button("dyn-btn dyn-btn--ghost", "↑", function () {
      move(index, index - 1);
    });
    up.title = "Move up";
    up.disabled = index === 0;
    actions.appendChild(up);

    var down = button("dyn-btn dyn-btn--ghost", "↓", function () {
      move(index, index + 1);
    });
    down.title = "Move down";
    down.disabled = index === state.draft.length - 1;
    actions.appendChild(down);

    row.appendChild(actions);
    return row;
  }

  function move(from, to) {
    if (to < 0 || to >= state.draft.length) return;
    var moved = state.draft.splice(from, 1)[0];
    state.draft.splice(to, 0, moved);
    refreshPicker();
  }

  function refreshPicker() {
    var list = root.querySelector(".dyn-pick-list");
    if (!list) return;
    list.innerHTML = "";
    state.draft.forEach(function (card, index) {
      list.appendChild(renderPickerRow(card, index));
    });
  }

  function renderPicker() {
    var panel = el("div", "dyn-picker");
    var head = el("div", "dyn-picker-head");
    head.appendChild(el("span", "dyn-picker-title", "Pick what matters"));
    head.appendChild(
      el("span", "dyn-picker-hint", "Toggle, resize and reorder the widgets pulled from Dynacat."),
    );
    panel.appendChild(head);
    panel.appendChild(el("ul", "dyn-pick-list"));

    var footer = el("div", "dyn-picker-foot");
    var cancel = button("dyn-btn dyn-btn--ghost", "Cancel", function () {
      state.draft = null;
      render();
    });
    var confirm = button("dyn-btn dyn-btn--primary", "Save", function () {
      confirm.disabled = true;
      save()
        .then(function () {
          return load(false);
        })
        .then(function (data) {
          state.draft = null;
          applyAndRender(data);
        })
        .catch(function () {
          confirm.disabled = false;
        });
    });
    footer.appendChild(cancel);
    footer.appendChild(confirm);
    panel.appendChild(footer);
    return panel;
  }

  function renderPageSelect() {
    var wrap = el("label", "dyn-page-select");
    wrap.appendChild(el("span", "dyn-page-select-label", "Page"));
    var select = el("select", "dyn-select");
    if (!state.page) select.appendChild(option("", "Choose a page"));
    state.pages.forEach(function (page) {
      var node = option(page.slug, page.name + " (" + page.widgets + ")");
      if (page.slug === state.page) node.selected = true;
      select.appendChild(node);
    });
    select.addEventListener("change", function () {
      if (!select.value) return;
      select.disabled = true;
      selectPage(select.value).catch(function () {
        select.disabled = false;
      });
    });
    wrap.appendChild(select);
    return wrap;
  }

  function render() {
    root.innerHTML = "";

    var bar = el("div", "dyn-bar");
    var label = el("div", "dyn-bar-label");
    label.appendChild(el("span", "dyn-bar-name", "Dynacat"));
    if (state.pages.length > 0) label.appendChild(renderPageSelect());
    else label.appendChild(el("span", "dyn-bar-page", state.pageName || state.page));
    bar.appendChild(label);

    var tools = el("div", "dyn-bar-tools");
    var refresh = button("dyn-btn dyn-btn--ghost", "Refresh", function () {
      refresh.disabled = true;
      load(true)
        .then(applyAndRender)
        .catch(function () {
          refresh.disabled = false;
        });
    });
    tools.appendChild(refresh);

    var customizeLabel = state.draft ? "Editing" : "Customize";
    var customize = button("dyn-btn dyn-btn--ghost", customizeLabel, function () {
      state.draft = state.cards.map(function (card) {
        return {
          key: card.key,
          title: card.title,
          type: card.type,
          error: card.error,
          visible: card.visible,
          span: card.span,
        };
      });
      render();
      refreshPicker();
    });
    customize.disabled = Boolean(state.draft) || !state.page;
    tools.appendChild(customize);
    bar.appendChild(tools);

    root.appendChild(bar);

    if (state.error) {
      root.appendChild(el("p", "dyn-error", state.error));
      return;
    }
    if (!state.page) {
      root.appendChild(el("p", "dyn-empty", "Pick a Dynacat page to build your dashboard from."));
      return;
    }
    if (state.draft) root.appendChild(renderPicker());
    root.appendChild(renderGrid());
    if (state.draft) refreshPicker();
  }

  var DASHBOARD_TOP_VIEWPORT_FRACTION = 0.86;

  function placeRoot() {
    if (!root) return;
    var logo = document.getElementById("home-logo");
    var search = document.getElementById("home-search");
    if (!logo || !search) return;

    main.style.paddingTop = "0px";
    root.style.marginTop = "0px";

    var viewport = window.innerHeight;
    var mainTop = main.getBoundingClientRect().top + window.scrollY;
    var blockTop = logo.getBoundingClientRect().top + window.scrollY;
    var blockHeight =
      search.getBoundingClientRect().bottom + window.scrollY - blockTop;

    var centeredPad = Math.max(16, viewport / 2 - blockHeight / 2 - mainTop);
    var gap = Math.max(
      24,
      viewport * DASHBOARD_TOP_VIEWPORT_FRACTION - (mainTop + centeredPad + blockHeight),
    );

    main.style.paddingTop = centeredPad + "px";
    root.style.marginTop = gap + "px";
  }

  function watchResize() {
    var pending = false;
    window.addEventListener("resize", function () {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(function () {
        pending = false;
        placeRoot();
      });
    });
  }

  function schedule(seconds) {
    if (state.timer) clearInterval(state.timer);
    var ms = Math.max(30, Number(seconds) || 60) * 1000;
    state.timer = setInterval(function () {
      if (state.draft) return;
      load(false).then(applyAndRender).catch(function () {});
    }, ms);
  }

  load(false)
    .then(function (data) {
      if (!data.configured || !data.showOnHome) return;
      if (isMobile() && !data.showOnMobile) return;
      apply(data);
      root = el("div", "dyn-root");
      main.appendChild(root);
      main.classList.add("has-dynacat");
      render();
      placeRoot();
      watchResize();
      schedule(data.refreshSeconds);
    })
    .catch(function () {});
})();

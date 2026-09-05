(() => {
  "use strict";

  const weapons = Array.isArray(window.BL2_ITEMS) ? window.BL2_ITEMS : [];
  const filterConfig = [
    { key: "category", label: "Category" },
    { key: "contentKey", label: "DLC / Expansion", display: (item) => item.contentShort },
    { key: "rarity", label: "Rarity" },
    { key: "type", label: "Item type" },
    { key: "manufacturer", label: "Manufacturer" },
  ];

  const state = {
    query: "",
    sort: "release",
    filters: Object.fromEntries(filterConfig.map(({ key }) => [key, new Set()])),
  };

  const els = {
    search: document.querySelector("#weapon-search"),
    sort: document.querySelector("#sort-select"),
    groups: document.querySelector("#filter-groups"),
    rows: document.querySelector("#weapon-rows"),
    cards: document.querySelector("#weapon-cards"),
    count: document.querySelector("#result-count"),
    reset: document.querySelector("#reset-filters"),
    emptyReset: document.querySelector("#empty-reset"),
    empty: document.querySelector("#empty-state"),
    chips: document.querySelector("#active-chips"),
    activeFilterCount: document.querySelector("#active-filter-count"),
    filters: document.querySelector("#filters"),
    dialog: document.querySelector("#weapon-dialog"),
    dialogContent: document.querySelector("#dialog-content"),
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function valuesFor(key) {
    const byValue = new Map();
    for (const weapon of weapons) {
      const value = weapon[key];
      if (!value || value === "—") continue;
      const display = filterConfig.find((item) => item.key === key)?.display?.(weapon) || value;
      if (!byValue.has(value)) {
        byValue.set(value, {
          value,
          display,
          count: 0,
          order: key === "category" ? weapon.categoryOrder : weapon.contentOrder,
        });
      }
      byValue.get(value).count += 1;
    }
    return [...byValue.values()].sort((a, b) => {
      if (key === "contentKey" || key === "category") return a.order - b.order;
      return a.display.localeCompare(b.display);
    });
  }

  function renderFilterGroups() {
    els.groups.innerHTML = filterConfig
      .map(
        ({ key, label }) => `
          <section class="filter-group">
            <h3>${escapeHtml(label)}</h3>
            ${valuesFor(key)
              .map(
                ({ value, display, count }) => `
                  <label class="filter-option">
                    <input type="checkbox" data-filter="${escapeHtml(key)}" value="${escapeHtml(value)}" />
                    <span class="fake-check" aria-hidden="true"></span>
                    <span>${escapeHtml(display)}</span>
                    <span class="option-count">${count}</span>
                  </label>`,
              )
              .join("")}
          </section>`,
      )
      .join("");

    els.groups.addEventListener("change", (event) => {
      const input = event.target.closest("input[data-filter]");
      if (!input) return;
      const selected = state.filters[input.dataset.filter];
      input.checked ? selected.add(input.value) : selected.delete(input.value);
      render();
    });
  }

  function searchText(weapon) {
    return [
      weapon.name,
      weapon.category,
      weapon.content,
      weapon.contentShort,
      weapon.rarity,
      weapon.type,
      weapon.manufacturer,
      weapon.character,
      weapon.elements.join(" "),
      weapon.sources.map((source) => `${source.name} ${source.type} ${source.location}`).join(" "),
      weapon.rates.map((rate) => `${rate.name} ${rate.value}`).join(" "),
      weapon.note,
    ]
      .join(" ")
      .toLowerCase();
  }

  function filteredWeapons() {
    const tokens = state.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const filtered = weapons.filter((weapon) => {
      if (tokens.length && !tokens.every((token) => searchText(weapon).includes(token))) return false;
      return filterConfig.every(({ key }) => {
        const selected = state.filters[key];
        return !selected.size || selected.has(weapon[key]);
      });
    });

    return filtered.sort((a, b) => {
      if (state.sort === "name") return a.name.localeCompare(b.name);
      if (state.sort === "rate-desc") return (b.bestRate ?? -1) - (a.bestRate ?? -1) || a.name.localeCompare(b.name);
      if (state.sort === "rate-asc") return (a.bestRate ?? Infinity) - (b.bestRate ?? Infinity) || a.name.localeCompare(b.name);
      if (state.sort === "rarity") return a.rarity.localeCompare(b.rarity) || a.name.localeCompare(b.name);
      return a.contentOrder - b.contentOrder || a.categoryOrder - b.categoryOrder || a.name.localeCompare(b.name);
    });
  }

  function primarySource(weapon) {
    const source = weapon.sources[0];
    if (!source) return { name: "Special acquisition", location: "See details" };
    return source;
  }

  function primaryRate(weapon) {
    const rate = weapon.rates[0];
    return rate || { name: "See source", value: "N/A" };
  }

  function rowMarkup(weapon) {
    const source = primarySource(weapon);
    const rate = primaryRate(weapon);
    const extraRates = Math.max(0, weapon.rates.length - 1);
    const extraSources = Math.max(0, weapon.sources.length - 1);
    return `
      <tr class="weapon-row" data-id="${escapeHtml(weapon.id)}" data-rarity="${escapeHtml(weapon.rarityKey)}">
        <td>
          <span class="weapon-name">${escapeHtml(weapon.name)}</span>
          <span class="content-tag">${escapeHtml(weapon.contentShort)}</span>
        </td>
        <td>
          <span class="category-label">${escapeHtml(weapon.category)}</span>
          <span class="rarity-badge">${escapeHtml(weapon.rarity)}</span>
          <span class="meta-line">${escapeHtml(weapon.manufacturer)} · ${escapeHtml(weapon.type)}</span>
        </td>
        <td>
          <span class="source-name">${escapeHtml(source.name)}${extraSources ? ` +${extraSources}` : ""}</span>
          <span class="source-location">${escapeHtml(source.type || "Special")} · ${escapeHtml(source.location || "See details")}</span>
        </td>
        <td>
          <span class="rate-main">${escapeHtml(rate.value)}</span>
          <span class="rate-more">${escapeHtml(rate.name)}${extraRates ? ` · +${extraRates} route${extraRates === 1 ? "" : "s"}` : ""}</span>
        </td>
        <td><button class="details-button" type="button" data-open="${escapeHtml(weapon.id)}" aria-label="View ${escapeHtml(weapon.name)} details">→</button></td>
      </tr>`;
  }

  function cardMarkup(weapon) {
    const source = primarySource(weapon);
    const rate = primaryRate(weapon);
    return `
      <article class="weapon-card" data-id="${escapeHtml(weapon.id)}" data-rarity="${escapeHtml(weapon.rarityKey)}">
        <span class="weapon-name">${escapeHtml(weapon.name)}</span>
        <span class="content-tag">${escapeHtml(weapon.contentShort)}</span>
        <button class="details-button" type="button" data-open="${escapeHtml(weapon.id)}" aria-label="View ${escapeHtml(weapon.name)} details">→</button>
        <div class="card-meta">
          <span class="card-taxonomy">${escapeHtml(weapon.category)} · ${escapeHtml(weapon.manufacturer)} · ${escapeHtml(weapon.type)}</span>
          <span class="rarity-badge">${escapeHtml(weapon.rarity)}</span>
        </div>
        <div class="card-farm">
          <div>
            <span class="source-name">${escapeHtml(source.name)}</span>
            <span class="source-location">${escapeHtml(source.location || source.type || "See details")}</span>
          </div>
          <span class="rate-main">${escapeHtml(rate.value)}</span>
        </div>
      </article>`;
  }

  function renderChips() {
    const chips = [];
    if (state.query) chips.push({ key: "query", value: state.query, label: `Search: ${state.query}` });
    for (const { key, display } of filterConfig) {
      for (const value of state.filters[key]) {
        const weapon = weapons.find((item) => item[key] === value);
        chips.push({ key, value, label: display?.(weapon) || value });
      }
    }
    els.chips.innerHTML = chips
      .map(
        (chip) => `<button class="chip" type="button" data-chip-key="${escapeHtml(chip.key)}" data-chip-value="${escapeHtml(chip.value)}">${escapeHtml(chip.label)} ×</button>`,
      )
      .join("");
    els.activeFilterCount.textContent = String(chips.length);
  }

  function syncUrl() {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    if (state.sort !== "release") params.set("sort", state.sort);
    for (const { key } of filterConfig) {
      if (state.filters[key].size) params.set(key, [...state.filters[key]].join(","));
    }
    const query = params.toString();
    history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
  }

  function render() {
    const current = filteredWeapons();
    els.rows.innerHTML = current.map(rowMarkup).join("");
    els.cards.innerHTML = current.map(cardMarkup).join("");
    els.count.textContent = String(current.length);
    els.empty.hidden = current.length > 0;
    document.querySelector(".weapon-table-wrap").hidden = current.length === 0;
    els.cards.hidden = current.length === 0;
    renderChips();
    syncUrl();
  }

  function openWeapon(id, updateHash = true) {
    const weapon = weapons.find((item) => item.id === id);
    if (!weapon) return;
    els.dialogContent.innerHTML = `
      <p class="dialog-kicker">${escapeHtml(weapon.contentShort)}</p>
      <h2 class="dialog-title" id="dialog-title">${escapeHtml(weapon.name)}</h2>
      <div class="dialog-meta" data-rarity="${escapeHtml(weapon.rarityKey)}">
        <span>${escapeHtml(weapon.category)}</span>
        <span class="rarity-badge">${escapeHtml(weapon.rarity)}</span>
        <span>${escapeHtml(weapon.manufacturer)}</span>
        <span>${escapeHtml(weapon.type)}</span>
        ${weapon.elements.map((element) => `<span>${escapeHtml(element)}</span>`).join("")}
      </div>
      <div class="dialog-grid">
        <section class="dialog-section">
          <h3>Where to get it</h3>
          ${weapon.sources.length
            ? weapon.sources.map((source) => `
              <div class="source-card">
                <strong>${escapeHtml(source.name)}</strong>
                <span>${escapeHtml(source.type)} · ${escapeHtml(source.location)}</span>
              </div>`).join("")
            : '<div class="source-card"><strong>Special acquisition</strong><span>See linked source</span></div>'}
        </section>
        <section class="dialog-section">
          <h3>Drop rate / cost</h3>
          ${weapon.rates.length
            ? weapon.rates.map((rate) => `
              <div class="rate-card">
                <strong>${escapeHtml(rate.value || "N/A")}</strong>
                <span>${escapeHtml(rate.name)}</span>
              </div>`).join("")
            : '<div class="rate-card"><strong>N/A</strong><span>See linked source</span></div>'}
        </section>
        ${weapon.note ? `<div class="note-card"><strong>Field note:</strong> ${escapeHtml(weapon.note)}</div>` : ""}
      </div>
      <a class="source-link" href="${escapeHtml(weapon.sourceUrl)}" target="_blank" rel="noreferrer">Open source page ↗</a>`;
    els.dialog.showModal();
    if (updateHash) history.replaceState(null, "", `${location.pathname}${location.search}#${weapon.id}`);
  }

  function resetAll() {
    state.query = "";
    state.sort = "release";
    Object.values(state.filters).forEach((set) => set.clear());
    els.search.value = "";
    els.sort.value = "release";
    window.JehlpUI?.enhance(els.sort);
    document.querySelectorAll("input[data-filter]").forEach((input) => { input.checked = false; });
    render();
  }

  function restoreState() {
    const params = new URLSearchParams(location.search);
    state.query = params.get("q") || "";
    state.sort = params.get("sort") || "release";
    els.search.value = state.query;
    els.sort.value = state.sort;
    window.JehlpUI?.enhance(els.sort);
    for (const { key } of filterConfig) {
      const values = params.get(key)?.split(",").filter(Boolean) || [];
      values.forEach((value) => state.filters[key].add(value));
    }
    document.querySelectorAll("input[data-filter]").forEach((input) => {
      input.checked = state.filters[input.dataset.filter]?.has(input.value) || false;
    });
  }

  renderFilterGroups();
  restoreState();

  els.search.addEventListener("input", () => {
    state.query = els.search.value.trim();
    render();
  });
  els.sort.addEventListener("change", () => {
    state.sort = els.sort.value;
    render();
  });
  els.reset.addEventListener("click", resetAll);
  els.emptyReset.addEventListener("click", resetAll);
  els.dialog.addEventListener("close", () => {
    if (location.hash) history.replaceState(null, "", `${location.pathname}${location.search}`);
  });

  document.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open]");
    if (openButton) openWeapon(openButton.dataset.open);

    const row = event.target.closest(".weapon-row, .weapon-card");
    if (row && !event.target.closest("button, a")) openWeapon(row.dataset.id);

    const chip = event.target.closest("[data-chip-key]");
    if (chip) {
      if (chip.dataset.chipKey === "query") {
        state.query = "";
        els.search.value = "";
      } else {
        state.filters[chip.dataset.chipKey].delete(chip.dataset.chipValue);
        const input = [...document.querySelectorAll(`input[data-filter="${chip.dataset.chipKey}"]`)]
          .find((candidate) => candidate.value === chip.dataset.chipValue);
        if (input) input.checked = false;
      }
      render();
    }
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      els.search.focus();
    } else if (event.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      event.preventDefault();
      els.search.focus();
    }
  });

  render();
  if (location.hash) openWeapon(location.hash.slice(1), false);
})();

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

// Controller contract tests. Layout and native dialog focus are checked separately.
class Element {
  constructor(document) {
    this.document = document;
    this.children = [];
    this.textContent = "";
    this.value = "";
    this.listeners = {};
    this.dataset = {};
    this.tagName = "BUTTON";
  }
  set innerHTML(markup) {
    if (this.children.includes(this.document?.activeElement)) this.document.activeElement = null;
    this.markup = markup;
    this.children = [...markup.matchAll(/<button\b([^>]*)>/g)].map(([, attributes]) => {
      const node = new Element(this.document);
      node.dataset = Object.fromEntries([...attributes.matchAll(/data-([\w-]+)="([^"]*)"/g)]
        .map(([, key, value]) => [key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
      return node;
    });
  }
  get innerHTML() { return this.markup || ""; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  fire(type, target = this) { this.listeners[type]?.({ target }); }
  focus() { this.focused = true; if (this.document) this.document.activeElement = this; }
  showModal() { this.open = true; }
  querySelector(selector) { return this.children.find((child) => child.closest(selector)) || null; }
  closest(selector) {
    const match = selector.match(/^\[data-([\w-]+)\]$/);
    if (!match) return null;
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return Object.hasOwn(this.dataset, key) ? this : null;
  }
}

async function explorer(query = "") {
  const elements = new Map();
  const document = { activeElement: null };
  const listeners = {};
  const get = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element(document));
    return elements.get(selector);
  };
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const sortMarkup = html.match(/<select\b[^>]*id="sort-select"[^>]*>([\s\S]*?)<\/select>/)[1];
  get("#sort-select").options = [...sortMarkup.matchAll(/<option value="([^"]+)"/g)]
    .map(([, value]) => ({ value }));
  const location = new URL(`https://jehlp.net/bl2/${query}`);
  const enhancements = [];
  Object.assign(document, {
    querySelector: get,
    querySelectorAll: () => [],
    addEventListener(type, callback) { listeners[type] = callback; },
  });
  const context = {
    window: { JehlpUI: { enhance: (element) => enhancements.push(element) } },
    location,
    history: { replaceState(_state, _title, url) { location.href = new URL(url, location).href; } },
    URLSearchParams,
    document,
  };
  for (const file of ["data/items.js", "assets/app.js"]) {
    vm.runInNewContext(await readFile(new URL(`../${file}`, import.meta.url), "utf8"), context);
  }
  return { get, location, enhancements, document, items: context.window.BL2_ITEMS,
    click(element) { element.focus(); listeners.click({ target: element }); },
  };
}

test("unknown shared-link filter values cannot break the item catalogue", async () => {
  const { get, location, items } = await explorer("?contentKey=removed-expansion&category=unknown&sort=invalid#about");
  assert.equal(get("#result-count").textContent, String(items.length));
  assert.equal(get("#sort-select").value, "release");
  assert.equal(get("#active-filter-count").textContent, "0");
  assert.equal(location.search, "");
  assert.equal(location.hash, "#about");
});

test("valid shared-link filters survive alongside stale values", async () => {
  const baseline = await explorer();
  const category = baseline.items[0].category;
  const params = new URLSearchParams({ category: `${category},unknown`, sort: "name" });
  const { get, location, items } = await explorer(`?${params}`);
  assert.equal(get("#result-count").textContent, String(items.filter((item) => item.category === category).length));
  assert.equal(get("#active-filter-count").textContent, "1");
  assert.equal(get("#sort-select").value, "name");
  assert.equal(location.searchParams.get("category"), category);
  assert.equal(location.searchParams.get("sort"), "name");
});

test("empty-result reset restores items, focus, and the enhanced sort selection", async () => {
  const { get, location, enhancements, items, document } = await explorer("?q=unmatched-fixture-zzzz&sort=rate-desc");
  assert.equal(get("#result-count").textContent, "0");
  assert.equal(get("#empty-state").hidden, false);
  get("#empty-reset").fire("click");
  assert.equal(get("#result-count").textContent, String(items.length));
  assert.equal(get("#empty-state").hidden, true);
  assert.equal(get("#weapon-search").value, "");
  assert.equal(get("#sort-select").value, "release");
  assert.equal(enhancements.at(-1), get("#sort-select"));
  assert.equal(location.search, "");
  assert.equal(document.activeElement, get("#weapon-search"));
});

test("chip removal retains focus on a remaining chip or the search field", async () => {
  const baseline = await explorer();
  const category = baseline.items[0].category;
  const ui = await explorer(`?${new URLSearchParams({ q: "Hornet", category })}`);
  ui.click(ui.get("#active-chips").querySelector("[data-chip-key]"));
  assert.equal(ui.document.activeElement?.dataset.chipKey, "category");
  ui.click(ui.document.activeElement);
  assert.equal(ui.document.activeElement, ui.get("#weapon-search"));
  assert.equal(ui.get("#result-count").textContent, String(ui.items.length));
});

test("the detail dialog close label applies to all item categories", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="dialog-close" aria-label="Close item details"/);
});

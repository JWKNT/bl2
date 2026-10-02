import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

// Controller contract tests. Layout and native dialog focus are checked separately.
class Element {
  constructor() {
    this.innerHTML = "";
    this.textContent = "";
    this.value = "";
    this.listeners = {};
    this.dataset = {};
    this.tagName = "BUTTON";
  }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  fire(type, target = this) { this.listeners[type]?.({ target }); }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
}

async function explorer(query = "") {
  const elements = new Map();
  const get = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const sortMarkup = html.match(/<select\b[^>]*id="sort-select"[^>]*>([\s\S]*?)<\/select>/)[1];
  get("#sort-select").options = [...sortMarkup.matchAll(/<option value="([^"]+)"/g)]
    .map(([, value]) => ({ value }));
  const location = new URL(`https://jehlp.net/bl2/${query}`);
  const enhancements = [];
  const context = {
    window: { JehlpUI: { enhance: (element) => enhancements.push(element) } },
    location,
    history: { replaceState(_state, _title, url) { location.href = new URL(url, location).href; } },
    URLSearchParams,
    document: {
      querySelector: get,
      querySelectorAll: () => [],
      addEventListener() {},
      activeElement: new Element(),
    },
  };
  for (const file of ["data/items.js", "assets/app.js"]) {
    vm.runInNewContext(await readFile(new URL(`../${file}`, import.meta.url), "utf8"), context);
  }
  return { get, location, enhancements, items: context.window.BL2_ITEMS };
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

test("empty-result reset restores items and the enhanced sort selection", async () => {
  const { get, location, enhancements, items } = await explorer("?q=unmatched-fixture-zzzz&sort=rate-desc");
  assert.equal(get("#result-count").textContent, "0");
  assert.equal(get("#empty-state").hidden, false);
  get("#empty-reset").fire("click");
  assert.equal(get("#result-count").textContent, String(items.length));
  assert.equal(get("#empty-state").hidden, true);
  assert.equal(get("#weapon-search").value, "");
  assert.equal(get("#sort-select").value, "release");
  assert.equal(enhancements.at(-1), get("#sort-select"));
  assert.equal(location.search, "");
});

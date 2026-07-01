
(() => {
  "use strict";

  const STORAGE_KEY = "goldValuationTracker.v1";
  const PURITIES = { "24K": 1, "22K": 0.916, "18K": 0.75, "14K": 0.583, "10K": 0.417 };
  const HALLMARKS = { "24K": "999 / 999.9", "22K": "916", "18K": "750", "14K": "583 / 585", "10K": "416 / 417", "Custom": "Tested purity" };
  const DEFAULT_STATE = JSON.parse(JSON.stringify(window.DEFAULT_GOLD_STATE));

  const $ = (id) => document.getElementById(id);
  const qsa = (selector) => Array.from(document.querySelectorAll(selector));

  let state = loadState();
  let toastTimer = null;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.settings && Array.isArray(saved.items)) return normalizeState(saved);
    } catch (_) {}
    return normalizeState(clone(DEFAULT_STATE));
  }

  function normalizeState(input) {
    const next = clone(input);
    next.version = 1;
    next.settings = next.settings || {};
    next.settings.spotPrice = positiveNumber(next.settings.spotPrice, DEFAULT_STATE.settings.spotPrice);
    next.settings.dealerPct = boundedNumber(next.settings.dealerPct, 0, 1, DEFAULT_STATE.settings.dealerPct);
    next.settings.pawnPct = boundedNumber(next.settings.pawnPct, 0, 1, DEFAULT_STATE.settings.pawnPct);
    next.settings.gramsPerOz = positiveNumber(next.settings.gramsPerOz, 31.1035);
    next.settings.valuationDate = next.settings.valuationDate || new Date().toISOString().slice(0,10);
    next.items = (next.items || []).map((item, index) => ({
      id: Number(item.id) || index + 1,
      description: String(item.description || "Gold item"),
      karat: Object.prototype.hasOwnProperty.call(PURITIES, item.karat) || item.karat === "Custom" ? item.karat : "14K",
      grossWeight: nonnegative(item.grossWeight),
      deduction: nonnegative(item.deduction),
      purityOverride: item.purityOverride === null || item.purityOverride === "" || item.purityOverride === undefined ? null : boundedNumber(item.purityOverride, 0, 1, null),
      purchaseCost: item.purchaseCost === null || item.purchaseCost === "" || item.purchaseCost === undefined ? null : nonnegative(item.purchaseCost),
      notes: String(item.notes || ""),
      status: String(item.status || "Unverified"),
    }));
    return next;
  }

  function positiveNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
  function nonnegative(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  function boundedNumber(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  }

  function saveState(message = "Saved locally.") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    $("saveStatus").textContent = message;
  }

  function purityFor(item) {
    if (item.purityOverride !== null && Number.isFinite(Number(item.purityOverride))) return Number(item.purityOverride);
    return PURITIES[item.karat] ?? 0;
  }

  function calculate(item) {
    const gross = nonnegative(item.grossWeight);
    const deduction = Math.min(nonnegative(item.deduction), gross);
    const net = Math.max(gross - deduction, 0);
    const purity = purityFor(item);
    const pure = net * purity;
    const melt = pure * state.settings.spotPrice / state.settings.gramsPerOz;
    const dealer = melt * state.settings.dealerPct;
    const pawn = melt * state.settings.pawnPct;
    const cost = item.purchaseCost === null ? 0 : nonnegative(item.purchaseCost);
    return {
      gross, deduction, net, purity, pure, melt, dealer, pawn, cost,
      gainMelt: item.purchaseCost === null ? null : melt - cost,
      gainDealer: item.purchaseCost === null ? null : dealer - cost,
      roiMelt: item.purchaseCost === null || cost === 0 ? null : (melt - cost) / cost,
    };
  }

  function totals(items = state.items) {
    return items.reduce((acc, item) => {
      const c = calculate(item);
      acc.count += 1;
      acc.gross += c.gross;
      acc.deduction += c.deduction;
      acc.net += c.net;
      acc.pure += c.pure;
      acc.melt += c.melt;
      acc.dealer += c.dealer;
      acc.pawn += c.pawn;
      if (item.purchaseCost !== null) acc.cost += c.cost;
      return acc;
    }, { count: 0, gross: 0, deduction: 0, net: 0, pure: 0, melt: 0, dealer: 0, pawn: 0, cost: 0 });
  }

  const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(n) || 0);
  const grams = (n) => `${(Number(n) || 0).toFixed(3)} g`;
  const percent = (n) => `${((Number(n) || 0) * 100).toFixed(1)}%`;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[ch]));
  }

  function renderAll() {
    syncSettingsInputs();
    renderDashboard();
    renderItems();
    renderReference();
  }

  function syncSettingsInputs() {
    $("spotPrice").value = state.settings.spotPrice.toFixed(2);
    $("dealerPct").value = (state.settings.dealerPct * 100).toFixed(1);
    $("pawnPct").value = (state.settings.pawnPct * 100).toFixed(1);
    $("valuationDate").value = state.settings.valuationDate;
  }

  function renderDashboard() {
    const t = totals();
    $("metricItems").textContent = String(t.count);
    $("metricGross").textContent = grams(t.gross);
    $("metricPure").textContent = grams(t.pure);
    $("metricMelt").textContent = money(t.melt);
    $("metricDealer").textContent = money(t.dealer);
    $("metricPawn").textContent = money(t.pawn);
    $("metricConservative").textContent = money(t.dealer * 0.75);
    $("metricCost").textContent = money(t.cost);
    const gain = t.dealer - t.cost;
    $("metricGain").textContent = money(gain);
    $("metricGain").classList.toggle("positive", gain > 0);
    $("metricGain").classList.toggle("negative", gain < 0);
    $("summaryAsOf").textContent = state.settings.valuationDate ? `As of ${formatDate(state.settings.valuationDate)}` : "";

    const karats = ["24K","22K","18K","14K","10K","Custom"];
    const summaries = karats.map(k => {
      const subset = state.items.filter(item => item.karat === k);
      return { karat: k, ...totals(subset) };
    });
    const max = Math.max(1, ...summaries.map(s => s.melt));
    $("karatBars").innerHTML = summaries.map(s => `
      <div class="bar-row">
        <span class="bar-label">${s.karat}</span>
        <div class="bar-track" aria-label="${s.karat} melt value ${money(s.melt)}">
          <div class="bar-fill" style="width:${Math.max(0, (s.melt/max)*100)}%"></div>
        </div>
        <span class="bar-value">${money(s.melt)}</span>
      </div>`).join("");
  }

  function filteredItems() {
    const search = $("searchItems").value.trim().toLowerCase();
    const karat = $("filterKarat").value;
    const sort = $("sortItems").value;
    let list = state.items.filter(item => {
      const haystack = `${item.description} ${item.notes} ${item.status}`.toLowerCase();
      return (!search || haystack.includes(search)) && (!karat || item.karat === karat);
    });
    list = [...list].sort((a,b) => {
      if (sort === "meltDesc") return calculate(b).melt - calculate(a).melt;
      if (sort === "weightDesc") return b.grossWeight - a.grossWeight;
      if (sort === "karatDesc") return purityFor(b) - purityFor(a);
      if (sort === "description") return a.description.localeCompare(b.description);
      return a.id - b.id;
    });
    return list;
  }

  function renderItems() {
    const list = filteredItems();
    $("emptyItems").classList.toggle("hidden", list.length > 0);
    $("itemsList").innerHTML = list.map(item => {
      const c = calculate(item);
      const costLine = item.purchaseCost === null ? "Purchase cost not entered" : `Cost ${money(c.cost)} · Dealer gain/loss ${money(c.gainDealer)}`;
      return `
        <article class="item-card card">
          <div class="item-header">
            <div>
              <h3 class="item-title">#${item.id} ${escapeHtml(item.description)}</h3>
              <p class="item-subtitle">${escapeHtml(item.status)} · ${costLine}</p>
            </div>
            <span class="badge">${escapeHtml(item.karat)} · ${percent(c.purity)}</span>
          </div>
          <div class="item-values">
            <div><span>Gross</span><strong>${grams(c.gross)}</strong></div>
            <div><span>Net gold-bearing</span><strong>${grams(c.net)}</strong></div>
            <div><span>Pure gold</span><strong>${grams(c.pure)}</strong></div>
            <div><span>Melt value</span><strong>${money(c.melt)}</strong></div>
            <div><span>Dealer estimate</span><strong>${money(c.dealer)}</strong></div>
            <div><span>Pawn estimate</span><strong>${money(c.pawn)}</strong></div>
            <div><span>Deduction</span><strong>${grams(c.deduction)}</strong></div>
            <div><span>75% of dealer</span><strong>${money(c.dealer * .75)}</strong></div>
          </div>
          ${item.notes ? `<p class="item-notes">${escapeHtml(item.notes)}</p>` : ""}
          <div class="item-actions">
            <button class="small-button edit-item" data-id="${item.id}">Edit</button>
            <button class="small-button danger delete-item" data-id="${item.id}">Delete</button>
          </div>
        </article>`;
    }).join("");

    qsa(".edit-item").forEach(btn => btn.addEventListener("click", () => openItemDialog(Number(btn.dataset.id))));
    qsa(".delete-item").forEach(btn => btn.addEventListener("click", () => deleteItem(Number(btn.dataset.id))));
  }

  function renderReference() {
    const rows = ["24K","22K","18K","14K","10K","Custom"];
    $("referenceBody").innerHTML = rows.map(k => {
      if (k === "Custom") return `<tr><td>Custom</td><td>Override</td><td>${HALLMARKS[k]}</td><td>—</td><td>—</td><td>—</td></tr>`;
      const purity = PURITIES[k];
      const melt = purity * state.settings.spotPrice / state.settings.gramsPerOz;
      return `<tr>
        <td>${k}</td><td>${percent(purity)}</td><td>${HALLMARKS[k]}</td>
        <td>${money(melt)}</td><td>${money(melt * state.settings.dealerPct)}</td><td>${money(melt * state.settings.pawnPct)}</td>
      </tr>`;
    }).join("");
  }

  function formatDate(iso) {
    try { return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" }); }
    catch (_) { return iso; }
  }

  function setTab(name) {
    qsa(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.tab === name));
    qsa(".panel").forEach(panel => panel.classList.remove("active"));
    $(`${name}Panel`).classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateSettings() {
    const spot = Number($("spotPrice").value);
    const dealer = Number($("dealerPct").value) / 100;
    const pawn = Number($("pawnPct").value) / 100;
    if (Number.isFinite(spot) && spot > 0) state.settings.spotPrice = spot;
    if (Number.isFinite(dealer) && dealer >= 0 && dealer <= 1) state.settings.dealerPct = dealer;
    if (Number.isFinite(pawn) && pawn >= 0 && pawn <= 1) state.settings.pawnPct = pawn;
    state.settings.valuationDate = $("valuationDate").value || state.settings.valuationDate;
    saveState();
    renderDashboard();
    renderItems();
    renderReference();
  }

  function nextId() {
    return state.items.length ? Math.max(...state.items.map(i => i.id)) + 1 : 1;
  }

  function openItemDialog(id = null) {
    const item = id === null ? {
      id: "", description: "", karat: "14K", grossWeight: "", deduction: 0,
      purityOverride: null, purchaseCost: null, notes: "", status: "Unverified"
    } : state.items.find(i => i.id === id);
    if (!item) return;

    $("dialogTitle").textContent = id === null ? "Add Item" : "Edit Item";
    $("itemId").value = item.id;
    $("itemDescription").value = item.description;
    $("itemKarat").value = item.karat;
    $("grossWeight").value = item.grossWeight;
    $("deduction").value = item.deduction;
    $("purityOverride").value = item.purityOverride === null ? "" : (item.purityOverride * 100);
    $("purchaseCost").value = item.purchaseCost === null ? "" : item.purchaseCost;
    $("itemNotes").value = item.notes;
    $("itemStatus").value = item.status;
    updatePurityField();
    updatePreview();
    $("itemDialog").showModal();
    setTimeout(() => $("itemDescription").focus(), 50);
  }

  function closeItemDialog() { $("itemDialog").close(); }

  function updatePurityField() {
    const isCustom = $("itemKarat").value === "Custom";
    $("purityOverrideField").style.opacity = isCustom ? "1" : ".72";
    $("purityOverride").required = isCustom;
  }

  function formItem() {
    const overrideText = $("purityOverride").value;
    return {
      id: Number($("itemId").value) || nextId(),
      description: $("itemDescription").value.trim(),
      karat: $("itemKarat").value,
      grossWeight: nonnegative($("grossWeight").value),
      deduction: nonnegative($("deduction").value),
      purityOverride: overrideText === "" ? null : boundedNumber(Number(overrideText) / 100, 0, 1, null),
      purchaseCost: $("purchaseCost").value === "" ? null : nonnegative($("purchaseCost").value),
      notes: $("itemNotes").value.trim(),
      status: $("itemStatus").value,
    };
  }

  function updatePreview() {
    const item = formItem();
    const c = calculate(item);
    $("previewNet").textContent = grams(c.net);
    $("previewPure").textContent = grams(c.pure);
    $("previewMelt").textContent = money(c.melt);
    $("previewDealer").textContent = money(c.dealer);
  }

  function saveItem(event) {
    event.preventDefault();
    const item = formItem();
    if (!item.description || item.grossWeight <= 0) {
      showToast("Enter a description and a weight greater than zero.");
      return;
    }
    if (item.karat === "Custom" && item.purityOverride === null) {
      showToast("Enter a tested purity percentage for a Custom item.");
      return;
    }
    item.deduction = Math.min(item.deduction, item.grossWeight);
    const existingIndex = state.items.findIndex(i => i.id === item.id);
    if (existingIndex >= 0) state.items[existingIndex] = item;
    else state.items.push(item);
    saveState();
    closeItemDialog();
    renderAll();
    setTab("items");
    showToast(existingIndex >= 0 ? "Item updated." : "Item added.");
  }

  function deleteItem(id) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Delete "${item.description}"?`)) return;
    state.items = state.items.filter(i => i.id !== id);
    saveState();
    renderAll();
    showToast("Item deleted.");
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const stamp = new Date().toISOString().slice(0,10);
    download(`gold-valuation-backup-${stamp}.json`, JSON.stringify(state, null, 2), "application/json");
    showToast("Backup exported.");
  }

  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.settings || !Array.isArray(parsed.items)) throw new Error("Invalid backup");
        state = normalizeState(parsed);
        saveState("Imported and saved locally.");
        renderAll();
        showToast("Backup imported.");
      } catch (_) {
        alert("The selected file is not a valid Gold Valuation Tracker backup.");
      }
      $("importJsonInput").value = "";
    };
    reader.readAsText(file);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    const headers = [
      "Item #","Description","Karat","Gross Weight (g)","Non-Gold Deduction (g)",
      "Net Gold Weight (g)","Applied Purity %","Pure Gold (g)","Melt Value ($)",
      "Dealer Estimate ($)","Pawn Estimate ($)","75% of Dealer Estimate ($)",
      "Purchase Cost ($)","Gain/(Loss) at Melt ($)","ROI at Melt","Gain/(Loss) at Dealer ($)",
      "Hallmark / Test Notes","Status"
    ];
    const rows = state.items.map(item => {
      const c = calculate(item);
      return [
        item.id,item.description,item.karat,c.gross,c.deduction,c.net,c.purity,c.pure,c.melt,
        c.dealer,c.pawn,c.dealer*.75,item.purchaseCost ?? "",c.gainMelt ?? "",c.roiMelt ?? "",
        c.gainDealer ?? "",item.notes,item.status
      ];
    });
    const text = "\ufeff" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
    download(`gold-valuation-ledger-${new Date().toISOString().slice(0,10)}.csv`, text, "text/csv;charset=utf-8");
    showToast("CSV exported.");
  }

  async function copySummary() {
    const t = totals();
    const text = [
      `Gold Valuation Summary — ${formatDate(state.settings.valuationDate)}`,
      `Spot price: ${money(state.settings.spotPrice)} per troy ounce`,
      `Items: ${t.count}`,
      `Gross weight: ${grams(t.gross)}`,
      `Pure gold: ${grams(t.pure)}`,
      `Full melt value: ${money(t.melt)}`,
      `Dealer estimate: ${money(t.dealer)}`,
      `Pawn estimate: ${money(t.pawn)}`,
      `75% of dealer estimate: ${money(t.dealer * .75)}`,
      `Purchase cost entered: ${money(t.cost)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("Summary copied.");
    } catch (_) {
      prompt("Copy this summary:", text);
    }
  }

  function resetState() {
    if (!confirm("Reset the app to the completed tracker and remove changes saved on this device?")) return;
    state = normalizeState(clone(DEFAULT_STATE));
    saveState("Reset and saved locally.");
    renderAll();
    showToast("Completed tracker restored.");
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    $("toast").textContent = message;
    $("toast").classList.add("show");
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2200);
  }

  function wireEvents() {
    qsa(".tab").forEach(tab => tab.addEventListener("click", () => setTab(tab.dataset.tab)));
    ["spotPrice","dealerPct","pawnPct","valuationDate"].forEach(id => $(id).addEventListener("change", updateSettings));
    ["searchItems","filterKarat","sortItems"].forEach(id => $(id).addEventListener("input", renderItems));
    $("addItemBtn").addEventListener("click", () => openItemDialog());
    $("addFromDashboard").addEventListener("click", () => openItemDialog());
    $("closeDialogBtn").addEventListener("click", closeItemDialog);
    $("cancelDialogBtn").addEventListener("click", closeItemDialog);
    $("itemForm").addEventListener("submit", saveItem);
    ["itemKarat","grossWeight","deduction","purityOverride","purchaseCost"].forEach(id => $(id).addEventListener("input", updatePreview));
    $("itemKarat").addEventListener("change", () => { updatePurityField(); updatePreview(); });
    $("exportJsonBtn").addEventListener("click", exportJson);
    $("importJsonInput").addEventListener("change", e => importJson(e.target.files[0]));
    $("exportCsvBtn").addEventListener("click", exportCsv);
    $("copySummaryBtn").addEventListener("click", copySummary);
    $("resetBtn").addEventListener("click", resetState);
    $("installHelpBtn").addEventListener("click", () => $("installDialog").showModal());
    $("closeInstallBtn").addEventListener("click", () => $("installDialog").close());
  }

  wireEvents();
  renderAll();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
  }
})();

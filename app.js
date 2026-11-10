const STORAGE_KEY = "depas-cdmx-inmuebles-v1";
const ALCALDIAS = [
  "Álvaro Obregón",
  "Azcapotzalco",
  "Benito Juárez",
  "Coyoacán",
  "Cuajimalpa de Morelos",
  "Cuauhtémoc",
  "Gustavo A. Madero",
  "Iztacalco",
  "Iztapalapa",
  "La Magdalena Contreras",
  "Miguel Hidalgo",
  "Milpa Alta",
  "Tláhuac",
  "Tlalpan",
  "Venustiano Carranza",
  "Xochimilco",
];
const STATUS_LABELS = {
  investigacion: "Investigando",
  contactado: "Contactado",
  cita: "Cita agendada",
  visita: "Visitado",
  papeles: "Documentación",
  descartado: "Descartado",
  rentado: "Rentado",
};
const VIEW_LABELS = {
  dashboard: "Resumen",
  catalog: "Inmuebles",
  form: "Agregar depa",
  voting: "Calificar",
  top: "Mejores calificadas",
  compare: "Comparar",
};
const root = document.querySelector("#view-root");
const notice = document.querySelector("#notice");
const appShell = document.querySelector("#app-shell");
const setupScreen = document.querySelector("#setup-screen");
const setupMessage = document.querySelector("#setup-message");
const state = {
  properties: [],
  postalCodes: [],
  supabase: null,
  realtimeChannel: null,
  remoteRefreshPromise: null,
  view: "dashboard",
  catalogLayout: "cards",
  compareIds: new Set(),
  editingId: null,
};

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function showNotice(message, type = "info") {
  notice.textContent = message;
  notice.className = `notice notice-${type}`;
  notice.hidden = false;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => {
    notice.hidden = true;
  }, 6500);
}

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function numberValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function propertyTotal(property) {
  if ((property.rent === null || property.rent === undefined || property.rent === "")
    && (property.maintenance === null || property.maintenance === undefined || property.maintenance === "")) return null;
  return (Number(property.rent) || 0) + (Number(property.maintenance) || 0);
}

function scoreAverage(property) {
  const scores = [property.ratings?.benja, property.ratings?.caro]
    .filter((score) => Number.isFinite(Number(score)) && Number(score) >= 1 && Number(score) <= 7)
    .map(Number);
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}

function scoreDisplay(property) {
  const benja = property.ratings?.benja;
  const caro = property.ratings?.caro;
  const values = [benja, caro].filter((score) => Number.isFinite(Number(score)) && Number(score) > 0);
  if (!values.length) return '<span class="muted">Sin calificar</span>';
  const average = values.reduce((sum, score) => sum + Number(score), 0) / values.length;
  return `<span class="score-star">★</span> ${average.toFixed(1)} <span class="score-detail">(${values.length}/2)</span>`;
}

function statusPill(status) {
  const key = STATUS_LABELS[status] ? status : "investigacion";
  return `<span class="status-pill status-${key}">${STATUS_LABELS[key]}</span>`;
}

function amenityLabels(property) {
  const amenities = property.amenities || {};
  return [
    amenities.petFriendly && "Pet friendly",
    amenities.balcony && "Balcón",
    amenities.terrace && "Terraza",
    amenities.roof && "Roof",
  ].filter(Boolean);
}

function renderPropertyCard(property, compact = false) {
  const selectedForComparison = state.compareIds.has(property.id);
  const amenities = amenityLabels(property);
  const location = [property.colonia, property.alcaldia].filter(Boolean).join(" · ");
  const rooms = [
    property.bedrooms != null && `${property.bedrooms} rec`,
    property.bathrooms != null && `${property.bathrooms} baños`,
    property.parking != null && `${property.parking} est.`,
  ].filter(Boolean);
  return `
    <article class="property-card${compact ? " property-card-compact" : ""}">
      <div class="property-card-top">
        <div class="property-monogram">${escapeHTML((property.name || "D").trim().charAt(0).toUpperCase())}</div>
        <div class="property-heading">
          <div class="property-name-row"><h3>${escapeHTML(property.name || "Depa sin nombre")}</h3>${statusPill(property.status)}</div>
          <p>${escapeHTML(location || "Ubicación pendiente")}${property.cp ? ` <span>· CP ${escapeHTML(property.cp)}</span>` : ""}</p>
        </div>
        <div class="rating-chip">${scoreDisplay(property)}</div>
      </div>
      <div class="property-price-line">
        <strong>${money(propertyTotal(property))}<small>/ mes</small></strong>
        <span>${property.m2 ? `${escapeHTML(property.m2)} m²` : "Metros pendientes"}</span>
      </div>
      ${rooms.length ? `<div class="property-details">${rooms.map((room) => `<span>${escapeHTML(room)}</span>`).join("")}</div>` : ""}
      ${amenities.length ? `<div class="amenity-list">${amenities.map((amenity) => `<span>${escapeHTML(amenity)}</span>`).join("")}</div>` : ""}
      ${property.followUp ? `<p class="property-followup">Próximo paso · ${escapeHTML(property.followUp)}</p>` : ""}
      <div class="property-card-actions">
        ${property.adUrl ? `<a class="text-link" href="${escapeHTML(property.adUrl)}" target="_blank" rel="noreferrer">Ver anuncio ↗</a>` : "<span></span>"}
        <div class="card-action-buttons">
          ${compact ? "" : `<button class="text-link compare-action${selectedForComparison ? " selected" : ""}" data-action="compare" data-id="${escapeHTML(property.id)}" type="button" aria-pressed="${selectedForComparison}">${selectedForComparison ? "✓ Comparando" : "＋ Comparar"}</button>`}
          <button class="text-link" data-action="edit" data-id="${escapeHTML(property.id)}" type="button">Editar</button>
        </div>
      </div>
    </article>`;
}

function renderDashboard() {
  const activeProperties = state.properties.filter((property) => !["descartado", "rentado"].includes(property.status));
  const visited = state.properties.filter((property) => property.status === "visita").length;
  const rated = state.properties.filter((property) => scoreAverage(property) !== null).length;
  const top = [...activeProperties]
    .filter((property) => scoreAverage(property) !== null)
    .sort((a, b) => scoreAverage(b) - scoreAverage(a))
    .slice(0, 3);
  const next = [...activeProperties]
    .filter((property) => property.followUp)
    .sort((a, b) => (a.followUp || "").localeCompare(b.followUp || ""))
    .slice(0, 3);

  root.innerHTML = `
    <section class="page-heading">
      <div><h1>Hola, Benja y Caro <span>✳</span></h1>
      </div>
      <button class="button button-primary" data-view="form" type="button">＋ Agregar un inmueble</button>
    </section>
    <section class="stats-grid" aria-label="Resumen de la búsqueda">
      <article class="stat-card stat-card-dark"><span class="stat-icon">⌂</span><p>En seguimiento</p><strong>${activeProperties.length}</strong><small>opciones abiertas</small></article>
      <article class="stat-card"><span class="stat-icon">◷</span><p>Ya visitados</p><strong>${visited}</strong><small>visita en persona</small></article>
      <article class="stat-card"><span class="stat-icon">☆</span><p>Con calificación</p><strong>${rated}</strong><small>al menos una opinión</small></article>
    </section>
    <section class="dashboard-columns">
      <div class="content-panel">
        <div class="section-title"><div><h2>Los mejor calificados</h2></div><button class="text-link" data-view="top" type="button">Ver ranking →</button></div>
        ${top.length ? `<div class="compact-card-list">${top.map((property) => renderPropertyCard(property, true)).join("")}</div>` : `<div class="empty-inline"><span class="empty-icon">✳</span><strong>Su top 3 empieza aquí</strong><span>Califiquen sus opciones después de una visita.</span><button class="text-link" data-view="catalog" type="button">Explorar inmuebles →</button></div>`}
      </div>
      <aside class="content-panel followup-panel">
        <div class="section-title"><div><h2>Próximos pasos</h2></div></div>
        ${next.length ? `<ul class="followup-list">${next.map((property) => `<li><span class="followup-dot"></span><div><strong>${escapeHTML(property.name)}</strong><small>${escapeHTML(property.followUp)}</small></div><button class="icon-button" data-action="edit" data-id="${escapeHTML(property.id)}" aria-label="Editar próximo paso" type="button">↗</button></li>`).join("")}</ul>` : `<div class="empty-followup"><span>◷</span><p>Aquí aparecerán sus llamadas, visitas y pendientes.</p><button class="text-link" data-view="catalog" type="button">Ver catálogo →</button></div>`}
      </aside>
    </section>
    <section class="bottom-callout"><span class="callout-spark">✳</span><div><strong>¿Un nuevo prospecto?</strong></div><button class="button button-outline" data-view="form" type="button">Agregar depa <span>→</span></button></section>`;
}

function filterProperties(properties) {
  const search = document.querySelector("#catalog-search")?.value.trim().toLocaleLowerCase("es-MX") || "";
  const status = document.querySelector("#catalog-status")?.value || "";
  const minScore = numberValue(document.querySelector("#catalog-score")?.value);
  const filtered = properties.filter((property) => {
    const text = [property.name, property.cp, property.colonia, property.alcaldia, property.addressRef]
      .filter(Boolean).join(" ").toLocaleLowerCase("es-MX");
    const average = scoreAverage(property);
    return (!search || text.includes(search))
      && (!status || property.status === status)
      && (minScore === null || (average !== null && average >= minScore));
  });
  const sortBy = document.querySelector("#catalog-sort")?.value || "recent";
  const sorters = {
    recent: (a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""),
    price: (a, b) => {
      const priceA = propertyTotal(a) ?? Infinity;
      const priceB = propertyTotal(b) ?? Infinity;
      return priceA === priceB ? 0 : priceA - priceB;
    },
    area: (a, b) => (Number(b.m2) || 0) - (Number(a.m2) || 0),
    score: (a, b) => (scoreAverage(b) ?? -1) - (scoreAverage(a) ?? -1),
  };
  filtered.sort(sorters[sortBy]);
  return filtered;
}

function renderCatalog() {
  const isList = state.catalogLayout === "list";
  const options = Object.entries(STATUS_LABELS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  root.innerHTML = `
    <section class="page-heading page-heading-tight"><div><p class="eyebrow">TODAS LAS OPCIONES</p><h1>Inmuebles</h1><p class="heading-copy">Comparen lo importante y guarden cada posibilidad.</p></div><button class="button button-primary" data-view="form" type="button">＋ Agregar depa</button></section>
    <section class="catalog-toolbar">
      <label class="search-field"><span>⌕</span><input id="catalog-search" type="search" placeholder="Buscar colonia, alcaldía o nombre" aria-label="Buscar inmuebles"></label>
      <select id="catalog-status" aria-label="Filtrar por estado"><option value="">Todos los estados</option>${options}</select>
      <select id="catalog-sort" aria-label="Ordenar inmuebles"><option value="recent">Más recientes</option><option value="price">Menor precio total</option><option value="area">Mayor superficie</option><option value="score">Mejor calificación</option></select>
      <select id="catalog-score" aria-label="Filtrar por calificación"><option value="">Todas las calificaciones</option><option value="6">6 o más</option><option value="5">5 o más</option><option value="4">4 o más</option></select>
      <select id="catalog-group" aria-label="Agrupar inmuebles"><option value="">Sin agrupar</option><option value="alcaldia">Por alcaldía</option><option value="status">Por estado</option></select>
      <div class="layout-toggle" aria-label="Diseño del catálogo"><button class="${isList ? "" : "selected"}" data-layout="cards" type="button" aria-label="Vista de tarjetas">▦</button><button class="${isList ? "selected" : ""}" data-layout="list" type="button" aria-label="Vista de lista">☷</button></div>
    </section>
    <div id="catalog-results"></div>
    <div id="compare-dock" class="compare-dock" aria-live="polite"></div>`;
  const update = () => {
    const filtered = filterProperties(state.properties);
    const grouping = document.querySelector("#catalog-group").value;
    const results = document.querySelector("#catalog-results");
    const dock = document.querySelector("#compare-dock");
    root.classList.toggle("has-compare", state.compareIds.size > 0);
    dock.innerHTML = state.compareIds.size
      ? `<span><strong>${state.compareIds.size}</strong> de 4 opciones seleccionadas</span><button class="button button-primary" data-view="compare" type="button" ${state.compareIds.size < 2 ? "disabled" : ""}>Comparar seleccionadas →</button>`
      : "";
    if (!filtered.length) {
      results.innerHTML = `<div class="empty-state"><span class="empty-icon">⌕</span><h2>${state.properties.length ? "No encontramos coincidencias" : "Todavía no hay inmuebles"}</h2><p>${state.properties.length ? "Prueben cambiar los filtros." : "Agreguen el primero para empezar a comparar."}</p>${state.properties.length ? "" : '<button class="button button-primary" data-view="form" type="button">＋ Agregar depa</button>'}</div>`;
      return;
    }
    const groupLabel = (property) => grouping === "alcaldia"
      ? property.alcaldia || "Alcaldía pendiente"
      : STATUS_LABELS[property.status] || "Investigando";
    const groups = grouping
      ? [...new Set(filtered.map(groupLabel))].map((label) => [label, filtered.filter((property) => groupLabel(property) === label)])
      : [["", filtered]];
    results.innerHTML = `<p class="result-count">${filtered.length} ${filtered.length === 1 ? "inmueble" : "inmuebles"}</p>${groups.map(([label, items]) => `
      ${label ? `<div class="group-heading"><h2>${escapeHTML(label)}</h2><span>${items.length}</span></div>` : ""}
      <div class="${isList ? "property-list" : "property-grid"}">${items.map((property) => renderPropertyCard(property)).join("")}</div>`).join("")}`;
  };
  root.querySelectorAll("#catalog-search, #catalog-status, #catalog-sort, #catalog-score, #catalog-group")
    .forEach((control) => control.addEventListener("input", update));
  root.querySelectorAll("[data-layout]").forEach((button) => button.addEventListener("click", () => {
    state.catalogLayout = button.dataset.layout;
    renderCatalog();
  }));
  update();
}

function renderTop() {
  const ranked = state.properties
    .filter((property) => !["descartado", "rentado"].includes(property.status) && scoreAverage(property) !== null)
    .sort((a, b) => scoreAverage(b) - scoreAverage(a))
    .slice(0, 3);
  root.innerHTML = `
    <section class="page-heading"><div><p class="eyebrow">LA DECISIÓN DE LOS DOS</p><h1>Mejores calificadas <span>★</span></h1><p class="heading-copy">Top 3 por promedio de Benja y Caro. Si solo hay una calificación, usamos esa.</p></div><button class="button button-primary" data-view="voting" type="button">Calificar inmuebles <span>→</span></button></section>
    ${ranked.length ? `<section class="ranking-list">${ranked.map((property, index) => `
      <article class="ranking-card">
        <div class="rank-number">0${index + 1}</div>
        <div class="ranking-info"><p class="eyebrow">${escapeHTML(property.colonia || "Ubicación pendiente")} · ${escapeHTML(property.alcaldia || "CDMX")}</p><h2>${escapeHTML(property.name)}</h2><div class="ranking-meta"><span>${money(propertyTotal(property))} / mes</span><span>${property.m2 ? `${escapeHTML(property.m2)} m²` : "Metros pendientes"}</span>${statusPill(property.status)}</div></div>
        <div class="ranking-score"><strong>${scoreAverage(property).toFixed(1)}</strong><span>de 7</span><small><span class="person-benja-text">Benja ${property.ratings?.benja || "—"}</span> · <span class="person-caro-text">Caro ${property.ratings?.caro || "—"}</span></small></div>
        <button class="icon-button" data-action="edit" data-id="${escapeHTML(property.id)}" aria-label="Editar inmueble" type="button">↗</button>
      </article>`).join("")}</section>` : `<div class="empty-state"><span class="empty-icon">☆</span><h2>Su ranking está esperando</h2><p>Califiquen las opciones que ya conocen. Si falta una opinión, la propiedad aparece con la que esté disponible.</p><button class="button button-primary" data-view="voting" type="button">Dar primera calificación</button></div>`}
    <p class="ranking-footnote">Las opciones sin calificación no aparecen aquí. Las descartadas y rentadas se conservan en el catálogo, pero no compiten por el top 3.</p>`;
}

function comparisonValue(property, key) {
  const yesNo = (value) => value ? "Sí" : "No";
  const total = propertyTotal(property);
  const deposit = Number(property.deposit) || 0;
  const policyCost = Number(property.policyCost) || 0;
  const hasAmount = (value) => value !== null && value !== undefined && value !== ""
    && Number.isFinite(Number(value));
  const hasUpfrontData = total !== null || hasAmount(property.deposit) || hasAmount(property.policyCost);
  const values = {
    location: [property.colonia, property.alcaldia].filter(Boolean).join(" · ") || "—",
    status: STATUS_LABELS[property.status] || "Investigando",
    rent: money(property.rent),
    maintenance: money(property.maintenance),
    total: money(propertyTotal(property)),
    m2: property.m2 ? `${property.m2} m²` : "—",
    bedrooms: property.bedrooms ?? "—",
    bathrooms: property.bathrooms ?? "—",
    parking: property.parking ?? "—",
    deposit: money(property.deposit),
    policyCost: money(property.policyCost),
    moveInDate: property.moveInDate || "—",
    petFriendly: yesNo(property.amenities?.petFriendly),
    balcony: yesNo(property.amenities?.balcony),
    terrace: yesNo(property.amenities?.terrace),
    roof: yesNo(property.amenities?.roof),
    benja: property.ratings?.benja || "—",
    caro: property.ratings?.caro || "—",
    average: scoreAverage(property) === null ? "—" : `${scoreAverage(property).toFixed(1)} / 7`,
    upfront: money(hasUpfrontData ? (total || 0) + deposit + policyCost : null),
  };
  return values[key];
}

function renderComparison() {
  const available = state.properties.filter((property) => !["descartado", "rentado"].includes(property.status));
  const selected = available.filter((property) => state.compareIds.has(property.id));
  const rows = [
    ["location", "Ubicación"],
    ["status", "Estado"],
    ["rent", "Renta mensual"],
    ["maintenance", "Mantenimiento"],
    ["total", "Total mensual"],
    ["m2", "Superficie"],
    ["bedrooms", "Recámaras"],
    ["bathrooms", "Baños"],
    ["parking", "Estacionamientos"],
    ["deposit", "Depósito"],
    ["policyCost", "Póliza / gastos iniciales"],
    ["upfront", "Total estimado para entrar"],
    ["moveInDate", "Disponible desde"],
    ["petFriendly", "Pet friendly"],
    ["balcony", "Balcón"],
    ["terrace", "Terraza"],
    ["roof", "Roof"],
    ["benja", "Calificación Benja"],
    ["caro", "Calificación Caro"],
    ["average", "Promedio"],
  ];
  root.innerHTML = `
    <section class="page-heading page-heading-tight"><div><p class="eyebrow">DECIDAN CON LOS DATOS A LA VISTA</p><h1>Comparar inmuebles</h1><p class="heading-copy">Elijan de 2 a 4 opciones para poner precio, espacios y calificaciones lado a lado.</p></div></section>
    ${available.length ? `<section class="content-panel compare-picker">
      <div class="section-title"><div><p class="eyebrow">SUS OPCIONES</p><h2>¿Cuáles ponemos frente a frente?</h2></div><span class="compare-count">${selected.length}/4</span></div>
      <div class="compare-picker-grid">${available.map((property) => {
        const isSelected = state.compareIds.has(property.id);
        const atLimit = !isSelected && state.compareIds.size >= 4;
        return `<article class="compare-picker-card${isSelected ? " is-selected" : ""}">
          <div class="property-monogram">${escapeHTML((property.name || "D").trim().charAt(0).toUpperCase())}</div>
          <div class="compare-picker-info"><strong>${escapeHTML(property.name)}</strong><small>${escapeHTML([property.colonia, property.alcaldia].filter(Boolean).join(" · ") || "Ubicación pendiente")}</small><span>${money(propertyTotal(property))} / mes</span></div>
          <button class="button ${isSelected ? "button-primary" : "button-quiet"} compare-select-button" data-action="compare" data-id="${escapeHTML(property.id)}" type="button" aria-pressed="${isSelected}" ${atLimit ? "disabled" : ""}>${isSelected ? "✓ Elegido" : "＋ Elegir"}</button>
        </article>`;
      }).join("")}</div>
      <p class="compare-hint">${state.compareIds.size >= 4 ? "Ya eligieron 4 opciones; quiten una para agregar otra." : "Pueden seleccionar hasta cuatro. Las calificaciones aún pendientes se muestran como —."}</p>
    </section>
    ${selected.length >= 2 ? `<section class="content-panel compare-results">
      <div class="section-title"><div><p class="eyebrow">LADO A LADO</p><h2>La comparación</h2></div><button class="text-link" data-action="clear-compare" type="button">Limpiar selección</button></div>
      <p class="compare-hint">El total para entrar suma el costo mensual, depósito y póliza registrados; sirve como estimado con los datos disponibles.</p>
      <div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>Qué comparar</th>${selected.map((property) => `<th><strong>${escapeHTML(property.name)}</strong><small>${escapeHTML(property.colonia || property.alcaldia || "")}</small></th>`).join("")}</tr></thead>
      <tbody>${rows.map(([key, label]) => `<tr class="${["total", "upfront", "average"].includes(key) ? "compare-emphasis" : ""}"><th>${label}</th>${selected.map((property) => `<td class="${key === "benja" ? "person-benja-text" : ""}${key === "caro" ? " person-caro-text" : ""}">${escapeHTML(comparisonValue(property, key))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    </section>` : `<div class="compare-empty-hint"><span class="empty-icon">↔</span><p>Elijan por lo menos dos inmuebles para ver la comparación.</p></div>`}`
    : `<div class="empty-state"><span class="empty-icon">↔</span><h2>Primero agreguen inmuebles</h2><p>Cuando tengan opciones en el catálogo, podrán comparar costos, espacios y calificaciones aquí.</p><button class="button button-primary" data-view="form" type="button">＋ Agregar depa</button></div>`}`;
}

function renderVoting() {
  const options = state.properties
    .filter((property) => !["descartado", "rentado"].includes(property.status))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es-MX"))
    .map((property) => `<option value="${escapeHTML(property.id)}">${escapeHTML(property.name)} · ${escapeHTML(property.colonia || property.alcaldia || "Ubicación pendiente")}</option>`)
    .join("");
  root.innerHTML = `
    <section class="page-heading page-heading-tight"><div><p class="eyebrow">DOS OPINIONES, UNA DECISIÓN</p><h1>Calificar</h1><p class="heading-copy">Cada quien pone su propia calificación, del 1 al 7.</p></div></section>
    ${state.properties.length ? `<section class="voting-layout">
      <form class="content-panel voting-form" id="voting-form">
        <div class="section-title"><div><p class="eyebrow">NUEVA CALIFICACIÓN</p><h2>¿Qué les pareció?</h2></div><span class="person-chip person-benja-text" id="voter-chip">Benja</span></div>
        <label class="field-label">Inmueble<select name="propertyId" required>${options || '<option value="">No hay inmuebles para calificar</option>'}</select></label>
        <label class="field-label">¿Quién califica?<select name="person" required><option value="benja">Benja</option><option value="caro">Caro</option></select></label>
        <fieldset class="rating-field"><legend>Calificación</legend><div class="rating-options">${[1, 2, 3, 4, 5, 6, 7].map((score) => `<label><input type="radio" name="score" value="${score}" required><span>${score}</span></label>`).join("")}</div><div class="scale-labels"><span>No es para nosotros</span><span>¡Nos encanta!</span></div></fieldset>
        <label class="field-label">Nota opcional<textarea name="note" rows="3" maxlength="500" placeholder="¿Qué te gustó o qué te hizo dudar?"></textarea></label>
        <button class="button button-primary button-full" type="submit">Guardar calificación <span>→</span></button>
      </form>
      <aside class="content-panel voting-side"><div class="section-title"><div><p class="eyebrow">EN EQUIPO</p><h2>Cómo van</h2></div></div>
        <div class="vote-progress"><span class="avatar avatar-b">B</span><div><strong>Benja</strong><small>${state.properties.filter((p) => p.ratings?.benja).length} calificados</small></div><span class="progress-number">${state.properties.filter((p) => p.ratings?.benja).length}</span></div>
        <div class="vote-progress"><span class="avatar avatar-c">C</span><div><strong>Caro</strong><small>${state.properties.filter((p) => p.ratings?.caro).length} calificados</small></div><span class="progress-number">${state.properties.filter((p) => p.ratings?.caro).length}</span></div>
        <p class="voting-tip">Una calificación guardada actualiza la opinión de esa persona. Si todavía no hay una, la pueden dejar pendiente.</p>
      </aside>
    </section>
    <section class="content-panel voting-table-panel"><div class="section-title"><div><p class="eyebrow">VISTA RÁPIDA</p><h2>Sus opiniones</h2></div></div>
      <div class="table-wrap"><table><thead><tr><th>Inmueble</th><th>Estado</th><th>Benja</th><th>Caro</th><th>Promedio</th></tr></thead><tbody>${state.properties.map((property) => `<tr><td><strong>${escapeHTML(property.name)}</strong><small>${escapeHTML([property.colonia, property.alcaldia].filter(Boolean).join(" · "))}</small></td><td>${statusPill(property.status)}</td><td class="person-benja-text">${property.ratings?.benja || "—"}</td><td class="person-caro-text">${property.ratings?.caro || "—"}</td><td>${scoreAverage(property) === null ? "—" : scoreAverage(property).toFixed(1)}</td></tr>`).join("")}</tbody></table></div>
    </section>` : `<div class="empty-state"><span class="empty-icon">☆</span><h2>Primero agreguen una opción</h2><p>Después podrán darle a cada inmueble una calificación de Benja y otra de Caro.</p><button class="button button-primary" data-view="form" type="button">＋ Agregar depa</button></div>`}`;
  const form = root.querySelector("#voting-form");
  if (!form) return;
  const personSelect = form.querySelector('[name="person"]');
  const voterChip = form.querySelector("#voter-chip");
  personSelect.addEventListener("change", () => {
    const isCaro = personSelect.value === "caro";
    voterChip.textContent = isCaro ? "Caro" : "Benja";
    voterChip.classList.toggle("person-caro-text", isCaro);
    voterChip.classList.toggle("person-benja-text", !isCaro);
    form.classList.toggle("voting-for-caro", isCaro);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const property = state.properties.find((item) => item.id === data.get("propertyId"));
    if (!property) {
      showNotice("Seleccionen un inmueble válido antes de guardar.", "error");
      return;
    }
    const person = data.get("person");
    const updatedProperty = {
      ...property,
      ratings: { ...(property.ratings || { benja: null, caro: null }), [person]: Number(data.get("score")) },
      ratingNotes: { ...(property.ratingNotes || {}), [person]: String(data.get("note") || "").trim() },
      updatedAt: new Date().toISOString(),
    };
    const nextProperties = state.properties.map((item) => item.id === property.id ? updatedProperty : item);
    if (await persistProperty(updatedProperty, nextProperties)) {
      state.properties = nextProperties;
      showNotice(`Calificación de ${person === "benja" ? "Benja" : "Caro"} guardada.`, "success");
      renderVoting();
    }
  });
}

function alcaldiaOptions(selected = "") {
  return `<option value="">Seleccionar alcaldía</option>${ALCALDIAS.map((alcaldia) => `<option value="${escapeHTML(alcaldia)}" ${selected === alcaldia ? "selected" : ""}>${escapeHTML(alcaldia)}</option>`).join("")}`;
}

function renderPropertyForm(property = null) {
  state.editingId = property?.id || null;
  const amenities = property?.amenities || {};
  const value = (key) => escapeHTML(property?.[key] ?? "");
  const numberField = (name, label, step = "1") => `<label class="field-label">${label}<input name="${name}" type="number" min="0" step="${step}" value="${value(name)}" placeholder="0"></label>`;
  const checkbox = (name, label) => `<label class="check-option"><input name="${name}" type="checkbox" ${amenities[name] ? "checked" : ""}><span>${label}</span></label>`;
  root.innerHTML = `
    <section class="page-heading page-heading-tight"><div><p class="eyebrow">${property ? "ACTUALIZAR DETALLES" : "NUEVA OPCIÓN"}</p><h1>${property ? "Editar inmueble" : "Agregar depa"}</h1><p class="heading-copy">Guarden lo que saben hoy; siempre pueden completar lo demás después.</p></div><button class="button button-quiet" data-view="catalog" type="button">← Volver al catálogo</button></section>
    <form class="property-form" id="property-form">
      <section class="content-panel form-section"><div class="form-section-heading"><span>01</span><div><h2>Lo esencial</h2><p>¿Qué inmueble encontraron?</p></div></div>
        <div class="form-grid">
          <label class="field-label field-span-2">Nombre para identificarlo<input name="name" required maxlength="80" value="${value("name")}" placeholder="Ej. Depa luminoso en la Roma"></label>
          <label class="field-label">Código postal<input name="cp" id="property-cp" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" value="${value("cp")}" placeholder="06700"><small>Opcional. Escribe 5 dígitos para sugerir colonia y alcaldía.</small></label>
          <label class="field-label">Alcaldía<select name="alcaldia" id="property-alcaldia" required>${alcaldiaOptions(property?.alcaldia || "")}</select></label>
          <label class="field-label">Colonia<input name="colonia" id="property-colonia" required value="${value("colonia")}" placeholder="Escribe una colonia"><select id="colonia-options" aria-label="Colonias sugeridas para el código postal" hidden><option value="">Seleccionar colonia sugerida</option></select></label>
          <label class="field-label">Dirección o referencia<input name="addressRef" maxlength="180" value="${value("addressRef")}" placeholder="Calle, cruce o referencia"></label>
          <label class="field-label field-span-2">Enlace al anuncio<input name="adUrl" type="url" value="${value("adUrl")}" placeholder="https://..."></label>
        </div>
      </section>
      <section class="content-panel form-section"><div class="form-section-heading"><span>02</span><div><h2>Precio y espacios</h2><p>Comparen costo mensual total, no solo la renta.</p></div></div>
        <div class="form-grid">
          ${numberField("rent", "Renta mensual (MXN)")}
          ${numberField("maintenance", "Mantenimiento mensual (MXN)")}
          ${numberField("m2", "Metros cuadrados", "0.1")}
          ${numberField("bedrooms", "Recámaras")}
          ${numberField("bathrooms", "Baños")}
          ${numberField("parking", "Estacionamientos")}
          ${numberField("deposit", "Depósito (MXN)")}
          ${numberField("policyCost", "Póliza / gastos iniciales (MXN)")}
          <label class="field-label">Meses de contrato<input name="contractMonths" type="number" min="0" step="1" value="${value("contractMonths")}" placeholder="12"></label>
          <label class="field-label">Disponible desde<input name="moveInDate" type="date" value="${value("moveInDate")}"></label>
        </div>
        <fieldset class="amenities-field"><legend>Lo que ofrece</legend><div class="amenity-checks">${checkbox("petFriendly", "Pet friendly")}${checkbox("balcony", "Balcón")}${checkbox("terrace", "Terraza")}${checkbox("roof", "Roof")}</div></fieldset>
      </section>
      <section class="content-panel form-section"><div class="form-section-heading"><span>03</span><div><h2>Seguimiento</h2><p>En qué etapa va y qué toca hacer.</p></div></div>
        <div class="form-grid">
          <label class="field-label">Estado<select name="status">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${property?.status === key || (!property && key === "investigacion") ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          <label class="field-label">Próximo paso<input name="followUp" maxlength="100" value="${value("followUp")}" placeholder="Ej. Confirmar disponibilidad"></label>
          <label class="field-label">Fecha de visita<input name="visitDate" type="date" value="${value("visitDate")}"></label>
          <label class="field-label">Último contacto<input name="lastContact" type="date" value="${value("lastContact")}"></label>
          <label class="field-label">Tipo de contacto<select name="contactType"><option value="">Seleccionar</option><option value="inmobiliario" ${property?.contactType === "inmobiliario" ? "selected" : ""}>Asesor inmobiliario</option><option value="directo" ${property?.contactType === "directo" ? "selected" : ""}>Trato directo</option></select></label>
          <label class="field-label">Nombre del contacto<input name="contactName" maxlength="100" value="${value("contactName")}" placeholder="Nombre"></label>
          <label class="field-label">Teléfono<input name="contactPhone" type="tel" maxlength="30" value="${value("contactPhone")}" placeholder="55 0000 0000"></label>
          <label class="field-label field-span-2">Notas<textarea name="notes" rows="4" maxlength="1500" placeholder="Impresiones, requisitos, dudas...">${value("notes")}</textarea></label>
        </div>
      </section>
      <div class="form-footer"><span>Las calificaciones de Benja y Caro se guardan desde la vista Calificar.</span><div><button class="button button-quiet" data-view="catalog" type="button">Cancelar</button><button class="button button-primary" type="submit">${property ? "Guardar cambios" : "Guardar inmueble"} <span>→</span></button></div></div>
    </form>`;
  const cpInput = root.querySelector("#property-cp");
  const colonyOptions = root.querySelector("#colonia-options");
  const alcaldiaInput = root.querySelector("#property-alcaldia");
  const colonyInput = root.querySelector("#property-colonia");
  const fillPostalOptions = (showMessage = true) => {
    const cp = cpInput.value.trim();
    if (!/^\d{5}$/.test(cp)) {
      colonyOptions.hidden = true;
      colonyOptions.replaceChildren();
      return;
    }
    const match = state.postalCodes.find((record) => record.cp === cp);
    if (!match) {
      colonyOptions.hidden = true;
      colonyOptions.replaceChildren();
      if (showMessage) showNotice("Ese CP no está en el catálogo local. Completen alcaldía y colonia manualmente.", "info");
      return;
    }
    alcaldiaInput.value = match.alcaldia;
    colonyOptions.innerHTML = `<option value="">Seleccionar colonia sugerida</option>${match.colonias.map((colony) => `<option value="${escapeHTML(colony)}">${escapeHTML(colony)}</option>`).join("")}`;
    colonyOptions.hidden = false;
    if (match.colonias.includes(colonyInput.value)) colonyOptions.value = colonyInput.value;
    if (showMessage && match.colonias.length === 1) colonyInput.value = match.colonias[0];
    if (showMessage) showNotice(`${match.colonias.length} ${match.colonias.length === 1 ? "colonia sugerida" : "colonias sugeridas"} para ${cp}.`, "success");
  };
  cpInput.addEventListener("input", () => fillPostalOptions(cpInput.value.length === 5));
  cpInput.addEventListener("change", fillPostalOptions);
  colonyOptions.addEventListener("change", () => {
    if (colonyOptions.value) colonyInput.value = colonyOptions.value;
  });
  if (property?.cp) fillPostalOptions(false);
  root.querySelector("#property-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const id = property?.id || crypto.randomUUID();
    const existing = property || {};
    const next = {
      ...existing,
      id,
      name: String(formData.get("name")).trim(),
      cp: String(formData.get("cp")).trim(),
      alcaldia: String(formData.get("alcaldia")),
      colonia: String(formData.get("colonia")).trim(),
      addressRef: String(formData.get("addressRef") || "").trim(),
      adUrl: String(formData.get("adUrl") || "").trim(),
      rent: numberValue(formData.get("rent")),
      maintenance: numberValue(formData.get("maintenance")),
      m2: numberValue(formData.get("m2")),
      bedrooms: numberValue(formData.get("bedrooms")),
      bathrooms: numberValue(formData.get("bathrooms")),
      parking: numberValue(formData.get("parking")),
      deposit: numberValue(formData.get("deposit")),
      policyCost: numberValue(formData.get("policyCost")),
      contractMonths: numberValue(formData.get("contractMonths")),
      moveInDate: String(formData.get("moveInDate") || ""),
      amenities: {
        petFriendly: formData.has("petFriendly"),
        balcony: formData.has("balcony"),
        terrace: formData.has("terrace"),
        roof: formData.has("roof"),
      },
      status: String(formData.get("status")),
      followUp: String(formData.get("followUp") || "").trim(),
      visitDate: String(formData.get("visitDate") || ""),
      lastContact: String(formData.get("lastContact") || ""),
      contactType: String(formData.get("contactType") || ""),
      contactName: String(formData.get("contactName") || "").trim(),
      contactPhone: String(formData.get("contactPhone") || "").trim(),
      notes: String(formData.get("notes") || "").trim(),
      ratings: existing.ratings || { benja: null, caro: null },
      ratingNotes: existing.ratingNotes || {},
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const nextProperties = property
      ? state.properties.map((item) => item.id === property.id ? next : item)
      : [next, ...state.properties];
    if (await persistProperty(next, nextProperties)) {
      state.properties = nextProperties;
      updateCount();
      showNotice(property ? "Cambios guardados." : "Inmueble agregado al catálogo.", "success");
      navigate("catalog");
    }
  });
}

async function persistProperty(property, properties) {
  try {
    if (state.supabase) {
      const { error } = await state.supabase.from("properties").upsert({
        id: property.id,
        data: property,
        updated_at: property.updatedAt,
      }, { onConflict: "id" });
      if (error) throw error;
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(properties));
    }
    return true;
  } catch (error) {
    showNotice(`No se pudieron guardar los cambios: ${error.message}`, "error");
    return false;
  }
}

async function persistAllProperties(properties) {
  try {
    if (state.supabase) {
      const { error } = await state.supabase.rpc("replace_all_properties", { p_properties: properties });
      if (error) throw error;
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(properties));
    }
    return true;
  } catch (error) {
    showNotice(`No se pudieron importar los inmuebles: ${error.message}`, "error");
    return false;
  }
}

function updateCount() {
  document.querySelector("#nav-count").textContent = state.properties.length;
}

function navigate(view) {
  if (!VIEW_LABELS[view]) return;
  state.view = view;
  state.editingId = null;
  root.classList.remove("has-compare");
  document.querySelector("#current-section").textContent = VIEW_LABELS[view];
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === view || (view === "form" && link.dataset.view === "catalog"));
  });
  if (view === "form") renderPropertyForm();
  else renderCurrentView();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderCurrentView() {
  const view = state.view;
  if (view === "dashboard") renderDashboard();
  if (view === "catalog") renderCatalog();
  if (view === "voting") renderVoting();
  if (view === "top") renderTop();
  if (view === "compare") renderComparison();
}

function loadSupabaseLibrary() {
  if (window.supabase?.createClient) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.onload = () => window.supabase?.createClient
      ? resolve()
      : reject(new Error("La biblioteca de Supabase no está disponible."));
    script.onerror = () => reject(new Error("No se pudo descargar la biblioteca de Supabase."));
    document.head.append(script);
  });
}

function handleRootClick(event) {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    event.preventDefault();
    navigate(viewButton.dataset.view);
    return;
  }
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  if (actionButton.dataset.action === "compare") {
    const id = actionButton.dataset.id;
    if (state.compareIds.has(id)) {
      state.compareIds.delete(id);
    } else if (state.compareIds.size < 4) {
      state.compareIds.add(id);
    } else {
      showNotice("Pueden comparar hasta 4 inmuebles a la vez.", "info");
      return;
    }
    if (state.view === "catalog") renderCatalog();
    if (state.view === "compare") renderComparison();
    return;
  }
  if (actionButton.dataset.action === "clear-compare") {
    state.compareIds.clear();
    renderComparison();
    return;
  }
  const property = state.properties.find((item) => item.id === actionButton.dataset.id);
  if (!property) return;
  if (actionButton.dataset.action === "edit") {
    state.view = "form";
    document.querySelector("#current-section").textContent = "Editar inmueble";
    document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === "catalog"));
    renderPropertyForm(property);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

async function loadProperties() {
  if (state.supabase) {
    const { data, error } = await state.supabase
      .from("properties")
      .select("data")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("La respuesta de Supabase no tiene el formato esperado.");
    state.properties = data.map((row) => row.data);
    return;
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("Los datos guardados no tienen el formato esperado.");
    state.properties = parsed;
    return;
  }
  const response = await fetch("data/inmuebles.json");
  if (!response.ok) throw new Error(`No se pudo cargar data/inmuebles.json (${response.status}).`);
  const parsed = await response.json();
  if (!Array.isArray(parsed)) throw new Error("data/inmuebles.json debe contener una lista de inmuebles.");
  state.properties = parsed;
}

async function loadPostalCodes() {
  const response = await fetch("data/codigos-postales-cdmx.json");
  if (!response.ok) throw new Error(`No se pudo cargar el catálogo de códigos postales (${response.status}).`);
  const parsed = await response.json();
  if (!Array.isArray(parsed)) throw new Error("El catálogo postal debe contener una lista.");
  state.postalCodes = parsed;
}

function exportProperties() {
  const blob = new Blob([`${JSON.stringify(state.properties, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "inmuebles.json";
  link.click();
  URL.revokeObjectURL(url);
  showNotice("JSON exportado como respaldo.", "success");
}

async function importProperties(file) {
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== "object" || typeof item.name !== "string")) {
      throw new Error("El archivo debe ser un arreglo JSON de inmuebles con nombre.");
    }
    if (!window.confirm(`Se reemplazará la lista actual por ${parsed.length} inmuebles. ¿Continuar?`)) return;
    const imported = parsed.map((property) => ({
      ...property,
      id: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(property.id || "")
        ? property.id
        : crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    }));
    if (await persistAllProperties(imported)) {
      state.properties = imported;
      updateCount();
      showNotice(`${parsed.length} inmuebles importados.`, "success");
      navigate("catalog");
    }
  } catch (error) {
    showNotice(`No se pudo importar el archivo: ${error.message}`, "error");
  }
}

document.querySelectorAll("[data-view]").forEach((button) => {
  if (button.closest("#view-root")) return;
  button.addEventListener("click", () => navigate(button.dataset.view));
});
root.addEventListener("click", handleRootClick);
document.querySelector("#export-button").addEventListener("click", exportProperties);
document.querySelector("#import-file").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importProperties(file);
  event.target.value = "";
});
function showSetupScreen(message) {
  appShell.hidden = true;
  setupScreen.hidden = false;
  setupMessage.textContent = message;
}

function showApp() {
  setupScreen.hidden = true;
  appShell.hidden = false;
}

function subscribeToSharedProperties() {
  if (state.realtimeChannel) return;
  state.realtimeChannel = state.supabase
    .channel("depas-properties")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "properties",
    }, () => refreshSharedProperties())
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        showNotice("No se pudo activar la actualización en vivo. Recarguen la página para ver cambios recientes.", "error");
      }
    });
}

async function refreshSharedProperties() {
  if (state.remoteRefreshPromise) return state.remoteRefreshPromise;
  state.remoteRefreshPromise = (async () => {
    try {
      await loadProperties();
      updateCount();
      if (state.view === "form" || state.view === "voting") {
        showNotice("La lista compartida cambió. Vuelvan al catálogo o a calificar para ver la versión actualizada.");
      } else {
        renderCurrentView();
      }
    } catch (error) {
      showNotice(`No se pudo actualizar la lista compartida: ${error.message}`, "error");
    } finally {
      state.remoteRefreshPromise = null;
    }
  })();
  return state.remoteRefreshPromise;
}

async function initialize() {
  try {
    await loadPostalCodes();
  } catch (error) {
    showNotice(`${error.message} La alcaldía y colonia se pueden completar manualmente.`, "error");
  }

  const config = window.DEPAS_CONFIG || {};
  const hasSupabaseUrl = Boolean(config.supabaseUrl);
  const hasSupabaseKey = Boolean(config.supabaseAnonKey);

  if (!config.sharedMode && !hasSupabaseUrl && !hasSupabaseKey) {
    try {
      await loadProperties();
    } catch (error) {
      showSetupScreen(`${error.message} Abran la página desde un servidor local (ver README).`);
      return;
    }
    showApp();
    updateCount();
    navigate("dashboard");
    return;
  }

  if (!hasSupabaseUrl || !hasSupabaseKey) {
    showSetupScreen("Falta configurar la URL y la clave pública de Supabase en config.js.");
    return;
  }
  try {
    await loadSupabaseLibrary();
  } catch (error) {
    showSetupScreen(`No se pudo cargar la conexión con Supabase: ${error.message}`);
    return;
  }

  try {
    state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await loadProperties();
    updateCount();
    showApp();
    subscribeToSharedProperties();
    navigate("dashboard");
  } catch (error) {
    showSetupScreen(`No se pudo conectar con Supabase: ${error.message}`);
  }
}

initialize();

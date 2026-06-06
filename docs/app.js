const GITHUB_API_URL   = 'https://api.github.com/repos/kikedev64/Kai-IA/releases';
const GITHUB_DL_BASE   = 'https://github.com/kikedev64/Kai-IA/releases/download';
const FETCH_TIMEOUT_MS = 5000;

const STATIC_RELEASES = [
  {
    tag_name: 'v1.0.1',
    published_at: '2025-05-16T21:58:00Z',
    html_url: 'https://github.com/kikedev64/Kai-IA/releases/tag/v1.0.1',
    body: 'Mejoras de estabilidad y rendimiento.\n• Backend actualizado con correcciones de errores.\n• Paquete completo con frontend y backend incluidos.',
    assets: [
      { name: 'kai-ia-complete-v1.0.1.zip',               size: 165674598, browser_download_url: `${GITHUB_DL_BASE}/v1.0.1/kai-ia-complete-v1.0.1.zip` },
      { name: 'kai-ia-front-windows-unpacked-v1.0.1.zip', size: 164495360, browser_download_url: `${GITHUB_DL_BASE}/v1.0.1/kai-ia-front-windows-unpacked-v1.0.1.zip` },
      { name: 'kai-ia-backend-v1.0.1.zip',                size: 1019904,   browser_download_url: `${GITHUB_DL_BASE}/v1.0.1/kai-ia-backend-v1.0.1.zip` },
    ],
  },
  {
    tag_name: 'v1.0.0',
    published_at: '2025-05-16T17:30:00Z',
    html_url: 'https://github.com/kikedev64/Kai-IA/releases/tag/v1.0.0',
    body: 'Primera versión pública de Kai IA.\n• Integración completa con Gmail, Calendar, Drive y Tasks.\n• Chat con IA local mediante LM Studio.\n• Interfaz de escritorio con Electron.',
    assets: [
      { name: 'kai-ia-front-win-unpacked-v1.0.0.zip',  size: 164495360, browser_download_url: `${GITHUB_DL_BASE}/v1.0.0/kai-ia-front-win-unpacked-v1.0.0.zip` },
      { name: 'kai-ia-backend-source-v1.0.0.zip',      size: 88064,     browser_download_url: `${GITHUB_DL_BASE}/v1.0.0/kai-ia-backend-source-v1.0.0.zip` },
    ],
  },
];

const navbar    = document.getElementById('navbar');
const hamburger = document.getElementById('hamburger');
const navMobile = document.getElementById('nav-mobile');

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

hamburger.addEventListener('click', () => {
  const open = hamburger.classList.toggle('open');
  navMobile.classList.toggle('open', open);
  hamburger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
});

navMobile.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    hamburger.classList.remove('open');
    navMobile.classList.remove('open');
  });
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === target));
    document.querySelectorAll('.screenshot-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === target));
  });
});

document.getElementById('footer-year').textContent = new Date().getFullYear();

/**
 * Formats a byte count into a compact download-size label.
 *
 * @param {number} bytes - File size in bytes.
 * @returns {string} Human-readable size in KB or MB, or an empty string when no size is available.
 */
function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formats an ISO date string for the Spanish landing page locale.
 *
 * @param {string} iso - ISO date string returned by GitHub or the static fallback.
 * @returns {string} Localized publication date.
 */
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-ES', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

/**
 * Infers the platform metadata used to render a release asset.
 *
 * @param {string} name - Release asset filename.
 * @returns {{ label: string, icon: string, cls: string }} Display label, icon, and CSS class for the asset.
 */
function detectAsset(name) {
  const n = name.toLowerCase();
  if (n.includes('complete'))                                                                   return { label: 'Paquete Completo',   icon: '📦', cls: 'pkg'    };
  if (n.includes('backend') && !n.includes('source'))                                          return { label: 'Backend (Servidor)', icon: '⚙️', cls: 'source' };
  if (n.includes('source'))                                                                     return { label: 'Código Fuente',       icon: '📄', cls: 'source' };
  if (n.includes('win') || n.includes('windows') || n.endsWith('.exe') || n.endsWith('.msi')) return { label: 'Windows',             icon: '🪟', cls: 'win'    };
  if (n.includes('mac') || n.includes('darwin') || n.includes('osx') || n.endsWith('.dmg'))   return { label: 'macOS',               icon: '🍎', cls: 'mac'    };
  if (n.includes('linux') || n.endsWith('.appimage') || n.endsWith('.deb') || n.endsWith('.rpm') || n.endsWith('.tar.gz'))
                                                                                                return { label: 'Linux',              icon: '🐧', cls: 'linux'  };
  return { label: 'Descarga', icon: '⬇️', cls: 'pkg' };
}

/**
 * Converts a small, trusted subset of Markdown into sanitized HTML.
 *
 * @param {string} text - Markdown release notes.
 * @returns {string} Escaped HTML with basic formatting and links.
 */
function mdToSafeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>')
    .replace(/^[-*]\s+/gm, '• ');
}

/**
 * Builds the HTML row for one downloadable release asset.
 *
 * @param {{ name: string, size: number, browser_download_url: string }} asset - GitHub release asset.
 * @returns {string} Asset row markup.
 */
function buildAssetRow(asset) {
  const { label, icon, cls } = detectAsset(asset.name);
  const size = formatBytes(asset.size);
  return `
    <div class="asset-row">
      <div class="asset-platform">
        <div class="platform-icon ${cls}">${icon}</div>
        <div class="asset-name-wrap">
          <div class="asset-filename" title="${asset.name}">${asset.name}</div>
          <div class="asset-size">${size ? `${size} · ` : ''}${label}</div>
        </div>
      </div>
      <a class="asset-download" href="${asset.browser_download_url}" download aria-label="Descargar ${asset.name}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Descargar
      </a>
    </div>`;
}

/**
 * Builds the collapsible card markup for one release.
 *
 * @param {{ tag_name: string, published_at?: string, created_at?: string, body?: string, html_url: string, assets?: Array<object> }} release - GitHub release data.
 * @param {boolean} isLatest - Whether the release should be highlighted and opened by default.
 * @returns {string} Release card markup.
 */
function buildReleaseCard(release, isLatest) {
  const assets = (release.assets || []).filter(a => !a.name.endsWith('.json'));
  const date   = formatDate(release.published_at || release.created_at);
  const notes  = mdToSafeHtml(release.body);

  const assetsHtml = assets.length
    ? assets.map(buildAssetRow).join('')
    : `<p style="font-size:14px;color:var(--text-muted);padding:4px 0;">
         No hay archivos adjuntos.
         <a href="${release.html_url}" target="_blank" rel="noopener" style="color:var(--accent);">Ver en GitHub ↗</a>
       </p>`;

  return `
    <div class="release-card${isLatest ? ' latest open' : ''}">
      <div class="release-header" role="button" tabindex="0" aria-expanded="${isLatest}">
        <span class="release-tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
          ${release.tag_name}
        </span>
        ${isLatest ? '<span class="release-latest-badge">Última versión</span>' : ''}
        <span class="release-date">${date}</span>
        <svg class="release-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="release-body">
        <div class="release-assets">
          <p class="release-assets-title">Archivos de descarga</p>
          ${assetsHtml}
        </div>
        ${notes ? `
          <div class="release-notes">
            <p class="release-notes-title">Notas de la versión</p>
            <div class="release-notes-body">${notes}</div>
          </div>` : ''}
      </div>
    </div>`;
}

/**
 * Enables click and keyboard interaction for release accordion headers.
 *
 * @returns {void}
 */
function attachReleaseToggles() {
  document.querySelectorAll('.release-header').forEach(header => {
    const toggle = () => {
      const card   = header.closest('.release-card');
      const isOpen = card.classList.toggle('open');
      header.setAttribute('aria-expanded', isOpen);
    };
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}

/**
 * Reveals the downloads call-to-action after releases have been rendered.
 *
 * @returns {void}
 */
function showCta() {
  document.getElementById('downloads-cta').hidden = false;
}

/**
 * Renders the provided release list and wires the generated controls.
 *
 * @param {Array<object>} releases - Releases to display.
 * @returns {void}
 */
function renderReleases(releases) {
  document.getElementById('releases-list').innerHTML =
    releases.map((r, i) => buildReleaseCard(r, i === 0)).join('');
  attachReleaseToggles();
  showCta();
}

/**
 * Shows the static fallback releases and the connection warning banner.
 *
 * @returns {void}
 */
function showFallback() {
  document.getElementById('releases-warn').hidden = false;
  renderReleases(STATIC_RELEASES);
}

/**
 * Loads public releases from GitHub and falls back to bundled release data when the API is unavailable.
 *
 * @returns {Promise<void>} Resolves after the downloads UI has been updated.
 */
async function loadReleases() {
  const loading    = document.getElementById('releases-loading');
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(GITHUB_API_URL, {
      signal:  controller.signal,
      headers: { Accept: 'application/vnd.github.v3+json' },
    });

    clearTimeout(timeoutId);
    loading.hidden = true;

    if (!res.ok) {
      showFallback();
      return;
    }

    const releases = await res.json();

    if (!Array.isArray(releases) || releases.length === 0) {
      showFallback();
      return;
    }

    renderReleases(releases);

  } catch {
    clearTimeout(timeoutId);
    loading.hidden = true;
    showFallback();
  }
}

document.addEventListener('DOMContentLoaded', loadReleases);
